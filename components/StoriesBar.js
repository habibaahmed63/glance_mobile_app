import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Image, Modal, Dimensions,
    Animated, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function StoriesBar({ themeColors }) {
    const C = themeColors || COLORS;
    const { user } = useAuthStore();
    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cameraVisible, setCameraVisible] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState('back');
    const [capturedPhoto, setCapturedPhoto] = useState(null);
    const [uploading, setUploading] = useState(false);
    const cameraRef = useRef(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewingGroup, setViewingGroup] = useState(null);
    const [viewingIndex, setViewingIndex] = useState(0);
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const progressTimer = useRef(null);

    useEffect(() => { loadStories(); }, []);

    const loadStories = async () => {
        setLoading(true);
        try {
            const now = new Date().toISOString();
            // Fetch stories without join//
            const { data, error } = await supabase
                .from('stories')
                .select('id, user_id, image_url, expires_at, created_at')
                .gt('expires_at', now)
                .order('created_at', { ascending: false });

            if (error) { console.log('Stories error:', error.message); setLoading(false); return; }
            if (!data || data.length === 0) { setStories([]); setLoading(false); return; }

            // Fetch profiles separately//
            const userIds = [...new Set(data.map(s => s.user_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', userIds);

            const profileMap = {};
            if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });


            const map = {};
            data.forEach(s => {
                if (!map[s.user_id]) {
                    map[s.user_id] = {
                        user_id: s.user_id,
                        username: profileMap[s.user_id]?.username,
                        avatar_url: profileMap[s.user_id]?.avatar_url,
                        isOwn: s.user_id === user.id,
                        stories: [],
                    };
                }
                map[s.user_id].stories.push(s);
            });

            const grouped = Object.values(map).sort((a, b) => b.isOwn - a.isOwn);
            setStories(grouped);
        } catch (e) {
            console.log('loadStories error:', e.message);
        }
        setLoading(false);
    };

    const takePhoto = async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            const manip = await ImageManipulator.manipulateAsync(
                photo.uri, [{ resize: { width: 1080 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
            );
            setCapturedPhoto(manip.uri);
        } catch (e) { Alert.alert('Error', 'Failed to take photo'); }
    };

    const uploadStory = async () => {
        if (!capturedPhoto) return;
        setUploading(true);
        try {
            const res = await fetch(capturedPhoto);
            const blob = await res.blob();
            const ab = await new Response(blob).arrayBuffer();
            const fileName = `stories/${user.id}_${Date.now()}.jpg`;
            const { error: upErr } = await supabase.storage.from('media')
                .upload(fileName, ab, { contentType: 'image/jpeg', upsert: true });
            if (upErr) throw upErr;

            const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const { error: insertErr } = await supabase.from('stories').insert([{
                user_id: user.id,
                image_url: urlData.publicUrl,
                expires_at: expiresAt,
            }]);
            if (insertErr) throw insertErr;

            setCapturedPhoto(null);
            setCameraVisible(false);
            await loadStories();
            Alert.alert('Story posted! ✨', 'Your story will disappear in 24 hours.');
        } catch (e) {
            Alert.alert('Error', e.message || 'Upload failed');
        }
        setUploading(false);
    };

    const openViewer = (group) => {
        setViewingGroup(group);
        setViewingIndex(0);
        setViewerVisible(true);
        startProgress();
    };

    const startProgress = () => {
        progressAnim.setValue(0);
        if (progressTimer.current) progressTimer.current.stop();
        progressTimer.current = Animated.timing(progressAnim, {
            toValue: 1, duration: 5000, useNativeDriver: false,
        });
        progressTimer.current.start(({ finished }) => { if (finished) nextStory(); });
    };

    const nextStory = () => {
        if (!viewingGroup) return;
        if (viewingIndex < viewingGroup.stories.length - 1) {
            setViewingIndex(i => i + 1);
            startProgress();
        } else {
            closeViewer();
        }
    };

    const prevStory = () => {
        if (viewingIndex > 0) { setViewingIndex(i => i - 1); startProgress(); }
    };

    const closeViewer = () => {
        if (progressTimer.current) progressTimer.current.stop();
        setViewerVisible(false);
        setViewingGroup(null);
        setViewingIndex(0);
        setReplyText('');
    };

    const sendReply = async () => {
        if (!replyText.trim() || !viewingGroup || viewingGroup.isOwn) return;
        setSendingReply(true);
        await supabase.from('messages').insert([{
            sender_id: user.id,
            receiver_id: viewingGroup.user_id,
            content: `↩ Replied to your story: "${replyText.trim()}"`,
        }]);
        setReplyText('');
        setSendingReply(false);
        Alert.alert('Sent! 💬', `Reply sent to @${viewingGroup.username}`);
    };

    const handleAvatarPress = (group) => {
        if (group.isOwn && group.stories.length > 0) {
            openViewer(group);
        } else if (group.isOwn) {
            setCameraVisible(true);
        } else {
            openViewer(group);
        }
    };

    return (
        <>
            <View style={[styles.bar, { backgroundColor: C.background, borderBottomColor: C.border }]}>
                {/* Add story */}
                <TouchableOpacity style={styles.bubble} onPress={() => {
                    if (!permission?.granted) requestPermission();
                    setCameraVisible(true);
                }}>
                    <View style={[styles.addBtn, { backgroundColor: C.surface, borderColor: C.border }]}>
                        <Ionicons name="add" size={24} color={COLORS.primary} />
                    </View>
                    <Text style={styles.bubbleLabel}>Add</Text>
                </TouchableOpacity>

                {loading ? (
                    <ActivityIndicator color={COLORS.primary} style={{ marginLeft: 12 }} size="small" />
                ) : (
                    <FlatList
                        data={stories}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={item => item.user_id}
                        contentContainerStyle={{ paddingRight: 12 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.bubble} onPress={() => handleAvatarPress(item)}>
                                <View style={[styles.ring, item.isOwn ? styles.ownRing : styles.friendRing]}>
                                    {item.avatar_url
                                        ? <Image source={{ uri: item.avatar_url }} style={styles.ringImg} />
                                        : <View style={styles.ringPlaceholder}>
                                            <Text style={styles.ringInitial}>{item.username?.[0]?.toUpperCase() || '?'}</Text>
                                        </View>
                                    }
                                </View>
                                <Text style={styles.bubbleLabel} numberOfLines={1}>
                                    {item.isOwn ? 'Your story' : `@${item.username}`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                )}
            </View>

            {/* Camera */}
            <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => { setCameraVisible(false); setCapturedPhoto(null); }}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <StatusBar style="light" />
                    {capturedPhoto ? (
                        <>
                            <Image source={{ uri: capturedPhoto }} style={{ flex: 1 }} resizeMode="cover" />
                            <View style={styles.captureRow}>
                                <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedPhoto(null)}>
                                    <Text style={{ color: '#fff', fontWeight: '600' }}>↩ Retake</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.shareBtn, uploading && { opacity: 0.6 }]}
                                    onPress={uploadStory} disabled={uploading}>
                                    {uploading ? <ActivityIndicator color="#fff" size="small" />
                                        : <Text style={{ color: '#fff', fontWeight: '700' }}>Share Story ✨</Text>}
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.closeOverlay}
                                onPress={() => { setCapturedPhoto(null); setCameraVisible(false); }}>
                                <Ionicons name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </>
                    ) : permission?.granted ? (
                        <View style={{ flex: 1 }}>
                            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
                            <View style={[StyleSheet.absoluteFill, { justifyContent: 'space-between' }]}>
                                <View style={styles.camTop}>
                                    <TouchableOpacity style={styles.camBtn} onPress={() => setCameraVisible(false)}>
                                        <Ionicons name="close" size={22} color="#fff" />
                                    </TouchableOpacity>
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>New Story</Text>
                                    <TouchableOpacity style={styles.camBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
                                        <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                <View style={{ alignItems: 'center', paddingBottom: 60 }}>
                                    <TouchableOpacity style={styles.shutter} onPress={takePhoto}>
                                        <View style={styles.shutterInner} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <Text style={{ color: '#fff', fontSize: 16 }}>Camera permission needed</Text>
                            <TouchableOpacity style={styles.shareBtn} onPress={requestPermission}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Permission</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>

            {/* Story viewer */}
            <Modal visible={viewerVisible} animationType="fade" onRequestClose={closeViewer}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <StatusBar style="light" hidden />

                    {/* Progress */}
                    <View style={styles.progressRow}>
                        {viewingGroup?.stories.map((_, i) => (
                            <View key={i} style={styles.progressBg}>
                                <Animated.View style={[styles.progressFill, {
                                    width: i < viewingIndex ? '100%'
                                        : i === viewingIndex ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                                            : '0%'
                                }]} />
                            </View>
                        ))}
                    </View>

                    {/* User info */}
                    <View style={styles.viewerHeader}>
                        <View style={styles.viewerAvatar}>
                            {viewingGroup?.avatar_url
                                ? <Image source={{ uri: viewingGroup.avatar_url }} style={styles.viewerAvatarImg} />
                                : <Text style={{ color: '#fff', fontWeight: '700' }}>{viewingGroup?.username?.[0]?.toUpperCase()}</Text>
                            }
                        </View>
                        <Text style={styles.viewerName}>{'@' + (viewingGroup?.username)}</Text>
                        <TouchableOpacity onPress={closeViewer} style={{ padding: 4 }}>
                            <Ionicons name="close" size={22} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Story image */}
                    {viewingGroup?.stories[viewingIndex]?.image_url && (
                        <Image source={{ uri: viewingGroup.stories[viewingIndex].image_url }}
                            style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} resizeMode="cover" />
                    )}

                    {/* Tap areas */}
                    <View style={styles.tapRow}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={prevStory} />
                        <TouchableOpacity style={{ flex: 1 }} onPress={nextStory} />
                    </View>

                    {/* Reply */}
                    {viewingGroup && !viewingGroup.isOwn && (
                        <View style={styles.replyRow}>
                            <TextInput
                                style={styles.replyInput}
                                placeholder={`Reply to @${viewingGroup.username}...`}
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={replyText} onChangeText={setReplyText}
                            />
                            <TouchableOpacity style={styles.replyBtn} onPress={sendReply}
                                disabled={sendingReply || !replyText.trim()}>
                                {sendingReply ? <ActivityIndicator color="#fff" size="small" />
                                    : <Ionicons name="send" size={18} color="#fff" />}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10, paddingLeft: 12,
        borderBottomWidth: 1,
    },
    bubble: { alignItems: 'center', marginRight: 12, width: 62 },
    bubbleLabel: { color: COLORS.textSecondary, fontSize: 10, marginTop: 4, textAlign: 'center' },
    addBtn: {
        width: 58, height: 58, borderRadius: 29,
        borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
    ring: {
        width: 58, height: 58, borderRadius: 29,
        borderWidth: 2, padding: 2, overflow: 'hidden',
    },
    ownRing: { borderColor: COLORS.accent },
    friendRing: { borderColor: COLORS.primary },
    ringImg: { width: '100%', height: '100%', borderRadius: 27 },
    ringPlaceholder: {
        width: '100%', height: '100%', borderRadius: 27,
        backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
    },
    ringInitial: { color: COLORS.primaryLight, fontSize: 20, fontWeight: '700' },

    captureRow: {
        position: 'absolute', bottom: 60, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 40,
    },
    retakeBtn: {
        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.full,
        paddingHorizontal: 20, paddingVertical: 12,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    shareBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
        paddingHorizontal: 20, paddingVertical: 12, minWidth: 120, alignItems: 'center',
    },
    closeOverlay: {
        position: 'absolute', top: 60, left: 20,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    },
    camTop: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingHorizontal: 20, paddingTop: 60,
    },
    camBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
    },
    shutter: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

    progressRow: {
        position: 'absolute', top: 50, left: 10, right: 10,
        flexDirection: 'row', gap: 4, zIndex: 10,
    },
    progressBg: {
        flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2, overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: '#fff' },
    viewerHeader: {
        position: 'absolute', top: 60, left: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 10,
    },
    viewerAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    viewerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
    viewerName: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
    tapRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 80, flexDirection: 'row' },
    replyRow: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12, paddingBottom: 30,
        backgroundColor: 'rgba(0,0,0,0.4)', gap: 10,
    },
    replyInput: {
        flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: RADIUS.full, paddingHorizontal: 16, color: '#fff', fontSize: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    replyBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    },
});