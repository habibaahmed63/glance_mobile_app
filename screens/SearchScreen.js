import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, Image, ActivityIndicator, Alert, Modal, ScrollView,
    Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

const { width: SW } = Dimensions.get('window');
const POST_SIZE = (SW - 4) / 3;

export default function SearchScreen({ themeColors, navigation }) {
    const C = useTheme();
    const { user } = useAuthStore();
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState('posts');
    const [posts, setPosts] = useState([]);
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [followingUsers, setFollowingUsers] = useState(new Set());

    // Profile view
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [profilePosts, setProfilePosts] = useState([]);
    const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 });

    // Followers/following modal
    const [followListVisible, setFollowListVisible] = useState(false);
    const [followListType, setFollowListType] = useState('followers');
    const [followList, setFollowList] = useState([]);
    const [loadingFollowList, setLoadingFollowList] = useState(false);

    // Post detail modal
    const [selectedPost, setSelectedPost] = useState(null);
    const [postLikes, setPostLikes] = useState([]);
    const [postComments, setPostComments] = useState([]);
    const [loadingPostDetail, setLoadingPostDetail] = useState(false);

    const handleSearch = useCallback(async (text) => {
        setQuery(text);
        if (!text.trim() || text.length < 2) { setPosts([]); setPeople([]); setSearched(false); return; }
        setLoading(true);
        setSearched(true);
        const isHashtag = text.startsWith('#');
        const isMention = text.startsWith('@');
        const clean = text.replace(/^[#@]/, '').trim();
        if (!clean) { setLoading(false); return; }

        // Fetch following
        const { data: fData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        if (fData) setFollowingUsers(new Set(fData.map(f => f.following_id)));

        if (!isMention) {
            const { data } = await supabase.from('posts').select('*')
                .ilike('content', `%${clean}%`).order('created_at', { ascending: false }).limit(20);
            if (data && data.length > 0) {
                const ids = [...new Set(data.map(p => p.user_id))];
                const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
                const pm = {};
                if (profs) profs.forEach(p => { pm[p.id] = p; });
                setPosts(data.map(p => ({ ...p, profiles: pm[p.user_id] || null })));
            } else setPosts([]);
        } else setPosts([]);

        if (!isHashtag) {
            const { data } = await supabase.from('profiles').select('*')
                .or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`).neq('id', user.id).limit(20);
            setPeople(data || []);
        } else setPeople([]);

        setLoading(false);
    }, []);

    const followUser = async (targetId) => {
        const isFollowing = followingUsers.has(targetId);
        setFollowingUsers(prev => {
            const next = new Set(prev);
            if (isFollowing) next.delete(targetId); else next.add(targetId);
            return next;
        });
        if (isFollowing) {
            await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
        } else {
            await supabase.from('follows').insert([{ follower_id: user.id, following_id: targetId }]);
        }
        // Refresh stats if viewing their profile
        if (selectedProfile?.id === targetId) {
            fetchProfileStats(targetId);
        }
    };

    const openProfile = async (profile) => {
        setSelectedProfile(profile);
        setProfilePosts([]);
        fetchProfileStats(profile.id);
        const { data } = await supabase.from('posts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
        setProfilePosts(data || []);
    };

    const fetchProfileStats = async (profileId) => {
        const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId);
        const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileId);
        setProfileStats({ followers: followers || 0, following: following || 0 });
    };

    const openFollowList = async (type, profileId) => {
        setFollowListType(type);
        setFollowListVisible(true);
        setLoadingFollowList(true);
        setFollowList([]);
        try {
            if (type === 'followers') {
                const { data } = await supabase.from('follows').select('follower_id').eq('following_id', profileId);
                if (data && data.length > 0) {
                    const ids = data.map(d => d.follower_id);
                    const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids);
                    setFollowList(profs || []);
                }
            } else {
                const { data } = await supabase.from('follows').select('following_id').eq('follower_id', profileId);
                if (data && data.length > 0) {
                    const ids = data.map(d => d.following_id);
                    const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids);
                    setFollowList(profs || []);
                }
            }
        } catch (e) { setFollowList([]); }
        setLoadingFollowList(false);
    };

    const openPost = async (post) => {
        setSelectedPost(post);
        setPostLikes([]);
        setPostComments([]);
        setLoadingPostDetail(true);
        // Likes
        const { data: likes } = await supabase.from('likes').select('user_id').eq('post_id', post.id);
        if (likes && likes.length > 0) {
            const ids = likes.map(l => l.user_id);
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            setPostLikes(profs || []);
        }
        // Comments
        const { data: comments } = await supabase.from('comments').select('id, user_id, content, created_at').eq('post_id', post.id).order('created_at', { ascending: true });
        if (comments && comments.length > 0) {
            const ids = [...new Set(comments.map(c => c.user_id))];
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            const pm = {};
            if (profs) profs.forEach(p => { pm[p.id] = p; });
            setPostComments(comments.map(c => ({ ...c, profiles: pm[c.user_id] || null })));
        }
        setLoadingPostDetail(false);
    };

    const [messagingUser, setMessagingUser] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);

    const sendDirectMessage = async () => {
        if (!messageText.trim() || !messagingUser) return;
        setSendingMsg(true);
        const { error } = await supabase.from('messages').insert([{
            sender_id: user.id,
            receiver_id: messagingUser.id,
            content: messageText.trim(),
        }]);
        if (!error) {
            setMessageText('');
            setMessagingUser(null);
            Alert.alert('Message sent! 💬', `Your message was sent to @${messagingUser.username}`);
        } else {
            Alert.alert('Error', error.message);
        }
        setSendingMsg(false);
    };

    const messageUser = (profile) => {
        setMessagingUser(profile);
    };

    const reportUser = (profileId) => {
        Alert.alert('Report User', 'Report this user for inappropriate content?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Report', style: 'destructive', onPress: () => Alert.alert('Reported', 'Thank you for keeping Glance safe.') }
        ]);
    };

    const renderPerson = ({ item }) => (
        <TouchableOpacity style={[styles.personCard, { borderBottomColor: C.border }]} onPress={() => openProfile(item)}>
            <View style={[styles.avatar, { backgroundColor: C.card }]}>
                {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    : <Text style={[styles.avatarText, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>}
            </View>
            <View style={styles.personInfo}>
                <Text style={[styles.personName, { color: C.text }]}>{item.full_name}</Text>
                <Text style={[styles.personUsername, { color: C.textSecondary }]}>{'@' + item.username}</Text>
            </View>
            <TouchableOpacity
                style={[styles.followBtn, followingUsers.has(item.id) && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={(e) => { e.stopPropagation(); followUser(item.id); }}
            >
                <Text style={[styles.followBtnText, followingUsers.has(item.id) && { color: '#fff' }]}>
                    {followingUsers.has(item.id) ? 'Following' : 'Follow'}
                </Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );

    const renderPost = ({ item }) => (
        <View style={[styles.postCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.postHeader}>
                <View style={[styles.avatar, { backgroundColor: C.card }]}>
                    {item.profiles?.avatar_url ? <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatarImg} />
                        : <Text style={[styles.avatarText, { color: C.primaryLight }]}>{item.profiles?.username?.[0]?.toUpperCase()}</Text>}
                </View>
                <Text style={[styles.personUsername, { color: C.textSecondary, marginLeft: 8 }]}>{'@' + item.profiles?.username}</Text>
            </View>
            {item.content ? <Text style={[styles.postContent, { color: C.text }]} numberOfLines={3}>{item.content}</Text> : null}
            {item.image_url && <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />}
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <Text style={[styles.headerTitle, { color: C.text }]}>Search</Text>
            </View>

            <View style={[styles.searchBar, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Ionicons name="search-outline" size={18} color={C.textMuted} />
                <TextInput
                    style={[styles.searchInput, { color: C.text }]}
                    placeholder="Search posts, #hashtags, @people..."
                    placeholderTextColor={C.textMuted}
                    value={query} onChangeText={handleSearch}
                    autoCapitalize="none"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setPosts([]); setPeople([]); setSearched(false); }}>
                        <Ionicons name="close-circle" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {searched && (
                <View style={[styles.tabs, { borderBottomColor: C.border }]}>
                    {['posts', 'people'].map(tab => (
                        <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomWidth: 2, borderBottomColor: C.primary }]}
                            onPress={() => setActiveTab(tab)}>
                            <Text style={[styles.tabText, { color: activeTab === tab ? C.primary : C.textSecondary }]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} {tab === 'posts' && posts.length > 0 ? '(' + posts.length + ')' : tab === 'people' && people.length > 0 ? '(' + people.length + ')' : ''}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> :
                !searched ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="search-outline" size={48} color={C.textMuted} />
                        <Text style={[styles.emptyTitle, { color: C.text }]}>Discover Glance</Text>
                        <Text style={[styles.emptySubtext, { color: C.textSecondary }]}>Search posts, #hashtags or @people</Text>
                    </View>
                ) : (activeTab === 'posts' ? posts : people).length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={[styles.emptyTitle, { color: C.text }]}>No results</Text>
                    </View>
                ) : (
                    <FlatList
                        data={activeTab === 'posts' ? posts : people}
                        keyExtractor={item => item.id.toString()}
                        renderItem={activeTab === 'posts' ? renderPost : renderPerson}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        showsVerticalScrollIndicator={false}
                    />
                )
            }

            {/* ── User Profile Modal ── */}
            <Modal visible={selectedProfile !== null} animationType="slide"
                onRequestClose={() => { setSelectedProfile(null); setProfilePosts([]); }}>
                {selectedProfile && (
                    <View style={[styles.container, { backgroundColor: C.background }]}>
                        <StatusBar style="light" />
                        {/* Header */}
                        <View style={[styles.header, { borderBottomColor: C.border }]}>
                            <TouchableOpacity onPress={() => { setSelectedProfile(null); setProfilePosts([]); }} style={{ padding: 4 }}>
                                <Ionicons name="arrow-back" size={22} color={C.text} />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { color: C.text, fontSize: 16 }]}>{'@' + selectedProfile.username}</Text>
                            <TouchableOpacity onPress={() => reportUser(selectedProfile.id)}>
                                <Ionicons name="flag-outline" size={20} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Profile info */}
                            <View style={styles.profileHeader}>
                                <View style={[styles.profileAvatar, { backgroundColor: C.surface, borderColor: C.primary }]}>
                                    {selectedProfile.avatar_url
                                        ? <Image source={{ uri: selectedProfile.avatar_url }} style={styles.profileAvatarImg} />
                                        : <Text style={[styles.profileAvatarText, { color: C.primaryLight }]}>{selectedProfile.username?.[0]?.toUpperCase()}</Text>
                                    }
                                </View>
                                {/* Stats */}
                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profilePosts.length}</Text>
                                        <Text style={[styles.statLabel, { color: C.textSecondary }]}>Posts</Text>
                                    </View>
                                    <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('followers', selectedProfile.id)}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profileStats.followers}</Text>
                                        <Text style={[styles.statLabel, { color: C.primary }]}>Followers</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('following', selectedProfile.id)}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profileStats.following}</Text>
                                        <Text style={[styles.statLabel, { color: C.primary }]}>Following</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.profileBio}>
                                <Text style={[styles.profileName, { color: C.text }]}>{selectedProfile.full_name}</Text>
                                {selectedProfile.bio ? <Text style={[styles.profileBioText, { color: C.textSecondary }]}>{selectedProfile.bio}</Text> : null}
                            </View>

                            {/* Action buttons */}
                            <View style={styles.profileActions}>
                                <TouchableOpacity
                                    style={[styles.followLargeBtn, followingUsers.has(selectedProfile.id)
                                        ? { borderColor: C.border, backgroundColor: C.surface }
                                        : { borderColor: C.primary, backgroundColor: C.primary }
                                    ]}
                                    onPress={() => followUser(selectedProfile.id)}
                                >
                                    <Text style={[styles.followLargeBtnText, { color: followingUsers.has(selectedProfile.id) ? C.textSecondary : '#fff' }]}>
                                        {followingUsers.has(selectedProfile.id) ? '✓ Following' : 'Follow'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.messageLargeBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                                    onPress={() => messageUser(selectedProfile)}
                                >
                                    <Ionicons name="chatbubble-outline" size={16} color={C.text} />
                                    <Text style={[styles.messageLargeBtnText, { color: C.text }]}>Message</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Posts grid */}
                            {profilePosts.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Text style={[styles.emptySubtext, { color: C.textSecondary }]}>No posts yet</Text>
                                </View>
                            ) : (
                                <View style={styles.postsGrid}>
                                    {profilePosts.map(post => (
                                        <TouchableOpacity key={post.id} style={[styles.gridItem, { backgroundColor: C.surface }]} onPress={() => openPost(post)}>
                                            {post.image_url
                                                ? <Image source={{ uri: post.image_url }} style={styles.gridImage} />
                                                : <View style={{ flex: 1, padding: 6, justifyContent: 'center', alignItems: 'center' }}>
                                                    <Text style={[styles.gridText, { color: C.textSecondary }]} numberOfLines={4}>{post.content}</Text>
                                                </View>
                                            }
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}
            </Modal>

            {/* ── Post Detail Modal ── */}
            <Modal visible={selectedPost !== null} animationType="slide" transparent
                onRequestClose={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }}>
                <View style={styles.sheetOverlay}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }} />
                    <View style={[styles.sheet, { backgroundColor: C.surface }]}>
                        <View style={styles.sheetHandle} />
                        {selectedPost && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {selectedPost.image_url && (
                                    <Image source={{ uri: selectedPost.image_url }} style={styles.sheetImage} resizeMode="cover" />
                                )}
                                {selectedPost.content ? <Text style={[styles.sheetContent, { color: C.text }]}>{selectedPost.content}</Text> : null}

                                {loadingPostDetail ? <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} /> : (
                                    <>
                                        {/* Likes */}
                                        <Text style={[styles.sectionTitle, { color: C.text }]}>
                                            {'❤️ ' + (postLikes.length > 0 ? 'Liked by ' + postLikes.length : 'No likes yet')}
                                        </Text>
                                        {postLikes.length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                                                {postLikes.map((p, i) => (
                                                    <View key={i} style={{ alignItems: 'center', gap: 3 }}>
                                                        <View style={[styles.miniAvatar, { backgroundColor: C.card }]}>
                                                            {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={styles.miniAvatarImg} />
                                                                : <Text style={[styles.miniAvatarText, { color: C.primaryLight }]}>{p.username?.[0]?.toUpperCase()}</Text>}
                                                        </View>
                                                        <Text style={[{ fontSize: 11, color: C.textSecondary }]}>{'@' + p.username}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Comments */}
                                        <Text style={[styles.sectionTitle, { color: C.text }]}>
                                            {'💬 Comments (' + postComments.length + ')'}
                                        </Text>
                                        {postComments.length === 0
                                            ? <Text style={[{ fontSize: 13, color: C.textMuted, marginTop: 4, marginBottom: 12 }]}>No comments yet</Text>
                                            : postComments.map((c, i) => (
                                                <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                                                    <View style={[styles.miniAvatar, { backgroundColor: C.card }]}>
                                                        {c.profiles?.avatar_url ? <Image source={{ uri: c.profiles.avatar_url }} style={styles.miniAvatarImg} />
                                                            : <Text style={[styles.miniAvatarText, { color: C.primaryLight }]}>{c.profiles?.username?.[0]?.toUpperCase()}</Text>}
                                                    </View>
                                                    <View style={[{ flex: 1, backgroundColor: C.card, borderRadius: RADIUS.md, padding: 10 }]}>
                                                        <Text style={[{ fontSize: 12, fontWeight: '700', color: C.primary }]}>{'@' + c.profiles?.username}</Text>
                                                        <Text style={[{ fontSize: 14, color: C.text, marginTop: 2 }]}>{c.content}</Text>
                                                    </View>
                                                </View>
                                            ))
                                        }
                                    </>
                                )}

                                <TouchableOpacity style={[styles.closeSheetBtn, { backgroundColor: C.primary }]}
                                    onPress={() => { setSelectedPost(null); setPostLikes([]); setPostComments([]); }}>
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Direct Message Modal ── */}
            <Modal visible={messagingUser !== null} animationType="slide" transparent
                onRequestClose={() => { setMessagingUser(null); setMessageText(''); }}>
                <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setMessagingUser(null); setMessageText(''); }} />
                    <View style={[styles.sheet, { backgroundColor: C.surface }]}>
                        <View style={styles.sheetHandle} />
                        <Text style={[styles.sectionTitle, { color: C.text, textAlign: 'center', marginBottom: 12 }]}>
                            {'Message @' + (messagingUser?.username || '')}
                        </Text>
                        <TextInput
                            style={[styles.msgInput, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
                            placeholder="Write a message..."
                            placeholderTextColor={C.textMuted}
                            value={messageText}
                            onChangeText={setMessageText}
                            multiline
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[styles.sendMsgBtn, { backgroundColor: C.primary, opacity: sendingMsg ? 0.6 : 1 }]}
                            onPress={sendDirectMessage}
                            disabled={sendingMsg || !messageText.trim()}
                        >
                            {sendingMsg
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send Message</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Followers/Following Modal — sits on top of profile modal ── */}
            {followListVisible && (
                <Modal visible={true} animationType="slide" transparent
                    onRequestClose={() => { setFollowListVisible(false); setFollowList([]); }}>
                    <View style={styles.sheetOverlay}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => { setFollowListVisible(false); setFollowList([]); }} />
                        <View style={[styles.sheet, { backgroundColor: C.surface, maxHeight: '70%' }]}>
                            <View style={styles.sheetHandle} />
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <TouchableOpacity onPress={() => { setFollowListVisible(false); setFollowList([]); }} style={{ padding: 4 }}>
                                    <Ionicons name="arrow-back" size={20} color={C.text} />
                                </TouchableOpacity>
                                <Text style={[styles.sectionTitle, { color: C.text, flex: 1, textAlign: 'center' }]}>
                                    {followListType === 'followers' ? 'Followers' : 'Following'}
                                </Text>
                                <View style={{ width: 28 }} />
                            </View>
                            {loadingFollowList ? <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} /> :
                                followList.length === 0 ? (
                                    <Text style={{ color: C.textSecondary, textAlign: 'center', marginTop: 20, fontSize: 15 }}>
                                        {'No ' + followListType + ' yet'}
                                    </Text>
                                ) : (
                                    <FlatList
                                        data={followList}
                                        keyExtractor={item => item.id}
                                        renderItem={({ item }) => (
                                            <View style={[styles.personCard, { borderBottomColor: C.border }]}>
                                                <View style={[styles.avatar, { backgroundColor: C.card }]}>
                                                    {item.avatar_url
                                                        ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                                                        : <Text style={[styles.avatarText, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>
                                                    }
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontWeight: '600', fontSize: 15, color: C.text }}>{item.full_name}</Text>
                                                    <Text style={{ fontSize: 13, color: C.textSecondary }}>{'@' + item.username}</Text>
                                                </View>
                                            </View>
                                        )}
                                    />
                                )
                            }
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1 },
    headerTitle: { fontSize: 22, fontWeight: '700' },
    searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, gap: 8 },
    searchInput: { flex: 1, fontSize: 15 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 4 },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '500' },
    postCard: { marginHorizontal: 16, marginTop: 10, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1 },
    postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    postContent: { fontSize: 14, lineHeight: 20 },
    postImage: { width: '100%', height: 160, borderRadius: RADIUS.md, marginTop: 8 },
    personCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
    personInfo: { flex: 1 },
    personName: { fontWeight: '600', fontSize: 15 },
    personUsername: { fontSize: 13, marginTop: 2 },
    followBtn: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 6 },
    followBtnText: { color: COLORS.primaryLight, fontWeight: '600', fontSize: 13 },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: 38, height: 38, borderRadius: 19 },
    avatarText: { fontWeight: '700', fontSize: 14 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '700' },
    emptySubtext: { fontSize: 14 },

    // Profile modal
    profileHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 20 },
    profileAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    profileAvatarImg: { width: 80, height: 80, borderRadius: 40 },
    profileAvatarText: { fontSize: 28, fontWeight: '700' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 18, fontWeight: '700' },
    statLabel: { fontSize: 12, marginTop: 2 },
    profileBio: { paddingHorizontal: 16, paddingBottom: 12 },
    profileName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    profileBioText: { fontSize: 14, lineHeight: 20 },
    profileActions: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
    followLargeBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1.5 },
    followLargeBtnText: { fontWeight: '700', fontSize: 14 },
    messageLargeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: RADIUS.md, gap: 6, borderWidth: 1 },
    messageLargeBtnText: { fontWeight: '600', fontSize: 14 },
    postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2 },
    gridItem: { width: POST_SIZE, height: POST_SIZE, overflow: 'hidden' },
    gridImage: { width: '100%', height: '100%' },
    gridText: { fontSize: 11, textAlign: 'center' },

    // Sheet modals
    sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%', borderTopWidth: 1, borderColor: COLORS.border },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 },
    sheetImage: { width: '100%', height: 260, borderRadius: RADIUS.lg, marginBottom: 12 },
    sheetContent: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
    miniAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    miniAvatarImg: { width: 32, height: 32, borderRadius: 16 },
    miniAvatarText: { fontWeight: '700', fontSize: 12 },
    closeSheetBtn: { borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    msgInput: { borderRadius: RADIUS.md, borderWidth: 1, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
    sendMsgBtn: { borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
}); 