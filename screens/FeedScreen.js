import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    RefreshControl, Alert, Image, TextInput,
    KeyboardAvoidingView, Platform, Modal, ScrollView,
    ActivityIndicator, FlatList
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import usePostsStore from '../store/postsStore';
import StoriesBar from '../components/StoriesBar';
import ReactionsBar from '../components/ReactionsBar';
import ReportModal from '../components/ReportModal';
import DraftsScreen from './DraftsScreen';
import { COLORS, RADIUS } from '../constants/theme';
import { useTheme } from '../utils/useTheme';
import { successFeedback } from '../utils/haptics';
import { useNetworkStatus } from '../utils/useNetworkStatus';
import { saveDraft } from '../utils/drafts';
import { sendLocalNotification } from '../utils/notifications';

export default function FeedScreen({ onNotifPress, onARPress }) {
    const C = useTheme();
    const { user, profile } = useAuthStore();
    const { posts, loading, fetchPosts, addPost } = usePostsStore();
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [postContent, setPostContent] = useState('');
    const [postImage, setPostImage] = useState(null);
    const [posting, setPosting] = useState(false);
    const [draftsVisible, setDraftsVisible] = useState(false);
    const [reportPostId, setReportPostId] = useState(null);
    const [commentsPostId, setCommentsPostId] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [sendingComment, setSendingComment] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionSuggestions, setMentionSuggestions] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [likesModalPost, setLikesModalPost] = useState(null);
    const [commentCounts, setCommentCounts] = useState({});
    const [postLikes, setPostLikes] = useState([]);
    const { isConnected } = useNetworkStatus();
    const inputRef = useRef(null);

    useEffect(() => {
        loadData();
        const unsub = subscribeToFeed();
        return () => { if (unsub) unsub(); };
    }, []);

    const loadData = async () => {
        await fetchPosts();
        await fetchCommentCounts();
    };

    const fetchCommentCounts = async () => {
        const { data } = await supabase.from('comments').select('post_id');
        if (data) {
            const counts = {};
            data.forEach(c => { counts[c.post_id] = (counts[c.post_id] || 0) + 1; });
            setCommentCounts(counts);
        }
    };

    const subscribeToFeed = () => {
        const channel = supabase.channel('feed_posts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
                async (payload) => {
                    const { data: prof } = await supabase.from('profiles')
                        .select('id, username, avatar_url, full_name').eq('id', payload.new.user_id).single();
                    addPost({ ...payload.new, profiles: prof || null });
                })
            .subscribe();
        return () => supabase.removeChannel(channel);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchPosts();
        setRefreshing(false);
    }, []);

    // ── Image picker (camera + library) ──────────────────────────────────────
    const pickImage = async (source) => {
        if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed'); return; }
            const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!result.canceled) setPostImage(result.assets[0].uri);
        } else {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!result.canceled) setPostImage(result.assets[0].uri);
        }
    };

    const showImagePicker = () => {
        Alert.alert('Add Photo', 'Choose source', [
            { text: 'Camera', onPress: () => pickImage('camera') },
            { text: 'Photo Library', onPress: () => pickImage('library') },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    // ── Mention detection ─────────────────────────────────────────────────────
    const handlePostInput = async (text) => {
        setPostContent(text);
        const words = text.split(' ');
        const lastWord = words[words.length - 1];
        if (lastWord.startsWith('@') && lastWord.length > 1) {
            const q = lastWord.slice(1);
            setMentionQuery(q);
            setShowMentions(true);
            const { data } = await supabase.from('profiles')
                .select('id, username, avatar_url').ilike('username', `%${q}%`).neq('id', user.id).limit(5);
            setMentionSuggestions(data || []);
        } else {
            setShowMentions(false);
            setMentionSuggestions([]);
        }
    };

    const insertMention = (username) => {
        const words = postContent.split(' ');
        words[words.length - 1] = `@${username} `;
        setPostContent(words.join(' '));
        setShowMentions(false);
        setMentionSuggestions([]);
        inputRef.current?.focus();
    };

    // ── Upload image ──────────────────────────────────────────────────────────
    const uploadPostImage = async (uri) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        const ab = await new Response(blob).arrayBuffer();
        const fileName = `posts/${user.id}_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from('media').upload(fileName, ab, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error(error.message);
        return supabase.storage.from('media').getPublicUrl(fileName).data.publicUrl;
    };

    // ── Create post ───────────────────────────────────────────────────────────
    const createPost = async () => {
        if (!postContent.trim() && !postImage) { Alert.alert('Empty post', 'Write something or add an image.'); return; }
        if (!isConnected) {
            await saveDraft({ content: postContent.trim(), imageUri: postImage });
            setPostContent(''); setPostImage(null); setModalVisible(false);
            Alert.alert('Saved as Draft 📝', 'No connection — saved for later.');
            return;
        }
        setPosting(true);
        try {
            let imageUrl = null;
            if (postImage) imageUrl = await uploadPostImage(postImage);
            const { data: newPost, error } = await supabase.from('posts').insert([{
                user_id: user.id, content: postContent.trim(), image_url: imageUrl,
            }]).select().single();
            if (error) throw new Error(error.message);
            // Add immediately to feed + profile
            addPost({ ...newPost, profiles: { username: profile?.username, avatar_url: profile?.avatar_url, full_name: profile?.full_name }, likes_count: 0 });
            setPostContent(''); setPostImage(null); setModalVisible(false);
            await successFeedback();
        } catch (e) { Alert.alert('Error', e.message); }
        setPosting(false);
    };

    const deletePost = (postId) => {
        Alert.alert('Delete post?', '', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await supabase.from('posts').delete().eq('id', postId);
                    await fetchPosts();
                }
            }
        ]);
    };

    // ── Comments ──────────────────────────────────────────────────────────────
    const fetchComments = async (postId) => {
        setLoadingComments(true);
        const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        if (data && data.length > 0) {
            const ids = [...new Set(data.map(c => c.user_id))];
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            const pm = {};
            if (profs) profs.forEach(p => { pm[p.id] = p; });
            setComments(data.map(c => ({ ...c, profiles: pm[c.user_id] || null })));
        } else setComments([]);
        setLoadingComments(false);
    };

    const sendComment = async () => {
        if (!newComment.trim() || !commentsPostId) return;
        setSendingComment(true);
        const text = newComment.trim();
        setNewComment('');
        const opt = {
            id: Date.now(), user_id: user.id, post_id: commentsPostId, content: text,
            created_at: new Date().toISOString(),
            profiles: { username: profile?.username, avatar_url: profile?.avatar_url },
        };
        setComments(prev => [...prev, opt]);
        const { error } = await supabase.from('comments').insert([{ user_id: user.id, post_id: commentsPostId, content: text }]);
        if (error) { setComments(prev => prev.filter(c => c.id !== opt.id)); setNewComment(text); }
        else { try { await sendLocalNotification('New Comment 💬', `${profile?.username} commented`); } catch (e) { } }
        setSendingComment(false);
    };

    // ── Likes modal ───────────────────────────────────────────────────────────
    const fetchLikes = async (postId) => {
        setLikesModalPost(postId);
        const { data } = await supabase.from('likes').select('user_id').eq('post_id', postId);
        if (data && data.length > 0) {
            const ids = data.map(l => l.user_id);
            const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url, full_name').in('id', ids);
            setPostLikes(profs || []);
        } else setPostLikes([]);
    };

    const getTimeAgo = (dateStr) => {
        const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        return `${Math.floor(diff / 86400)}d`;
    };

    const renderPost = ({ item }) => {
        const isOwner = item.user_id === user.id;
        return (
            <View style={[styles.postCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={styles.postHeader}>
                    <View style={[styles.avatarSmall, { backgroundColor: C.card }]}>
                        {item.profiles?.avatar_url
                            ? <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatarImg} />
                            : <Text style={[styles.avatarInitial, { color: C.primaryLight }]}>{item.profiles?.username?.[0]?.toUpperCase() || '?'}</Text>
                        }
                    </View>
                    <View style={styles.postMeta}>
                        <Text style={[styles.postUsername, { color: C.text }]}>@{item.profiles?.username || 'user'}</Text>
                        <Text style={[styles.postTime, { color: C.textMuted }]}>{getTimeAgo(item.created_at)}</Text>
                    </View>
                    <TouchableOpacity style={styles.moreBtn} onPress={() => {
                        if (isOwner) Alert.alert('Options', '', [
                            { text: 'Delete', style: 'destructive', onPress: () => deletePost(item.id) },
                            { text: 'Cancel', style: 'cancel' },
                        ]);
                        else setReportPostId(item.id);
                    }}>
                        <Ionicons name={isOwner ? 'ellipsis-horizontal' : 'flag-outline'} size={18} color={C.textMuted} />
                    </TouchableOpacity>
                </View>

                {item.content ? (
                    <Text style={[styles.postContent, { color: C.text }]}>
                        {item.content.split(' ').map((word, i) =>
                            word.startsWith('@')
                                ? <Text key={i} style={{ color: C.primary, fontWeight: '700' }}>{word + ' '}</Text>
                                : word.startsWith('#')
                                    ? <Text key={i} style={{ color: C.accent }}>{word + ' '}</Text>
                                    : <Text key={i} style={{ color: C.text }}>{word + ' '}</Text>
                        )}
                    </Text>
                ) : null}

                {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" /> : null}

                {/* Likes & comments count row */}
                {((item.likes_count || 0) > 0 || (commentCounts[item.id] || 0) > 0) && (
                    <View style={styles.countsRow}>
                        {(item.likes_count || 0) > 0 && (
                            <TouchableOpacity onPress={() => fetchLikes(item.id)} style={styles.countBtn}>
                                <Ionicons name="heart" size={14} color={C.primary} />
                                <Text style={[styles.countText, { color: C.textSecondary }]}>
                                    {(item.likes_count || 0) + ' ' + ((item.likes_count === 1) ? 'like' : 'likes')}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {(item.likes_count || 0) > 0 && (commentCounts[item.id] || 0) > 0 && (
                            <Text style={[styles.countDot, { color: C.textMuted }]}>·</Text>
                        )}
                        {(commentCounts[item.id] || 0) > 0 && (
                            <TouchableOpacity onPress={() => { setCommentsPostId(item.id); fetchComments(item.id); }} style={styles.countBtn}>
                                <Ionicons name="chatbubble" size={14} color={C.textSecondary} />
                                <Text style={[styles.countText, { color: C.textSecondary }]}>
                                    {(commentCounts[item.id] || 0) + ' ' + (commentCounts[item.id] === 1 ? 'comment' : 'comments')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                <View style={[styles.postActions, { borderTopColor: C.border }]}>
                    <ReactionsBar postId={item.id} initialLikes={item.likes_count || 0} />
                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setCommentsPostId(item.id); fetchComments(item.id); }}>
                        <Ionicons name="chatbubble-outline" size={18} color={C.textSecondary} />
                        <Text style={[styles.actionCount, { color: C.textSecondary }]}>
                            {commentCounts[item.id] ? `${commentCounts[item.id]} comment${commentCounts[item.id] !== 1 ? 's' : ''}` : 'Comment'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <Text style={[styles.headerTitle, { color: C.text }]}>GLANCE</Text>
                <View style={styles.headerActions}>
                    {!isConnected && (
                        <View style={styles.offlineBadge}>
                            <Text style={styles.offlineBadgeText}>Offline</Text>
                        </View>
                    )}
                    <TouchableOpacity onPress={onARPress} style={styles.iconBtn}>
                        <Ionicons name="color-wand-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDraftsVisible(true)} style={styles.iconBtn}>
                        <Ionicons name="document-text-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onNotifPress} style={styles.iconBtn}>
                        <Ionicons name="notifications-outline" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.newPostBtn, { backgroundColor: C.primary }]} onPress={() => setModalVisible(true)}>
                        <Text style={styles.newPostBtnText}>+ Post</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Stories */}
            <StoriesBar themeColors={C} />

            {/* Feed */}
            {loading && posts.length === 0 ? (
                <View style={styles.emptyState}>
                    <ActivityIndicator color={C.primary} size="large" />
                    <Text style={[styles.emptyText, { color: C.textSecondary }]}>Loading posts...</Text>
                </View>
            ) : posts.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="images-outline" size={48} color={C.textMuted} />
                    <Text style={[styles.emptyText, { color: C.text }]}>No posts yet</Text>
                    <Text style={[styles.emptySubtext, { color: C.textSecondary }]}>Pull down to refresh or create a post</Text>
                    <TouchableOpacity style={[styles.newPostBtn, { backgroundColor: C.primary, marginTop: 16 }]} onPress={() => setModalVisible(true)}>
                        <Text style={styles.newPostBtnText}>Create First Post</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlashList
                    data={posts}
                    renderItem={renderPost}
                    estimatedItemSize={220}
                    keyExtractor={(item) => item.id.toString()}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* ── New Post Modal ── */}
            <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => { setModalVisible(false); setPostContent(''); setPostImage(null); }}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => { setModalVisible(false); setPostContent(''); setPostImage(null); }}>
                                <Text style={[styles.modalCancel, { color: C.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={[styles.modalTitle, { color: C.text }]}>New Post</Text>
                            <TouchableOpacity style={[styles.postBtn, { backgroundColor: C.primary }, posting && { opacity: 0.6 }]} onPress={createPost} disabled={posting}>
                                <Text style={styles.postBtnText}>{posting ? '...' : 'Post'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalUser}>
                            <View style={[styles.avatarSmall, { backgroundColor: C.card }]}>
                                {profile?.avatar_url
                                    ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
                                    : <Text style={[styles.avatarInitial, { color: C.primaryLight }]}>{profile?.username?.[0]?.toUpperCase() || '?'}</Text>
                                }
                            </View>
                            <Text style={[styles.modalUsername, { color: C.text }]}>@{profile?.username}</Text>
                        </View>

                        <TextInput
                            ref={inputRef}
                            style={[styles.postInput, { color: C.text }]}
                            placeholder="What's on your mind? Use @username to mention"
                            placeholderTextColor={C.textMuted}
                            value={postContent}
                            onChangeText={handlePostInput}
                            multiline maxLength={500} autoFocus
                        />

                        {/* Mention suggestions */}
                        {showMentions && mentionSuggestions.length > 0 && (
                            <View style={[styles.mentionBox, { backgroundColor: C.card, borderColor: C.border }]}>
                                {mentionSuggestions.map(u => (
                                    <TouchableOpacity key={u.id} style={styles.mentionItem} onPress={() => insertMention(u.username)}>
                                        <View style={[styles.avatarSmall, { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface }]}>
                                            {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                                                : <Text style={{ color: C.primaryLight, fontSize: 11, fontWeight: '700' }}>{u.username[0].toUpperCase()}</Text>}
                                        </View>
                                        <Text style={[styles.mentionUsername, { color: C.text }]}>@{u.username}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {postImage && (
                            <View style={styles.imagePreviewContainer}>
                                <Image source={{ uri: postImage }} style={styles.imagePreview} />
                                <TouchableOpacity style={styles.removeImage} onPress={() => setPostImage(null)}>
                                    <Ionicons name="close-circle" size={22} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Image source row */}
                        <View style={[styles.mediaRow, { borderTopColor: C.border }]}>
                            <TouchableOpacity style={styles.mediaBtn} onPress={() => pickImage('camera')}>
                                <Ionicons name="camera-outline" size={22} color={C.textSecondary} />
                                <Text style={[styles.mediaBtnText, { color: C.textSecondary }]}>Camera</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.mediaBtn} onPress={() => pickImage('library')}>
                                <Ionicons name="image-outline" size={22} color={C.textSecondary} />
                                <Text style={[styles.mediaBtnText, { color: C.textSecondary }]}>Photos</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.mediaBtn} onPress={() => {
                                setPostContent(prev => prev + (prev.endsWith(' ') || prev === '' ? '#' : ' #'));
                                inputRef.current?.focus();
                            }}>
                                <Ionicons name="pricetag-outline" size={22} color={C.textSecondary} />
                                <Text style={[styles.mediaBtnText, { color: C.textSecondary }]}>Hashtag</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.mediaBtn} onPress={() => {
                                setPostContent(prev => prev + (prev.endsWith(' ') || prev === '' ? '@' : ' @'));
                                inputRef.current?.focus();
                            }}>
                                <Ionicons name="at-outline" size={22} color={C.textSecondary} />
                                <Text style={[styles.mediaBtnText, { color: C.textSecondary }]}>Mention</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Comments Modal ── */}
            <Modal visible={commentsPostId !== null} animationType="slide" transparent onRequestClose={() => { setCommentsPostId(null); setComments([]); }}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={[styles.modalBox, { backgroundColor: C.surface, maxHeight: '75%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: C.text }]}>Comments</Text>
                            <TouchableOpacity onPress={() => { setCommentsPostId(null); setComments([]); }}>
                                <Ionicons name="close" size={22} color={C.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        {loadingComments ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} /> : (
                            <FlatList
                                data={comments}
                                keyExtractor={item => item.id.toString()}
                                contentContainerStyle={{ paddingBottom: 8 }}
                                ListEmptyComponent={<Text style={[styles.emptySubtext, { color: C.textMuted, textAlign: 'center', marginTop: 20 }]}>No comments yet. Be first! 💬</Text>}
                                renderItem={({ item }) => (
                                    <View style={styles.commentRow}>
                                        <View style={[styles.avatarSmall, { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card }]}>
                                            {item.profiles?.avatar_url
                                                ? <Image source={{ uri: item.profiles.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                                                : <Text style={[styles.avatarInitial, { fontSize: 12, color: C.primaryLight }]}>{item.profiles?.username?.[0]?.toUpperCase() || '?'}</Text>
                                            }
                                        </View>
                                        <View style={[styles.commentBubble, { backgroundColor: C.card }]}>
                                            <Text style={[styles.commentUsername, { color: C.primaryLight }]}>@{item.profiles?.username}</Text>
                                            <Text style={[styles.commentText, { color: C.text }]}>{item.content}</Text>
                                        </View>
                                    </View>
                                )}
                            />
                        )}
                        <View style={[styles.commentInput, { borderTopColor: C.border }]}>
                            <TextInput
                                style={[styles.commentTextInput, { backgroundColor: C.card, color: C.text, borderColor: C.border }]}
                                placeholder="Add a comment..."
                                placeholderTextColor={C.textMuted}
                                value={newComment}
                                onChangeText={setNewComment}
                                onSubmitEditing={sendComment}
                            />
                            <TouchableOpacity onPress={sendComment} disabled={sendingComment || !newComment.trim()}
                                style={[styles.sendCommentBtn, { backgroundColor: C.primary }]}>
                                {sendingComment ? <ActivityIndicator color="#fff" size="small" />
                                    : <Ionicons name="send" size={16} color="#fff" />}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Likes Modal ── */}
            <Modal visible={likesModalPost !== null} animationType="slide" transparent onRequestClose={() => { setLikesModalPost(null); setPostLikes([]); }}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => { setLikesModalPost(null); setPostLikes([]); }} />
                    <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: C.text }]}>Liked by</Text>
                            <TouchableOpacity onPress={() => { setLikesModalPost(null); setPostLikes([]); }}>
                                <Ionicons name="close" size={22} color={C.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={postLikes}
                            keyExtractor={item => item.id}
                            ListEmptyComponent={<Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 20 }}>No likes yet</Text>}
                            renderItem={({ item }) => (
                                <View style={[styles.likeItem, { borderBottomColor: C.border }]}>
                                    <View style={[styles.avatarSmall, { backgroundColor: C.card }]}>
                                        {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                                            : <Text style={[styles.avatarInitial, { color: C.primaryLight }]}>{item.username?.[0]?.toUpperCase()}</Text>}
                                    </View>
                                    <View>
                                        <Text style={[styles.postUsername, { color: C.text }]}>{item.full_name}</Text>
                                        <Text style={[styles.postTime, { color: C.textSecondary }]}>@{item.username}</Text>
                                    </View>
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* Drafts */}
            <Modal visible={draftsVisible} animationType="slide" onRequestClose={() => setDraftsVisible(false)}>
                <DraftsScreen onClose={() => setDraftsVisible(false)} onDraftPublished={() => { setDraftsVisible(false); fetchPosts(); }} />
            </Modal>

            {/* Report */}
            <ReportModal visible={reportPostId !== null} onClose={() => setReportPostId(null)} postId={reportPostId} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
    headerTitle: { fontSize: 20, letterSpacing: 6, fontWeight: '800' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    iconBtn: { padding: 6 },
    offlineBadge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    newPostBtn: { borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7 },
    newPostBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    postCard: { borderRadius: RADIUS.lg, marginHorizontal: 12, marginTop: 12, padding: 14, borderWidth: 1 },
    postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    avatarSmall: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
    avatarImg: { width: 38, height: 38, borderRadius: 19 },
    avatarInitial: { fontWeight: '700', fontSize: 15 },
    postMeta: { flex: 1, marginLeft: 10 },
    postUsername: { fontWeight: '700', fontSize: 14 },
    postTime: { fontSize: 11, marginTop: 1 },
    moreBtn: { padding: 4 },
    postContent: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
    postImage: { width: '100%', height: 220, borderRadius: RADIUS.md, marginBottom: 10 },
    countsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
    countBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    countText: { fontSize: 13 },
    countDot: { fontSize: 13 },
    postActions: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 10, borderTopWidth: 1 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionCount: { fontSize: 13 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 40 },
    emptyText: { fontSize: 18, fontWeight: '700' },
    emptySubtext: { fontSize: 14 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, minHeight: '50%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalCancel: { fontSize: 15 },
    modalTitle: { fontWeight: '700', fontSize: 16 },
    postBtn: { borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 8 },
    postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalUser: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    modalUsername: { fontWeight: '600', fontSize: 14 },
    postInput: { fontSize: 16, lineHeight: 24, minHeight: 80, textAlignVertical: 'top' },
    mentionBox: { borderRadius: RADIUS.md, borderWidth: 1, marginTop: 4, marginBottom: 4 },
    mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
    mentionUsername: { fontSize: 14, fontWeight: '600' },
    imagePreviewContainer: { position: 'relative', marginTop: 10 },
    imagePreview: { width: '100%', height: 160, borderRadius: RADIUS.md },
    removeImage: { position: 'absolute', top: 8, right: 8 },
    mediaRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, marginTop: 12, borderTopWidth: 1 },
    mediaBtn: { alignItems: 'center', gap: 4, padding: 8 },
    mediaBtnText: { fontSize: 11 },
    commentRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
    commentBubble: { flex: 1, borderRadius: RADIUS.md, padding: 10 },
    commentUsername: { fontWeight: '700', fontSize: 12, marginBottom: 3 },
    commentText: { fontSize: 14, lineHeight: 20 },
    commentInput: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, alignItems: 'center' },
    commentTextInput: { flex: 1, height: 40, borderRadius: RADIUS.full, paddingHorizontal: 14, fontSize: 14, borderWidth: 1 },
    sendCommentBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    likeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
});