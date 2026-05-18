import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, TextInput, Image, Alert,
    KeyboardAvoidingView, Platform, ActivityIndicator, Modal
} from 'react-native';
import { Audio } from 'expo-av';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { sendLocalNotification } from '../utils/notifications';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

export default function MessagesScreen() {
    const C = useTheme();
    const { user } = useAuthStore();
    const [view, setView] = useState('list');
    const [conversations, setConversations] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [playingId, setPlayingId] = useState(null);
    const [sharingLocation, setSharingLocation] = useState(false);
    const durationTimer = useRef(null);
    const soundRef = useRef(null);
    const flatListRef = useRef(null);
    const channelRef = useRef(null);
    const locationWatcher = useRef(null);
    const locationMsgId = useRef(null);

    useEffect(() => {
        fetchConversations();
    }, []);

    useEffect(() => {
        if (selectedUser) {
            fetchMessages(selectedUser.id);
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            channelRef.current = subscribeToMessages(selectedUser.id);
        }
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [selectedUser]);

    const fetchConversations = async () => {
        setLoading(true);
        try {
            const { data: msgs } = await supabase.from('messages').select('*')
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .order('created_at', { ascending: false });
            if (msgs && msgs.length > 0) {
                const otherIds = [...new Set(msgs.map(m => m.sender_id === user.id ? m.receiver_id : m.sender_id))];
                const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, full_name').in('id', otherIds);
                const pm = {};
                if (profiles) profiles.forEach(p => { pm[p.id] = p; });
                const seen = new Set();
                const convos = [];
                msgs.forEach(msg => {
                    const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
                    if (!seen.has(otherId) && pm[otherId]) {
                        seen.add(otherId);
                        convos.push({ ...pm[otherId], lastMessage: msg });
                    }
                });
                setConversations(convos);
            } else setConversations([]);
        } catch (e) { console.log('fetchConversations error:', e.message); }
        setLoading(false);
    };

    const fetchMessages = async (otherId) => {
        const { data } = await supabase.from('messages').select('*')
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: true });
        if (data) setMessages(data);
    };

    const subscribeToMessages = (otherId) => {
        const channel = supabase.channel(`msgs_${user.id}_${otherId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                const relevant = (msg.sender_id === user.id && msg.receiver_id === otherId) ||
                    (msg.sender_id === otherId && msg.receiver_id === user.id);
                if (relevant) {
                    setMessages(prev => {
                        if (prev.find(m => m.id === msg.id)) return prev;
                        return [...prev, msg];
                    });
                    if (msg.sender_id !== user.id) {
                        sendLocalNotification('New Message 💬', msg.content || '🎤 Voice message');
                        fetchConversations();
                    }
                }
            }).subscribe();
        return channel;
    };

    const searchUsers = async (q) => {
        setSearchQuery(q);
        if (!q.trim() || q.length < 2) { setSearchResults([]); return; }
        setSearching(true);
        const { data } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
            .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq('id', user.id).limit(15);
        if (data) setSearchResults(data);
        setSearching(false);
    };

    const openChat = (otherUser) => {
        setSelectedUser(otherUser);
        setView('chat');
        setSearchQuery('');
        setSearchResults([]);
    };

    const sendMessage = async (content, extra = {}) => {
        if (!content.trim() && !extra.audio_url && !extra.location_url && !extra.file_url) return;
        setSending(true);
        const tempId = `temp_${Date.now()}`;
        const opt = {
            id: tempId, sender_id: user.id, receiver_id: selectedUser.id,
            content: content.trim() || extra.content || '',
            created_at: new Date().toISOString(), ...extra,
        };
        setMessages(prev => [...prev, opt]);
        setNewMessage('');
        const { data, error } = await supabase.from('messages').insert([{
            sender_id: user.id, receiver_id: selectedUser.id,
            content: content.trim() || extra.content || '',
            audio_url: extra.audio_url || null,
            file_url: extra.file_url || null,
            file_name: extra.file_name || null,
        }]).select().single();
        if (error) setMessages(prev => prev.filter(m => m.id !== tempId));
        else {
            setMessages(prev => prev.map(m => m.id === tempId ? data : m));
            fetchConversations();
        }
        setSending(false);
    };

    //Voice recording//
    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed'); return; }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            setRecording(rec);
            setIsRecording(true);
            setRecordingDuration(0);
            durationTimer.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
        } catch (e) { Alert.alert('Error', 'Could not start recording.'); }
    };

    const stopAndSendRecording = async () => {
        if (!recording) return;
        clearInterval(durationTimer.current);
        setIsRecording(false);
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            const dur = recordingDuration;
            setRecording(null);
            setRecordingDuration(0);
            if (!uri || dur < 1) return;
            const tempId = `temp_voice_${Date.now()}`;
            setMessages(prev => [...prev, {
                id: tempId, sender_id: user.id, receiver_id: selectedUser.id,
                content: '🎤 Voice message', audio_url: uri,
                created_at: new Date().toISOString(),
            }]);
            const res = await fetch(uri);
            const blob = await res.blob();
            const ab = await new Response(blob).arrayBuffer();
            const fileName = `voice/${user.id}_${Date.now()}.m4a`;
            const { error } = await supabase.storage.from('media').upload(fileName, ab, { contentType: 'audio/m4a', upsert: true });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, audio_url: urlData.publicUrl } : m));
            await supabase.from('messages').insert([{
                sender_id: user.id, receiver_id: selectedUser.id,
                content: '🎤 Voice message', audio_url: urlData.publicUrl,
            }]);
            fetchConversations();
        } catch (e) { Alert.alert('Error', e.message); }
    };

    const cancelRecording = async () => {
        if (!recording) return;
        clearInterval(durationTimer.current);
        setIsRecording(false);
        await recording.stopAndUnloadAsync();
        setRecording(null);
        setRecordingDuration(0);
    };

    const playAudio = async (url, id) => {
        try {
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
                if (playingId === id) { setPlayingId(null); return; }
            }
            setPlayingId(id);
            const { sound } = await Audio.Sound.createAsync({ uri: url });
            soundRef.current = sound;
            await sound.playAsync();
            sound.setOnPlaybackStatusUpdate(s => { if (s.didJustFinish) { setPlayingId(null); soundRef.current = null; } });
        } catch (e) { setPlayingId(null); }
    };

    //Live location sharing//
    const shareLocation = async () => {
        if (sharingLocation) {
            stopSharingLocation();
            return;
        }
        setSharingLocation(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Location access required to share live location.');
                setSharingLocation(false);
                return;
            }

            // Get initial location and send first message//
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const lat = loc.coords.latitude;
            const lng = loc.coords.longitude;
            const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
            const content = `📍 Live Location: ${mapsUrl}`;

            const { data: msg } = await supabase.from('messages').insert([{
                sender_id: user.id, receiver_id: selectedUser.id, content,
            }]).select().single();
            if (msg) {
                locationMsgId.current = msg.id;
                setMessages(prev => [...prev, msg]);
            }

            // Watch position and update every 10 seconds//
            locationWatcher.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 5 },
                async (newLoc) => {
                    const newLat = newLoc.coords.latitude;
                    const newLng = newLoc.coords.longitude;
                    const newUrl = `https://maps.google.com/?q=${newLat},${newLng}`;
                    const newContent = `📍 Live Location: ${newUrl}`;
                    if (locationMsgId.current) {
                        await supabase.from('messages').update({ content: newContent }).eq('id', locationMsgId.current);
                        setMessages(prev => prev.map(m => m.id === locationMsgId.current ? { ...m, content: newContent } : m));
                    }
                }
            );

            Alert.alert('Live Location Active 📍', 'Your location is being shared. Tap the location button again to stop.', [{ text: 'OK' }]);
        } catch (e) {
            Alert.alert('Error', 'Could not share location.');
            setSharingLocation(false);
        }
    };

    const stopSharingLocation = () => {
        if (locationWatcher.current) {
            locationWatcher.current.remove();
            locationWatcher.current = null;
        }
        locationMsgId.current = null;
        setSharingLocation(false);
    };

    useEffect(() => {
        return () => stopSharingLocation();
    }, [selectedUser]);

    //Share file//
    const shareFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
            if (result.canceled) return;
            const file = result.assets[0];
            const tempId = `temp_file_${Date.now()}`;
            setMessages(prev => [...prev, {
                id: tempId, sender_id: user.id, receiver_id: selectedUser.id,
                content: file.name, file_url: file.uri, file_name: file.name,
                created_at: new Date().toISOString(),
            }]);
            const res = await fetch(file.uri);
            const blob = await res.blob();
            const ab = await new Response(blob).arrayBuffer();
            const fileName = `files/${user.id}_${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('media').upload(fileName, ab, { contentType: file.mimeType || 'application/octet-stream', upsert: true });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, file_url: urlData.publicUrl } : m));
            await supabase.from('messages').insert([{
                sender_id: user.id, receiver_id: selectedUser.id,
                content: file.name, file_url: urlData.publicUrl, file_name: file.name,
            }]);
            fetchConversations();
        } catch (e) { Alert.alert('Error', e.message); }
    };

    const formatDuration = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const renderMessage = ({ item }) => {
        const isOwn = item.sender_id === user.id;

        // Location message//
        if (item.content?.startsWith('📍 Live Location:')) {
            const url = item.content.replace('📍 Live Location: ', '');
            return (
                <TouchableOpacity
                    style={[styles.bubble, isOwn ? [styles.ownBubble, { backgroundColor: C.primary }] : [styles.otherBubble, { backgroundColor: C.surface, borderColor: C.border }]]}
                    onPress={() => Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Maps.'))}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Ionicons name="location" size={18} color={isOwn ? '#fff' : C.primary} />
                        <Text style={[styles.msgText, { color: isOwn ? '#fff' : C.text, fontWeight: '700' }]}>{'Live Location'}</Text>
                    </View>
                    <Text style={{ color: isOwn ? 'rgba(255,255,255,0.8)' : C.textSecondary, fontSize: 12 }}>{'Tap to open in Google Maps'}</Text>
                </TouchableOpacity>
            );
        }

        // File message//
        if (item.file_url) {
            return (
                <TouchableOpacity
                    style={[styles.bubble, isOwn ? [styles.ownBubble, { backgroundColor: C.primary }] : [styles.otherBubble, { backgroundColor: C.surface, borderColor: C.border }]]}
                    onPress={() => Linking.openURL(item.file_url).catch(() => Alert.alert('Error', 'Could not open file.'))}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="document-outline" size={24} color={isOwn ? '#fff' : C.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.msgText, { color: isOwn ? '#fff' : C.text, fontWeight: '600' }]} numberOfLines={1}>{item.file_name || item.content || 'File'}</Text>
                            <Text style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : C.textMuted, fontSize: 11, marginTop: 2 }}>{'Tap to open'}</Text>
                        </View>
                        <Ionicons name="download-outline" size={18} color={isOwn ? 'rgba(255,255,255,0.7)' : C.textMuted} />
                    </View>
                </TouchableOpacity>
            );
        }

        // Voice message//
        if (item.audio_url) {
            return (
                <TouchableOpacity
                    style={[styles.bubble, isOwn ? [styles.ownBubble, { backgroundColor: C.primary }] : [styles.otherBubble, { backgroundColor: C.surface, borderColor: C.border }], { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150 }]}
                    onPress={() => playAudio(item.audio_url, item.id)}
                >
                    <Ionicons name={playingId === item.id ? 'pause-circle' : 'play-circle'} size={28} color={isOwn ? '#fff' : C.primary} />
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        {[...Array(12)].map((_, i) => (
                            <View key={i} style={{ width: 3, borderRadius: 2, height: 6 + Math.sin(i * 0.8) * 8, backgroundColor: isOwn ? 'rgba(255,255,255,0.7)' : C.primaryLight }} />
                        ))}
                    </View>
                    <Ionicons name="mic" size={14} color={isOwn ? 'rgba(255,255,255,0.7)' : C.textMuted} />
                </TouchableOpacity>
            );
        }

        return (
            <View style={[styles.bubble, isOwn ? [styles.ownBubble, { backgroundColor: C.primary }] : [styles.otherBubble, { backgroundColor: C.surface, borderColor: C.border }]]}>
                <Text style={[styles.msgText, { color: isOwn ? '#fff' : C.text }]}>{item.content}</Text>
            </View>
        );
    };

    //SEARCH VIEW//
    if (view === 'search') {
        return (
            <View style={[styles.container, { backgroundColor: C.background }]}>
                <StatusBar style="light" />
                <View style={[styles.header, { borderBottomColor: C.border }]}>
                    <TouchableOpacity onPress={() => { setView('list'); setSearchQuery(''); setSearchResults([]); }}>
                        <Ionicons name="arrow-back" size={22} color={C.text} />
                    </TouchableOpacity>
                    <TextInput
                        style={[styles.searchInput, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
                        placeholder="Search users to message..."
                        placeholderTextColor={C.textMuted}
                        value={searchQuery} onChangeText={searchUsers} autoFocus
                    />
                </View>
                {searching ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : (
                    <FlatList
                        data={searchResults}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={[styles.convoItem, { borderBottomColor: C.border }]} onPress={() => openChat(item)}>
                                <View style={[styles.convoAvatar, { backgroundColor: C.card }]}>
                                    {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.convoAvatarImg} />
                                        : <Text style={[styles.convoAvatarText, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>}
                                </View>
                                <View style={styles.convoInfo}>
                                    <Text style={[styles.convoName, { color: C.text }]}>{item.full_name}</Text>
                                    <Text style={[styles.convoLast, { color: C.textMuted }]}>@{item.username}</Text>
                                </View>
                                <Ionicons name="chatbubble-outline" size={20} color={C.primary} />
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={searchQuery.length > 1 ? <Text style={{ color: C.textSecondary, textAlign: 'center', marginTop: 40 }}>No users found</Text> : null}
                    />
                )}
            </View>
        );
    }

    //CHAT VIEW//
    if (view === 'chat' && selectedUser) {
        return (
            <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <StatusBar style="light" />
                <View style={[styles.header, { borderBottomColor: C.border }]}>
                    <TouchableOpacity onPress={() => { setView('list'); setSelectedUser(null); setMessages([]); }}>
                        <Ionicons name="arrow-back" size={22} color={C.text} />
                    </TouchableOpacity>
                    <View style={[styles.convoAvatar, { backgroundColor: C.card, marginLeft: 8 }]}>
                        {selectedUser.avatar_url ? <Image source={{ uri: selectedUser.avatar_url }} style={styles.convoAvatarImg} />
                            : <Text style={[styles.convoAvatarText, { color: C.primaryLight }]}>{selectedUser.username?.[0]?.toUpperCase()}</Text>}
                    </View>
                    <Text style={[styles.chatName, { color: C.text }]}>@{selectedUser.username}</Text>
                    <TouchableOpacity onPress={shareLocation} style={{ marginLeft: 'auto', padding: 6 }}>
                        <Ionicons
                            name={sharingLocation ? 'location' : 'location-outline'}
                            size={22}
                            color={sharingLocation ? '#ef4444' : C.primary}
                        />
                    </TouchableOpacity>
                </View>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.id?.toString()}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.msgList}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    showsVerticalScrollIndicator={false}
                />

                <View style={[styles.inputBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
                    {isRecording ? (
                        <View style={[styles.recordingBar, { backgroundColor: C.card, borderColor: COLORS.error }]}>
                            <TouchableOpacity onPress={cancelRecording}>
                                <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                            </TouchableOpacity>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={styles.recordingDot} />
                                <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
                            </View>
                            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: C.primary }]} onPress={stopAndSendRecording}>
                                <Ionicons name="send" size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity onPress={shareFile} style={styles.iconBtn2}>
                                <Ionicons name="attach-outline" size={22} color={C.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                                style={[styles.msgInput, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
                                placeholder="Message..." placeholderTextColor={C.textMuted}
                                value={newMessage} onChangeText={setNewMessage} multiline maxLength={500}
                            />
                            {newMessage.trim() ? (
                                <TouchableOpacity style={[styles.sendBtn, { backgroundColor: C.primary }]} onPress={() => sendMessage(newMessage)} disabled={sending}>
                                    {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.iconBtn2} onPress={startRecording}>
                                    <Ionicons name="mic-outline" size={22} color={C.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        );
    }

    // LIST VIEW//
    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <Text style={[styles.headerTitle, { color: C.text }]}>Messages</Text>
                <TouchableOpacity onPress={() => setView('search')} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={24} color={C.textSecondary} />
                </TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> :
                conversations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="chatbubbles-outline" size={48} color={C.textMuted} />
                        <Text style={[styles.emptyText, { color: C.text }]}>No messages yet</Text>
                        <TouchableOpacity style={[styles.startBtn, { backgroundColor: C.primary }]} onPress={() => setView('search')}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Start a Conversation</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={conversations}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={[styles.convoItem, { borderBottomColor: C.border }]} onPress={() => openChat(item)}>
                                <View style={[styles.convoAvatar, { backgroundColor: C.card }]}>
                                    {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.convoAvatarImg} />
                                        : <Text style={[styles.convoAvatarText, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>}
                                </View>
                                <View style={styles.convoInfo}>
                                    <Text style={[styles.convoName, { color: C.text }]}>@{item.username}</Text>
                                    <Text style={[styles.convoLast, { color: C.textMuted }]} numberOfLines={1}>
                                        {item.lastMessage?.audio_url ? '🎤 Voice' : item.lastMessage?.file_url ? '📎 File' : item.lastMessage?.content?.startsWith('📍') ? '📍 Location' : item.lastMessage?.content}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                )
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, gap: 10 },
    headerTitle: { fontSize: 22, fontWeight: '700', flex: 1 },
    searchInput: { flex: 1, height: 40, borderRadius: RADIUS.full, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
    chatName: { fontWeight: '700', fontSize: 16, flex: 1 },
    convoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    convoAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    convoAvatarImg: { width: 46, height: 46, borderRadius: 23 },
    convoAvatarText: { fontWeight: '700', fontSize: 18 },
    convoInfo: { flex: 1 },
    convoName: { fontWeight: '600', fontSize: 15 },
    convoLast: { fontSize: 13, marginTop: 2 },
    msgList: { paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
    bubble: { maxWidth: '75%', borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    ownBubble: { alignSelf: 'flex-end' },
    otherBubble: { alignSelf: 'flex-start', borderWidth: 1 },
    msgText: { fontSize: 15, lineHeight: 21 },
    inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, gap: 8 },
    iconBtn2: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    msgInput: { flex: 1, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 8, fontSize: 15, maxHeight: 100, borderWidth: 1 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    recordingBar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, gap: 10 },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
    recordingText: { color: COLORS.error, fontWeight: '600', fontSize: 14 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 18, fontWeight: '700' },
    startBtn: { borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    iconBtn: { padding: 6 },
});