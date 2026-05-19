import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, Image, ActivityIndicator, Alert, Modal,
    ScrollView, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

const { width: SW } = Dimensions.get('window');
const POST_SIZE = (SW - 6) / 3;

export default function SearchScreen() {
    const C = useTheme();
    const { user } = useAuthStore();
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('posts');
    const [posts, setPosts] = useState([]);
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [following, setFollowing] = useState(new Set());

    // Profile view state//
    const [profileScreen, setProfileScreen] = useState(null);
    const [profilePosts, setProfilePosts] = useState([]);
    const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 });

    // Follow list state//
    const [followModal, setFollowModal] = useState(null);
    const [followList, setFollowList] = useState([]);
    const [followListLoading, setFollowListLoading] = useState(false);

    // Post detail state//
    const [postModal, setPostModal] = useState(null);
    const [postLikes, setPostLikes] = useState([]);
    const [postComments, setPostComments] = useState([]);
    const [postLoading, setPostLoading] = useState(false);

    // Message state//
    const [msgModal, setMsgModal] = useState(null);
    const [msgText, setMsgText] = useState('');
    const [msgSending, setMsgSending] = useState(false);

    //Search//
    const doSearch = useCallback(async (text) => {
        setQuery(text);
        if (!text || text.length < 2) { setPosts([]); setPeople([]); setSearched(false); return; }
        setLoading(true);
        setSearched(true);
        const isHashtag = text.startsWith('#');
        const isMention = text.startsWith('@');
        const q = text.replace(/^[#@]/, '').trim();
        if (!q) { setLoading(false); return; }

        const { data: fData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        if (fData) setFollowing(new Set(fData.map(f => f.following_id)));

        if (!isMention) {
            const { data } = await supabase.from('posts').select('*')
                .ilike('content', '%' + q + '%').order('created_at', { ascending: false }).limit(20);
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
                .or('username.ilike.%' + q + '%,full_name.ilike.%' + q + '%').neq('id', user.id).limit(20);
            setPeople(data || []);
        } else setPeople([]);

        setLoading(false);
    }, []);

    //Follow toggl//
    const toggleFollow = async (targetId) => {
        const isFollowing = following.has(targetId);
        setFollowing(prev => {
            const next = new Set(prev);
            isFollowing ? next.delete(targetId) : next.add(targetId);
            return next;
        });
        if (isFollowing) {
            await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
        } else {
            await supabase.from('follows').insert([{ follower_id: user.id, following_id: targetId }]);
        }
        if (profileScreen?.id === targetId) loadProfileStats(targetId);
    };

    //Open profile//
    const openProfile = async (profile) => {
        setProfileScreen(profile);
        setProfilePosts([]);
        loadProfileStats(profile.id);
        const { data } = await supabase.from('posts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
        setProfilePosts(data || []);
    };

    const loadProfileStats = async (id) => {
        const { count: f1 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id);
        const { count: f2 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id);
        setProfileStats({ followers: f1 || 0, following: f2 || 0 });
    };

    //Open follow list//
    const openFollowList = async (type) => {
        setFollowModal(type);
        setFollowListLoading(true);
        setFollowList([]);
        const profileId = profileScreen.id;
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
        setFollowListLoading(false);
    };

    //Open post detail//
    const openPost = async (post) => {
        setPostModal(post);
        setPostLikes([]);
        setPostComments([]);
        setPostLoading(true);
        const { data: likes } = await supabase.from('likes').select('user_id').eq('post_id', post.id);
        if (likes && likes.length > 0) {
            const ids = likes.map(l => l.user_id);
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            setPostLikes(profs || []);
        }
        const { data: comments } = await supabase.from('comments').select('id, user_id, content, created_at').eq('post_id', post.id).order('created_at', { ascending: true });
        if (comments && comments.length > 0) {
            const ids = [...new Set(comments.map(c => c.user_id))];
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            const pm = {};
            if (profs) profs.forEach(p => { pm[p.id] = p; });
            setPostComments(comments.map(c => ({ ...c, profiles: pm[c.user_id] || null })));
        }
        setPostLoading(false);
    };

    // Send message//
    const sendMessage = async () => {
        if (!msgText.trim() || !msgModal) return;
        setMsgSending(true);
        const { error } = await supabase.from('messages').insert([{
            sender_id: user.id, receiver_id: msgModal.id, content: msgText.trim(),
        }]);
        setMsgSending(false);
        if (!error) {
            setMsgText('');
            setMsgModal(null);
            Alert.alert('Sent!', 'Message delivered to @' + msgModal.username);
        } else {
            Alert.alert('Error', error.message);
        }
    };

    const Avatar = ({ uri, name, size = 38 }) => (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {uri
                ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
                : <Text style={{ color: C.primaryLight, fontWeight: '700', fontSize: size * 0.37 }}>{(name || '?')[0].toUpperCase()}</Text>
            }
        </View>
    );

    //SEARCH RESULTS SCREEN//
    const SearchScreen = (
        <View style={[S.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[S.header, { borderBottomColor: C.border }]}>
                <Text style={[S.headerTitle, { color: C.text }]}>Search</Text>
            </View>
            <View style={[S.searchBar, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Ionicons name="search-outline" size={18} color={C.textMuted} />
                <TextInput
                    style={[S.searchInput, { color: C.text }]}
                    placeholder="Search posts, #hashtags, @people..."
                    placeholderTextColor={C.textMuted}
                    value={query} onChangeText={doSearch} autoCapitalize="none"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setPosts([]); setPeople([]); setSearched(false); }}>
                        <Ionicons name="close-circle" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {searched && (
                <View style={[S.tabs, { borderBottomColor: C.border }]}>
                    {['posts', 'people'].map(t => (
                        <TouchableOpacity key={t} style={[S.tabBtn, tab === t && { borderBottomWidth: 2, borderBottomColor: C.primary }]} onPress={() => setTab(t)}>
                            <Text style={[S.tabText, { color: tab === t ? C.primary : C.textSecondary }]}>
                                {t === 'posts' ? 'Posts' + (posts.length > 0 ? ' (' + posts.length + ')' : '') : 'People' + (people.length > 0 ? ' (' + people.length + ')' : '')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> :
                !searched ? (
                    <View style={S.empty}>
                        <Ionicons name="search-outline" size={48} color={C.textMuted} />
                        <Text style={[S.emptyTitle, { color: C.text }]}>Discover Glance</Text>
                        <Text style={[S.emptySub, { color: C.textSecondary }]}>Search posts, #hashtags or @people</Text>
                    </View>
                ) : (tab === 'posts' ? posts : people).length === 0 ? (
                    <View style={S.empty}><Text style={[S.emptyTitle, { color: C.text }]}>No results</Text></View>
                ) : tab === 'posts' ? (
                    <FlatList
                        data={posts} keyExtractor={i => i.id.toString()}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => (
                            <View style={[S.postCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                                <View style={S.row}>
                                    <Avatar uri={item.profiles?.avatar_url} name={item.profiles?.username} />
                                    <Text style={[S.username, { color: C.textSecondary, marginLeft: 8 }]}>{'@' + (item.profiles?.username || 'user')}</Text>
                                </View>
                                {item.content ? <Text style={[S.postText, { color: C.text }]} numberOfLines={3}>{item.content}</Text> : null}
                                {item.image_url ? <Image source={{ uri: item.image_url }} style={S.postImg} resizeMode="cover" /> : null}
                            </View>
                        )}
                    />
                ) : (
                    <FlatList
                        data={people} keyExtractor={i => i.id}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={[S.personRow, { borderBottomColor: C.border }]} onPress={() => openProfile(item)}>
                                <Avatar uri={item.avatar_url} name={item.username} size={44} />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[S.personName, { color: C.text }]}>{item.full_name}</Text>
                                    <Text style={[S.username, { color: C.textSecondary }]}>{'@' + item.username}</Text>
                                </View>
                                <TouchableOpacity
                                    style={[S.followBtn, { backgroundColor: following.has(item.id) ? C.surface : C.primary, borderColor: following.has(item.id) ? C.border : C.primary }]}
                                    onPress={() => toggleFollow(item.id)}
                                >
                                    <Text style={[S.followBtnText, { color: following.has(item.id) ? C.textSecondary : '#fff' }]}>
                                        {following.has(item.id) ? 'Following' : 'Follow'}
                                    </Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        )}
                    />
                )
            }
        </View>
    );

    //PROFILE SCREEN//
    const ProfileView = profileScreen && (
        <View style={[S.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[S.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={() => { setProfileScreen(null); setProfilePosts([]); }} style={{ padding: 6 }}>
                    <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={[S.headerTitle, { color: C.text, fontSize: 16 }]}>{'@' + profileScreen.username}</Text>
                <TouchableOpacity onPress={() => Alert.alert('Report', 'User reported.')} style={{ padding: 6 }}>
                    <Ionicons name="flag-outline" size={20} color={C.textMuted} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Avatar + stats */}
                <View style={[S.row, { padding: 16, gap: 20 }]}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: C.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}>
                        {profileScreen.avatar_url
                            ? <Image source={{ uri: profileScreen.avatar_url }} style={{ width: 80, height: 80 }} />
                            : <Text style={{ color: C.primaryLight, fontSize: 28, fontWeight: '700' }}>{profileScreen.username[0].toUpperCase()}</Text>
                        }
                    </View>
                    <View style={[S.row, { flex: 1, justifyContent: 'space-around' }]}>
                        <View style={S.statItem}>
                            <Text style={[S.statNum, { color: C.text }]}>{profilePosts.length}</Text>
                            <Text style={[S.statLabel, { color: C.textSecondary }]}>Posts</Text>
                        </View>
                        <TouchableOpacity style={S.statItem} onPress={() => openFollowList('followers')}>
                            <Text style={[S.statNum, { color: C.text }]}>{profileStats.followers}</Text>
                            <Text style={[S.statLabel, { color: C.primary }]}>Followers</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.statItem} onPress={() => openFollowList('following')}>
                            <Text style={[S.statNum, { color: C.text }]}>{profileStats.following}</Text>
                            <Text style={[S.statLabel, { color: C.primary }]}>Following</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Bio */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <Text style={[S.personName, { color: C.text, fontSize: 16 }]}>{profileScreen.full_name}</Text>
                    {profileScreen.bio ? <Text style={[S.username, { color: C.textSecondary, marginTop: 4 }]}>{profileScreen.bio}</Text> : null}
                </View>

                {/* Action buttons */}
                <View style={[S.row, { paddingHorizontal: 16, gap: 10, marginBottom: 16 }]}>
                    <TouchableOpacity
                        style={[S.actionBtn, { backgroundColor: following.has(profileScreen.id) ? C.surface : C.primary, borderColor: following.has(profileScreen.id) ? C.border : C.primary }]}
                        onPress={() => toggleFollow(profileScreen.id)}
                    >
                        <Text style={{ color: following.has(profileScreen.id) ? C.textSecondary : '#fff', fontWeight: '700', fontSize: 14 }}>
                            {following.has(profileScreen.id) ? '✓ Following' : 'Follow'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[S.actionBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                        onPress={() => setMsgModal(profileScreen)}
                    >
                        <Ionicons name="chatbubble-outline" size={16} color={C.text} />
                        <Text style={{ color: C.text, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>Message</Text>
                    </TouchableOpacity>
                </View>

                {/* Posts grid */}
                {profilePosts.length === 0
                    ? <Text style={[S.emptySub, { color: C.textSecondary, textAlign: 'center', paddingVertical: 30 }]}>No posts yet</Text>
                    : <View style={S.grid}>
                        {profilePosts.map(post => (
                            <TouchableOpacity key={post.id} style={[S.gridCell, { backgroundColor: C.surface }]} onPress={() => openPost(post)}>
                                {post.image_url
                                    ? <Image source={{ uri: post.image_url }} style={{ width: '100%', height: '100%' }} />
                                    : <View style={{ flex: 1, padding: 6, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: C.textSecondary, fontSize: 10, textAlign: 'center' }} numberOfLines={4}>{post.content}</Text>
                                    </View>
                                }
                            </TouchableOpacity>
                        ))}
                    </View>
                }
            </ScrollView>
        </View>
    );

    // RENDER//
    return (
        <View style={{ flex: 1 }}>
            {profileScreen ? ProfileView : SearchScreen}

            {/* Post detail */}
            <Modal visible={postModal !== null} animationType="slide" transparent onRequestClose={() => { setPostModal(null); setPostLikes([]); setPostComments([]); }}>
                <View style={S.sheetBg}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setPostModal(null); setPostLikes([]); setPostComments([]); }} />
                    <View style={[S.sheet, { backgroundColor: C.surface }]}>
                        <View style={S.handle} />
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {postModal?.image_url ? <Image source={{ uri: postModal.image_url }} style={S.sheetImg} resizeMode="cover" /> : null}
                            {postModal?.content ? <Text style={[S.postText, { color: C.text, marginBottom: 12 }]}>{postModal.content}</Text> : null}
                            {postLoading
                                ? <ActivityIndicator color={C.primary} />
                                : <>
                                    <Text style={[S.sectionTitle, { color: C.text }]}>
                                        {'❤️ ' + (postLikes.length > 0 ? 'Liked by ' + postLikes.length : 'No likes yet')}
                                    </Text>
                                    {postLikes.length > 0 && (
                                        <View style={[S.row, { flexWrap: 'wrap', gap: 10, marginBottom: 14 }]}>
                                            {postLikes.map((p, i) => (
                                                <View key={i} style={{ alignItems: 'center', gap: 3 }}>
                                                    <Avatar uri={p.avatar_url} name={p.username} size={32} />
                                                    <Text style={{ color: C.textSecondary, fontSize: 10 }}>{'@' + p.username}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    <Text style={[S.sectionTitle, { color: C.text }]}>
                                        {'💬 Comments (' + postComments.length + ')'}
                                    </Text>
                                    {postComments.length === 0
                                        ? <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>No comments yet</Text>
                                        : postComments.map((c, i) => (
                                            <View key={i} style={[S.row, { gap: 8, marginBottom: 8, alignItems: 'flex-start' }]}>
                                                <Avatar uri={c.profiles?.avatar_url} name={c.profiles?.username} size={30} />
                                                <View style={{ flex: 1, backgroundColor: C.card, borderRadius: RADIUS.md, padding: 8 }}>
                                                    <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>{'@' + (c.profiles?.username || 'user')}</Text>
                                                    <Text style={{ color: C.text, fontSize: 13, marginTop: 2 }}>{c.content}</Text>
                                                </View>
                                            </View>
                                        ))
                                    }
                                </>
                            }
                            <TouchableOpacity style={[S.closeBtn, { backgroundColor: C.primary }]} onPress={() => { setPostModal(null); setPostLikes([]); setPostComments([]); }}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Follow list modal */}
            <Modal visible={followModal !== null} animationType="slide" transparent onRequestClose={() => { setFollowModal(null); setFollowList([]); }}>
                <View style={S.sheetBg}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setFollowModal(null); setFollowList([]); }} />
                    <View style={[S.sheet, { backgroundColor: C.surface, maxHeight: '65%' }]}>
                        <View style={S.handle} />
                        <View style={[S.row, { marginBottom: 14, alignItems: 'center' }]}>
                            <TouchableOpacity onPress={() => { setFollowModal(null); setFollowList([]); }} style={{ padding: 4 }}>
                                <Ionicons name="arrow-back" size={20} color={C.text} />
                            </TouchableOpacity>
                            <Text style={[S.sectionTitle, { color: C.text, flex: 1, textAlign: 'center' }]}>
                                {followModal === 'followers' ? 'Followers' : 'Following'}
                            </Text>
                            <View style={{ width: 28 }} />
                        </View>
                        {followListLoading ? <ActivityIndicator color={C.primary} /> :
                            followList.length === 0
                                ? <Text style={{ color: C.textSecondary, textAlign: 'center', marginVertical: 20 }}>{'No ' + (followModal || '') + ' yet'}</Text>
                                : <FlatList
                                    data={followList} keyExtractor={i => i.id}
                                    renderItem={({ item }) => (
                                        <View style={[S.personRow, { borderBottomColor: C.border }]}>
                                            <Avatar uri={item.avatar_url} name={item.username} size={40} />
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>{item.full_name}</Text>
                                                <Text style={{ color: C.textSecondary, fontSize: 13 }}>{'@' + item.username}</Text>
                                            </View>
                                        </View>
                                    )}
                                />
                        }
                    </View>
                </View>
            </Modal>

            {/* Message modal */}
            <Modal visible={msgModal !== null} animationType="slide" transparent onRequestClose={() => { setMsgModal(null); setMsgText(''); }}>
                <KeyboardAvoidingView style={S.sheetBg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setMsgModal(null); setMsgText(''); }} />
                    <View style={[S.sheet, { backgroundColor: C.surface }]}>
                        <View style={S.handle} />
                        <Text style={[S.sectionTitle, { color: C.text, textAlign: 'center', marginBottom: 14 }]}>
                            {'Message @' + (msgModal?.username || '')}
                        </Text>
                        <TextInput
                            style={[S.msgInput, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
                            placeholder="Write a message..."
                            placeholderTextColor={C.textMuted}
                            value={msgText} onChangeText={setMsgText}
                            multiline autoFocus
                        />
                        <TouchableOpacity
                            style={[S.closeBtn, { backgroundColor: msgText.trim() ? C.primary : C.border, opacity: msgSending ? 0.6 : 1 }]}
                            onPress={sendMessage}
                            disabled={msgSending || !msgText.trim()}
                        >
                            {msgSending
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send Message</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const S = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
    headerTitle: { fontSize: 20, fontWeight: '700' },
    searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, gap: 8 },
    searchInput: { flex: 1, fontSize: 15 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1 },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '500' },
    postCard: { marginHorizontal: 12, marginTop: 10, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1 },
    postText: { fontSize: 14, lineHeight: 20, marginTop: 6 },
    postImg: { width: '100%', height: 160, borderRadius: RADIUS.md, marginTop: 8 },
    personRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    personName: { fontWeight: '600', fontSize: 15 },
    username: { fontSize: 13 },
    followBtn: { borderWidth: 1.5, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 6 },
    followBtnText: { fontWeight: '600', fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '700' },
    emptySub: { fontSize: 14 },
    statItem: { alignItems: 'center' },
    statNum: { fontSize: 18, fontWeight: '700' },
    statLabel: { fontSize: 12, marginTop: 2 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2 },
    gridCell: { width: POST_SIZE, height: POST_SIZE, overflow: 'hidden' },
    sheetBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 14 },
    sheetImg: { width: '100%', height: 260, borderRadius: RADIUS.lg, marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
    closeBtn: { borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    msgInput: { borderRadius: RADIUS.md, borderWidth: 1, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
});