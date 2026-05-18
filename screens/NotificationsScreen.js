import { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Image, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

export default function NotificationsScreen({ onClose }) {
    const C = useTheme();
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            // Step 1: Get all post IDs that belong to the current user
            const { data: myPosts } = await supabase
                .from('posts')
                .select('id, content')
                .eq('user_id', user.id);

            const myPostIds = (myPosts || []).map(p => p.id);
            const postContentMap = {};
            (myPosts || []).forEach(p => { postContentMap[p.id] = p.content; });

            let likesNotifs = [];
            let commentsNotifs = [];

            if (myPostIds.length > 0) {
                // Step 2: Get likes on my posts (exclude my own likes)
                const { data: likesData } = await supabase
                    .from('likes')
                    .select('id, user_id, post_id, created_at')
                    .in('post_id', myPostIds)
                    .neq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (likesData && likesData.length > 0) {
                    const likerIds = [...new Set(likesData.map(l => l.user_id))];
                    const { data: likerProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url')
                        .in('id', likerIds);
                    const pm = {};
                    if (likerProfiles) likerProfiles.forEach(p => { pm[p.id] = p; });

                    likesNotifs = likesData.map(l => ({
                        id: `like_${l.id}`,
                        type: 'like',
                        username: pm[l.user_id]?.username || 'Someone',
                        avatar_url: pm[l.user_id]?.avatar_url || null,
                        message: 'liked your post',
                        preview: postContentMap[l.post_id] || null,
                        created_at: l.created_at,
                    }));
                }

                // Step 3: Get comments on my posts (exclude my own comments)
                const { data: commentsData } = await supabase
                    .from('comments')
                    .select('id, user_id, post_id, content, created_at')
                    .in('post_id', myPostIds)
                    .neq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (commentsData && commentsData.length > 0) {
                    const commenterIds = [...new Set(commentsData.map(c => c.user_id))];
                    const { data: commenterProfiles } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url')
                        .in('id', commenterIds);
                    const pm2 = {};
                    if (commenterProfiles) commenterProfiles.forEach(p => { pm2[p.id] = p; });

                    commentsNotifs = commentsData.map(c => ({
                        id: `comment_${c.id}`,
                        type: 'comment',
                        username: pm2[c.user_id]?.username || 'Someone',
                        avatar_url: pm2[c.user_id]?.avatar_url || null,
                        message: 'commented on your post',
                        preview: c.content,
                        postPreview: postContentMap[c.post_id] || null,
                        created_at: c.created_at,
                    }));
                }
            }

            // Step 4: Get new followers
            const { data: followsData } = await supabase
                .from('follows')
                .select('id, follower_id, created_at')
                .eq('following_id', user.id)
                .order('created_at', { ascending: false })
                .limit(15);

            let followNotifs = [];
            if (followsData && followsData.length > 0) {
                const followerIds = followsData.map(f => f.follower_id);
                const { data: followerProfiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', followerIds);
                const pm3 = {};
                if (followerProfiles) followerProfiles.forEach(p => { pm3[p.id] = p; });

                followNotifs = followsData.map(f => ({
                    id: `follow_${f.id}`,
                    type: 'follow',
                    username: pm3[f.follower_id]?.username || 'Someone',
                    avatar_url: pm3[f.follower_id]?.avatar_url || null,
                    message: 'started following you',
                    created_at: f.created_at,
                }));
            }

            // Merge and sort all notifications by date
            const all = [...likesNotifs, ...commentsNotifs, ...followNotifs]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setNotifications(all);
        } catch (e) {
            console.log('Notifications error:', e.message);
        }
        setLoading(false);
    };

    const getIcon = (type) => {
        if (type === 'like') return { name: 'heart', color: '#f87171' };
        if (type === 'comment') return { name: 'chatbubble', color: COLORS.primary };
        return { name: 'person-add', color: '#4ade80' };
    };

    const renderNotif = ({ item }) => {
        const icon = getIcon(item.type);
        return (
            <View style={[styles.notifItem, { borderBottomColor: C.border }]}>
                {/* Avatar */}
                {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: C.card }]}>
                        <Text style={[styles.avatarInitial, { color: C.primaryLight }]}>
                            {item.username?.[0]?.toUpperCase() || '?'}
                        </Text>
                    </View>
                )}

                {/* Content */}
                <View style={styles.notifContent}>
                    <Text style={[styles.notifText, { color: C.text }]}>
                        <Text style={[styles.notifUsername, { color: C.primaryLight }]}>{'@' + item.username + ' '}</Text>
                        <Text style={{ color: C.text }}>{item.message}</Text>
                    </Text>
                    {item.preview ? (
                        <Text style={[styles.preview, { color: C.textMuted }]} numberOfLines={1}>
                            {item.preview}
                        </Text>
                    ) : null}
                    <Text style={[styles.time, { color: C.textMuted }]}>
                        {getTimeAgo(item.created_at)}
                    </Text>
                </View>

                {/* Icon badge */}
                <View style={[styles.iconBadge, { backgroundColor: icon.color + '22' }]}>
                    <Ionicons name={icon.name} size={16} color={icon.color} />
                </View>
            </View>
        );
    };

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} onPress={onClose} />
            <View style={[styles.panel, { backgroundColor: C.surface, borderLeftColor: C.border }]}>
                <StatusBar style="light" />

                <View style={[styles.header, { borderBottomColor: C.border }]}>
                    <Text style={[styles.title, { color: C.text }]}>Notifications</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
                ) : notifications.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="notifications-outline" size={48} color={C.textMuted} />
                        <Text style={[styles.emptyText, { color: C.textSecondary }]}>No notifications yet</Text>
                        <Text style={[styles.emptySub, { color: C.textMuted }]}>
                            Likes, comments and follows will appear here
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={notifications}
                        keyExtractor={item => item.id}
                        renderItem={renderNotif}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </View>
    );
}

function getTimeAgo(dateStr) {
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

const styles = StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    panel: { width: '82%', height: '100%', borderLeftWidth: 1 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1,
    },
    title: { fontSize: 18, fontWeight: '700' },
    closeBtn: { padding: 4 },
    notifItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, gap: 12,
    },
    avatar: { width: 42, height: 42, borderRadius: 21 },
    avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 16, fontWeight: '700' },
    notifContent: { flex: 1 },
    notifText: { fontSize: 13, lineHeight: 18 },
    notifUsername: { fontWeight: '700' },
    preview: { fontSize: 12, marginTop: 3, fontStyle: 'italic' },
    time: { fontSize: 11, marginTop: 4 },
    iconBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
    emptyText: { fontSize: 16, fontWeight: '700' },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});