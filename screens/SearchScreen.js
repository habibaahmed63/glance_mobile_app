import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, Image, ActivityIndicator, Alert, Modal, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

export default function SearchScreen({ themeColors }) {
    const C = themeColors || COLORS;
    const { user } = useAuthStore();
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState('posts');
    const [posts, setPosts] = useState([]);
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [followingUsers, setFollowingUsers] = useState(new Set());
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [profilePosts, setProfilePosts] = useState([]);
    const [profileStats, setProfileStats] = useState({ followers: 0, following: 0, posts: 0 });

    const handleSearch = useCallback(async (text) => {
        setQuery(text);
        if (!text.trim() || text.length < 2) {
            setPosts([]); setPeople([]); setSearched(false); return;
        }
        setLoading(true);
        setSearched(true);
        const isHashtag = text.startsWith('#');
        const isMention = text.startsWith('@');
        const clean = text.replace(/^[#@]/, '').trim();
        if (!clean) { setLoading(false); return; }

        // Fetch following list
        const { data: fData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        if (fData) setFollowingUsers(new Set(fData.map(f => f.following_id)));

        if (!isMention) {
            const { data: postData } = await supabase
                .from('posts').select('*, profiles(username, avatar_url)')
                .ilike('content', `%${clean}%`).order('created_at', { ascending: false }).limit(20);
            setPosts(postData || []);
        } else setPosts([]);

        if (!isHashtag) {
            const { data: peopleData } = await supabase
                .from('profiles').select('*')
                .or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`)
                .neq('id', user.id).limit(20);
            setPeople(peopleData || []);
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
    };

    const openProfile = async (profile) => {
        setSelectedProfile(profile);
        // Fetch their posts
        const { data: posts } = await supabase.from('posts').select('*')
            .eq('user_id', profile.id).order('created_at', { ascending: false });
        setProfilePosts(posts || []);
        // Fetch stats
        const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id);
        const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id);
        setProfileStats({ followers: followers || 0, following: following || 0, posts: posts?.length || 0 });
    };

    const reportUser = (profileId) => {
        Alert.alert('Report User', 'Report this user for inappropriate behavior?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Report', style: 'destructive', onPress: () => Alert.alert('Reported', 'Thank you for keeping Glance safe.') }
        ]);
    };

    const renderPost = ({ item }) => (
        <View style={[styles.postCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.postHeader}>
                <View style={[styles.avatar, { backgroundColor: C.card }]}>
                    {item.profiles?.avatar_url
                        ? <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatarImg} />
                        : <Text style={[styles.avatarText, { color: C.primaryLight }]}>{item.profiles?.username?.[0]?.toUpperCase()}</Text>
                    }
                </View>
                <Text style={[styles.username, { color: C.textSecondary }]}>@{item.profiles?.username}</Text>
            </View>
            <Text style={[styles.postContent, { color: C.text }]} numberOfLines={3}>{item.content}</Text>
            {item.image_url && <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />}
        </View>
    );

    const renderPerson = ({ item }) => (
        <TouchableOpacity style={[styles.personCard, { borderBottomColor: C.border }]} onPress={() => openProfile(item)}>
            <View style={[styles.avatar, { backgroundColor: C.card }]}>
                {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    : <Text style={[styles.avatarText, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>
                }
            </View>
            <View style={styles.personInfo}>
                <Text style={[styles.personName, { color: C.text }]}>{item.full_name}</Text>
                <Text style={[styles.personUsername, { color: C.textSecondary }]}>@{item.username}</Text>
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
                    autoCapitalize="none" returnKeyType="search"
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
                            <Text style={[styles.tabText, { color: activeTab === tab ? C.primaryLight : C.textSecondary }]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} {tab === 'posts' ? posts.length > 0 && `(${posts.length})` : people.length > 0 && `(${people.length})`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {loading ? (
                <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
            ) : !searched ? (
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
            )}

            {/* User Profile Modal */}
            <Modal visible={selectedProfile !== null} animationType="slide"
                onRequestClose={() => { setSelectedProfile(null); setProfilePosts([]); }}>
                {selectedProfile && (
                    <View style={[styles.container, { backgroundColor: C.background }]}>
                        <StatusBar style="light" />
                        <View style={[styles.header, { borderBottomColor: C.border }]}>
                            <TouchableOpacity onPress={() => { setSelectedProfile(null); setProfilePosts([]); }}>
                                <Ionicons name="arrow-back" size={22} color={C.text} />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { color: C.text, fontSize: 16 }]}>@{selectedProfile.username}</Text>
                            <TouchableOpacity onPress={() => reportUser(selectedProfile.id)}>
                                <Ionicons name="flag-outline" size={20} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Profile header */}
                            <View style={styles.profileHeader}>
                                <View style={[styles.profileAvatar, { backgroundColor: C.surface, borderColor: C.primary }]}>
                                    {selectedProfile.avatar_url
                                        ? <Image source={{ uri: selectedProfile.avatar_url }} style={styles.profileAvatarImg} />
                                        : <Text style={[styles.profileAvatarText, { color: C.primaryLight }]}>{selectedProfile.username?.[0]?.toUpperCase()}</Text>
                                    }
                                </View>
                                <View style={styles.profileStats}>
                                    <View style={styles.statItem}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profileStats.posts}</Text>
                                        <Text style={[styles.statLabel, { color: C.textSecondary }]}>Posts</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profileStats.followers}</Text>
                                        <Text style={[styles.statLabel, { color: C.textSecondary }]}>Followers</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={[styles.statNumber, { color: C.text }]}>{profileStats.following}</Text>
                                        <Text style={[styles.statLabel, { color: C.textSecondary }]}>Following</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.profileBio}>
                                <Text style={[styles.profileName, { color: C.text }]}>{selectedProfile.full_name}</Text>
                                {selectedProfile.bio ? <Text style={[styles.profileBioText, { color: C.textSecondary }]}>{selectedProfile.bio}</Text> : null}
                            </View>

                            {/* Action buttons */}
                            <View style={styles.profileActions}>
                                <TouchableOpacity
                                    style={[styles.followLargeBtn, followingUsers.has(selectedProfile.id) && { backgroundColor: C.primary }]}
                                    onPress={() => followUser(selectedProfile.id)}
                                >
                                    <Text style={[styles.followLargeBtnText, followingUsers.has(selectedProfile.id) && { color: '#fff' }]}>
                                        {followingUsers.has(selectedProfile.id) ? 'Following' : 'Follow'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.messageLargeBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                                    onPress={() => { setSelectedProfile(null); }}
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
                                        <View key={post.id} style={[styles.gridItem, { backgroundColor: C.surface }]}>
                                            {post.image_url
                                                ? <Image source={{ uri: post.image_url }} style={styles.gridImage} />
                                                : <Text style={[styles.gridText, { color: C.textSecondary }]} numberOfLines={4}>{post.content}</Text>
                                            }
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 22, fontWeight: '700' },
    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 16, marginVertical: 12,
        borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 4 },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '500' },
    postCard: { marginHorizontal: 16, marginTop: 10, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1 },
    postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    postContent: { fontSize: 14, lineHeight: 20 },
    postImage: { width: '100%', height: 160, borderRadius: RADIUS.md, marginTop: 8 },
    personCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
    personInfo: { flex: 1 },
    personName: { fontWeight: '600', fontSize: 15 },
    personUsername: { fontSize: 13, marginTop: 2 },
    followBtn: {
        borderWidth: 1.5, borderColor: COLORS.primary,
        borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 6,
    },
    followBtnText: { color: COLORS.primaryLight, fontWeight: '600', fontSize: 13 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImg: { width: 36, height: 36, borderRadius: 18 },
    avatarText: { fontWeight: '700', fontSize: 14 },
    username: { fontSize: 13, fontWeight: '600' },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
    emptyTitle: { fontSize: 20, fontWeight: '700' },
    emptySubtext: { fontSize: 14 },

    // Profile modal
    profileHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 20 },
    profileAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    profileAvatarImg: { width: 80, height: 80, borderRadius: 40 },
    profileAvatarText: { fontSize: 28, fontWeight: '700' },
    profileStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 18, fontWeight: '700' },
    statLabel: { fontSize: 12, marginTop: 2 },
    profileBio: { paddingHorizontal: 16, paddingBottom: 12 },
    profileName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    profileBioText: { fontSize: 14, lineHeight: 20 },
    profileActions: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
    followLargeBtn: {
        flex: 1, paddingVertical: 10, borderRadius: RADIUS.md,
        alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.primary,
    },
    followLargeBtnText: { fontWeight: '700', fontSize: 14, color: COLORS.primaryLight },
    messageLargeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: RADIUS.md, gap: 6, borderWidth: 1,
    },
    messageLargeBtnText: { fontWeight: '600', fontSize: 14 },
    postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2 },
    gridItem: { width: '32.5%', aspectRatio: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    gridImage: { width: '100%', height: '100%' },
    gridText: { fontSize: 11, padding: 6, textAlign: 'center' },
});