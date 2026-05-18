import { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert,
    ScrollView, Image, KeyboardAvoidingView,
    Platform, Modal, FlatList, Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';
import QRCodeCard from '../components/QRCodeCard';
import AccessibilityScreen from './AccessibilityScreen';
import EventsScreen from './EventsScreen';
import BiometricSettingsScreen from './BiometricLockScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POST_SIZE = (SCREEN_WIDTH - 4) / 3;

export default function ProfileScreen() {
    const C = useTheme();
    const { user, profile, setProfile } = useAuthStore();
    const [posts, setPosts] = useState([]);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [selectedPost, setSelectedPost] = useState(null);
    const [postLikes, setPostLikes] = useState([]);
    const [postComments, setPostComments] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [avatarUri, setAvatarUri] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [qrVisible, setQrVisible] = useState(false);
    const [accessibilityVisible, setAccessibilityVisible] = useState(false);
    const [eventsVisible, setEventsVisible] = useState(false);
    const [biometricVisible, setBiometricVisible] = useState(false);
    const [followListVisible, setFollowListVisible] = useState(false);
    const [followListType, setFollowListType] = useState('followers');
    const [followList, setFollowList] = useState([]);
    const [loadingFollowList, setLoadingFollowList] = useState(false);
    const [hasStory, setHasStory] = useState(false);

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '');
            setUsername(profile.username || '');
            setBio(profile.bio || '');
            setAvatarUri(profile.avatar_url || null);
        }
        loadAll();
    }, [profile]);

    const loadAll = async () => {
        if (!user) return;
        await fetchPosts();
        fetchStats();
        checkStory();
    };

    const fetchPosts = async () => {
        const { data } = await supabase.from('posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (data) setPosts(data);
    };

    const fetchStats = async () => {
        const { count: f1 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id);
        const { count: f2 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id);
        setFollowersCount(f1 || 0);
        setFollowingCount(f2 || 0);
    };

    const checkStory = async () => {
        const { data } = await supabase.from('stories').select('id').eq('user_id', user.id).gt('expires_at', new Date().toISOString()).limit(1);
        setHasStory(data && data.length > 0);
    };

    const openFollowList = async (type) => {
        setFollowListType(type);
        setFollowListVisible(true);
        setLoadingFollowList(true);
        try {
            if (type === 'followers') {
                const { data } = await supabase.from('follows').select('follower_id').eq('following_id', user.id);
                if (data && data.length > 0) {
                    const ids = data.map(d => d.follower_id);
                    const { data: profiles } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids);
                    setFollowList(profiles || []);
                } else setFollowList([]);
            } else {
                const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
                if (data && data.length > 0) {
                    const ids = data.map(d => d.following_id);
                    const { data: profiles } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids);
                    setFollowList(profiles || []);
                } else setFollowList([]);
            }
        } catch (e) { setFollowList([]); }
        setLoadingFollowList(false);
    };

    const openPost = async (post) => {
        setSelectedPost(post);
        setPostLikes([]);
        setPostComments([]);

        // Fetch likes//
        const { data: likes } = await supabase
            .from('likes')
            .select('user_id')
            .eq('post_id', post.id);

        if (likes && likes.length > 0) {
            const ids = likes.map(l => l.user_id);
            const { data: profs } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', ids);
            setPostLikes(profs || []);
        }

        // Fetch comments//
        const { data: comments } = await supabase
            .from('comments')
            .select('id, user_id, content, created_at')
            .eq('post_id', post.id)
            .order('created_at', { ascending: true });

        if (comments && comments.length > 0) {
            const commenterIds = [...new Set(comments.map(c => c.user_id))];
            const { data: commenterProfs } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', commenterIds);
            const pm = {};
            if (commenterProfs) commenterProfs.forEach(p => { pm[p.id] = p; });
            setPostComments(comments.map(c => ({
                ...c,
                profiles: pm[c.user_id] || { username: 'user', avatar_url: null },
            })));
        }
    };

    const pickAvatar = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
        if (!result.canceled) {
            const manip = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 400, height: 400 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
            setAvatarUri(manip.uri);
            await uploadAvatar(manip.uri);
        }
    };

    const uploadAvatar = async (uri) => {
        setUploading(true);
        try {
            const res = await fetch(uri);
            const blob = await res.blob();
            const ab = await new Response(blob).arrayBuffer();
            const fileName = `avatars/${user.id}_${Date.now()}.jpg`;
            const { error } = await supabase.storage.from('media').upload(fileName, ab, { contentType: 'image/jpeg', upsert: true });
            if (!error) {
                const { data } = supabase.storage.from('media').getPublicUrl(fileName);
                setAvatarUri(data.publicUrl);
                await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id);
            }
        } catch (e) { Alert.alert('Error', e.message); }
        setUploading(false);
    };

    const saveProfile = async () => {
        if (!fullName.trim() || !username.trim()) { Alert.alert('Required', 'Name and username required.'); return; }
        setSaving(true);
        const { data, error } = await supabase.from('profiles').update({
            full_name: fullName.trim(), username: username.trim().toLowerCase(), bio: bio.trim(),
        }).eq('id', user.id).select().single();
        if (error) Alert.alert('Error', error.message);
        else { setProfile(data); setEditMode(false); Alert.alert('Saved! ✨'); }
        setSaving(false);
    };

    const deletePost = (postId) => {
        Alert.alert('Delete Post?', '', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await supabase.from('posts').delete().eq('id', postId);
                    setSelectedPost(null); setPostLikes([]); setPostComments([]);
                    fetchPosts();
                }
            }
        ]);
    };

    const handleSignOut = () => {
        Alert.alert('Sign Out?', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: async () => await supabase.auth.signOut() }
        ]);
    };

    // EDIT MODE//
    if (editMode) {
        return (
            <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <View style={[styles.header, { borderBottomColor: C.border }]}>
                        <TouchableOpacity onPress={() => setEditMode(false)} style={styles.iconBtn}>
                            <Ionicons name="arrow-back" size={22} color={C.text} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: C.text }]}>Edit Profile</Text>
                        <View style={{ width: 36 }} />
                    </View>
                    <View style={styles.avatarSection}>
                        <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar}>
                            <View style={[styles.avatarRing, { borderColor: hasStory ? COLORS.primary : C.border }]}>
                                {uploading ? <ActivityIndicator color={COLORS.primary} />
                                    : avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                                        : <View style={[styles.avatarPlaceholder, { backgroundColor: C.surface }]}>
                                            <Text style={[styles.avatarInitial, { color: COLORS.primaryLight }]}>{fullName?.[0]?.toUpperCase() || '?'}</Text>
                                        </View>
                                }
                            </View>
                            <View style={[styles.editBadge, { backgroundColor: COLORS.primary }]}>
                                <Ionicons name="camera" size={14} color="#fff" />
                            </View>
                        </TouchableOpacity>
                        <Text style={[{ fontSize: 12, marginTop: 6, color: C.textMuted }]}>Tap to change photo</Text>
                    </View>
                    <View style={{ paddingHorizontal: 20 }}>
                        <Text style={[styles.label, { color: C.textSecondary }]}>Full Name</Text>
                        <TextInput style={[styles.input, { backgroundColor: C.surface, color: C.text, borderColor: C.border }]}
                            value={fullName} onChangeText={setFullName} placeholderTextColor={C.textMuted} placeholder="Full name" />
                        <Text style={[styles.label, { color: C.textSecondary }]}>Username</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.atSign, { color: COLORS.primaryLight }]}>@</Text>
                            <TextInput style={[styles.input, { flex: 1, backgroundColor: C.surface, color: C.text, borderColor: C.border }]}
                                value={username} onChangeText={t => setUsername(t.toLowerCase().replace(' ', ''))}
                                autoCapitalize="none" placeholderTextColor={C.textMuted} placeholder="username" />
                        </View>
                        <Text style={[styles.label, { color: C.textSecondary }]}>Bio</Text>
                        <TextInput style={[styles.input, styles.bioInput, { backgroundColor: C.surface, color: C.text, borderColor: C.border }]}
                            value={bio} onChangeText={setBio} multiline maxLength={150}
                            placeholderTextColor={C.textMuted} placeholder="Tell the world about yourself..." />
                        <Text style={[{ fontSize: 11, textAlign: 'right', marginTop: 4, color: C.textMuted }]}>{bio.length}/150</Text>
                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: COLORS.primary }]} onPress={saveProfile} disabled={saving}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    // VIEW MODE//
    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <Text style={[styles.profileUsername, { color: C.text }]}>@{profile?.username}</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => setBiometricVisible(true)} style={styles.iconBtn}>
                        <Ionicons name="finger-print-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEventsVisible(true)} style={styles.iconBtn}>
                        <Ionicons name="calendar-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAccessibilityVisible(true)} style={styles.iconBtn}>
                        <Ionicons name="accessibility-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setQrVisible(true)} style={styles.iconBtn}>
                        <Ionicons name="qr-code-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSignOut} style={styles.iconBtn}>
                        <Ionicons name="log-out-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.profileInfo}>
                    <TouchableOpacity onPress={pickAvatar}>
                        <View style={[styles.avatarRing, { borderColor: hasStory ? COLORS.primary : C.border }]}>
                            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                                : <View style={[styles.avatarPlaceholder, { backgroundColor: C.surface }]}>
                                    <Text style={[styles.avatarInitial, { color: COLORS.primaryLight }]}>{profile?.full_name?.[0]?.toUpperCase() || '?'}</Text>
                                </View>
                            }
                        </View>
                    </TouchableOpacity>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: C.text }]}>{posts.length}</Text>
                            <Text style={[styles.statLabel, { color: C.textSecondary }]}>Posts</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: C.border }]} />
                        <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('followers')}>
                            <Text style={[styles.statNumber, { color: C.text }]}>{followersCount}</Text>
                            <Text style={[styles.statLabel, { color: COLORS.primary }]}>Followers</Text>
                        </TouchableOpacity>
                        <View style={[styles.statDivider, { backgroundColor: C.border }]} />
                        <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('following')}>
                            <Text style={[styles.statNumber, { color: C.text }]}>{followingCount}</Text>
                            <Text style={[styles.statLabel, { color: COLORS.primary }]}>Following</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <Text style={[styles.displayName, { color: C.text }]}>{profile?.full_name}</Text>
                    {profile?.bio ? <Text style={[styles.bioText, { color: C.textSecondary }]}>{profile.bio}</Text> : null}
                </View>

                <TouchableOpacity style={[styles.editProfileBtn, { borderColor: C.border }]} onPress={() => setEditMode(true)}>
                    <Text style={[styles.editProfileBtnText, { color: C.text }]}>Edit Profile</Text>
                </TouchableOpacity>

                {posts.length === 0 ? (
                    <View style={styles.emptyPosts}>
                        <Ionicons name="images-outline" size={48} color={C.textMuted} />
                        <Text style={[styles.emptyPostsText, { color: C.textSecondary }]}>No posts yet</Text>
                    </View>
                ) : (
                    <View style={styles.postsGrid}>
                        {posts.map(post => (
                            <TouchableOpacity key={post.id} style={[styles.postThumb, { backgroundColor: C.surface }]} onPress={() => openPost(post)}>
                                {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.postThumbImg} />
                                    : <View style={styles.postThumbText}>
                                        <Text style={[styles.postThumbContent, { color: C.textSecondary }]} numberOfLines={4}>{post.content}</Text>
                                    </View>
                                }
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Post Detail Modal */}
            <Modal visible={selectedPost !== null} animationType="slide" transparent onRequestClose={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} onPress={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }} />
                    <View style={[styles.modalSheet, { backgroundColor: C.surface }]}>
                        <View style={styles.modalHandle} />
                        {selectedPost && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {selectedPost.image_url && <Image source={{ uri: selectedPost.image_url }} style={styles.modalImage} resizeMode="cover" />}
                                {selectedPost.content ? <Text style={[styles.modalContent, { color: C.text }]}>{selectedPost.content}</Text> : null}

                                {/* Likes section */}
                                <View style={styles.likesSection}>
                                    <Text style={[styles.sectionTitle, { color: C.text }]}>
                                        {'❤️ ' + (postLikes.length > 0 ? `Liked by ${postLikes.length}` : 'No likes yet')}
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                        {postLikes.map((p, i) => (
                                            <View key={i} style={styles.likeItem}>
                                                <View style={[styles.likeAvatar, { backgroundColor: C.card }]}>
                                                    {p.avatar_url
                                                        ? <Image source={{ uri: p.avatar_url }} style={styles.likeAvatarImg} />
                                                        : <Text style={[styles.likeAvatarText, { color: COLORS.primaryLight }]}>{p.username?.[0]?.toUpperCase()}</Text>
                                                    }
                                                </View>
                                                <Text style={{ fontSize: 12, color: C.textSecondary }}>{'@' + p.username}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                {/* Comments section */}
                                <View style={styles.commentsSection}>
                                    <Text style={[styles.sectionTitle, { color: C.text }]}>
                                        {'💬 Comments (' + postComments.length + ')'}
                                    </Text>
                                    {postComments.length === 0 && (
                                        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 6 }}>No comments yet</Text>
                                    )}
                                    {postComments.map((c, i) => (
                                        <View key={i} style={styles.commentRow}>
                                            <View style={[styles.likeAvatar, { backgroundColor: C.card }]}>
                                                {c.profiles?.avatar_url
                                                    ? <Image source={{ uri: c.profiles.avatar_url }} style={styles.likeAvatarImg} />
                                                    : <Text style={[styles.likeAvatarText, { color: COLORS.primaryLight }]}>{c.profiles?.username?.[0]?.toUpperCase()}</Text>
                                                }
                                            </View>
                                            <View style={[styles.commentBubble, { backgroundColor: C.card }]}>
                                                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primaryLight }}>{'@' + c.profiles?.username}</Text>
                                                <Text style={{ fontSize: 14, color: C.text, marginTop: 2 }}>{c.content}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>

                                <View style={styles.postModalActions}>
                                    <TouchableOpacity style={[styles.deleteBtn, { borderColor: COLORS.error }]} onPress={() => deletePost(selectedPost.id)}>
                                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                                        <Text style={{ color: COLORS.error, fontWeight: '600' }}>Delete</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.closePostBtn, { backgroundColor: COLORS.primary }]}
                                        onPress={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Follow List Modal */}
            <Modal visible={followListVisible} animationType="slide" transparent onRequestClose={() => { setFollowListVisible(false); setFollowList([]); }}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} onPress={() => { setFollowListVisible(false); setFollowList([]); }} />
                    <View style={[styles.modalSheet, { backgroundColor: C.surface }]}>
                        <View style={styles.modalHandle} />
                        <Text style={[styles.followModalTitle, { color: C.text }]}>{followListType === 'followers' ? 'Followers' : 'Following'}</Text>
                        {loadingFollowList ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} /> :
                            followList.length === 0 ? <Text style={{ color: C.textSecondary, textAlign: 'center', marginTop: 20 }}>No {followListType} yet</Text> : (
                                <FlatList data={followList} keyExtractor={item => item.id}
                                    renderItem={({ item }) => (
                                        <View style={[styles.followItem, { borderBottomColor: C.border }]}>
                                            <View style={[styles.likeAvatar, { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card }]}>
                                                {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                                    : <Text style={[styles.likeAvatarText, { color: COLORS.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[{ fontWeight: '600', fontSize: 15, color: C.text }]}>{item.full_name}</Text>
                                                <Text style={[{ fontSize: 13, color: C.textSecondary }]}>@{item.username}</Text>
                                            </View>
                                        </View>
                                    )}
                                />
                            )
                        }
                    </View>
                </View>
            </Modal>

            <QRCodeCard visible={qrVisible} onClose={() => setQrVisible(false)} profile={profile} />
            <Modal visible={accessibilityVisible} animationType="slide" onRequestClose={() => setAccessibilityVisible(false)}>
                <AccessibilityScreen onClose={() => setAccessibilityVisible(false)} />
            </Modal>
            <Modal visible={eventsVisible} animationType="slide" onRequestClose={() => setEventsVisible(false)}>
                <EventsScreen onClose={() => setEventsVisible(false)} />
            </Modal>
            <Modal visible={biometricVisible} animationType="slide" onRequestClose={() => setBiometricVisible(false)}>
                <BiometricSettingsScreen onClose={() => setBiometricVisible(false)} />
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    profileUsername: { fontSize: 18, fontWeight: '700' },
    headerRight: { flexDirection: 'row', gap: 2 },
    iconBtn: { padding: 6 },
    profileInfo: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 20 },
    avatarSection: { alignItems: 'center', paddingVertical: 16 },
    avatarContainer: { position: 'relative' },
    avatarRing: { width: 86, height: 86, borderRadius: 43, borderWidth: 2, padding: 2, alignItems: 'center', justifyContent: 'center' },
    avatarImg: { width: 78, height: 78, borderRadius: 39 },
    avatarPlaceholder: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 30, fontWeight: '700' },
    editBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    statItem: { flex: 1, alignItems: 'center' },
    statNumber: { fontSize: 20, fontWeight: '700' },
    statLabel: { fontSize: 12, marginTop: 2 },
    statDivider: { width: 1, height: 30 },
    displayName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    bioText: { fontSize: 14, lineHeight: 20 },
    editProfileBtn: { marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 8, alignItems: 'center' },
    editProfileBtnText: { fontWeight: '600', fontSize: 14 },
    postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    postThumb: { width: POST_SIZE, height: POST_SIZE, overflow: 'hidden' },
    postThumbImg: { width: '100%', height: '100%' },
    postThumbText: { flex: 1, padding: 8, justifyContent: 'center', alignItems: 'center' },
    postThumbContent: { fontSize: 11, textAlign: 'center' },
    emptyPosts: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
    emptyPostsText: { fontSize: 15 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalBackdrop: { flex: 1 },
    modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%', borderTopWidth: 1, borderColor: COLORS.border },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 },
    modalImage: { width: '100%', height: 280, borderRadius: RADIUS.lg, marginBottom: 12 },
    modalContent: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
    likesSection: { marginBottom: 16 },
    commentsSection: { marginBottom: 16 },
    sectionTitle: { fontWeight: '700', fontSize: 15 },
    likeItem: { alignItems: 'center', gap: 4 },
    commentRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-start' },
    commentBubble: { flex: 1, borderRadius: RADIUS.md, padding: 10 },
    likeAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    likeAvatarImg: { width: 32, height: 32, borderRadius: 16 },
    likeAvatarText: { fontWeight: '700', fontSize: 12 },
    postModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 12 },
    closePostBtn: { flex: 1, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
    followModalTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
    followItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    input: { height: 50, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 16, fontSize: 15 },
    bioInput: { height: 100, paddingTop: 14, textAlignVertical: 'top' },
    atSign: { fontSize: 20, fontWeight: '700' },
    saveBtn: { height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});