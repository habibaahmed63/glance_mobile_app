import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Image, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { getDrafts, deleteDraft } from '../utils/drafts';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { useNetworkStatus } from '../utils/useNetworkStatus';
import { successFeedback, warningFeedback } from '../utils/haptics';
import { COLORS, RADIUS } from '../constants/theme';
import { useTheme } from '../utils/useTheme';

export default function DraftsScreen({ onClose, onDraftPublished, themeColors }) {
    const theme = useTheme();
    const C = themeColors || theme || COLORS;
    const { user } = useAuthStore();
    const { isConnected } = useNetworkStatus();
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(null);

    useEffect(() => {
        loadDrafts();
    }, []);

    const loadDrafts = async () => {
        setLoading(true);
        const data = await getDrafts();
        setDrafts(data);
        setLoading(false);
    };

    const publishDraft = async (draft) => {
        if (!isConnected) {
            Alert.alert('No connection', 'You need internet to publish this draft.');
            return;
        }

        setPublishing(draft.id);
        try {
            let imageUrl = null;

            if (draft.imageUri) {
                const response = await fetch(draft.imageUri);
                const blob = await response.blob();
                const arrayBuffer = await new Response(blob).arrayBuffer();
                const fileName = `posts/${user.id}_${Date.now()}.jpg`;

                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

                if (!uploadError) {
                    const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
                    imageUrl = urlData.publicUrl;
                }
            }

            const { error } = await supabase.from('posts').insert([{
                user_id: user.id,
                content: draft.content,
                image_url: imageUrl,
            }]);

            if (error) throw new Error(error.message);

            await deleteDraft(draft.id);
            await successFeedback();
            await loadDrafts();
            onDraftPublished?.();
            Alert.alert('Published! ✨', 'Your draft has been posted.');
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        setPublishing(null);
    };

    const handleDelete = (draftId) => {
        Alert.alert('Delete Draft', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await warningFeedback();
                    await deleteDraft(draftId);
                    await loadDrafts();
                }
            }
        ]);
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const renderDraft = ({ item }) => (
        <View style={[styles.draftCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            =            <View style={styles.draftContent}>
                {item.imageUri && (
                    <Image source={{ uri: item.imageUri }} style={styles.draftImage} resizeMode="cover" />
                )}
                {item.content ? (
                    <Text style={[styles.draftText, { color: C.text }]} numberOfLines={3}>{item.content}</Text>
                ) : null}
                <Text style={styles.draftDate}>Saved {formatDate(item.createdAt)}</Text>
            </View>

            <View style={styles.draftActions}>
                <TouchableOpacity
                    style={[styles.publishBtn, !isConnected && styles.publishBtnDisabled]}
                    onPress={() => publishDraft(item)}
                    disabled={publishing === item.id || !isConnected}
                >
                    {publishing === item.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.publishBtnText}>
                            {isConnected ? 'Publish' : 'Offline'}
                        </Text>
                    }
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />

            =            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="arrow-back" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Drafts</Text>
                <View style={{ width: 30 }} />
            </View>

            {!isConnected && (
                <View style={styles.offlineBadge}>
                    <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
                    <Text style={styles.offlineBadgeText}>Offline — drafts will publish when connected</Text>
                </View>
            )}

            =            {loading ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : drafts.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="document-outline" size={48} color={COLORS.textMuted} />
                    <Text style={styles.emptyTitle}>No drafts</Text>
                    <Text style={styles.emptySubtext}>Posts saved while offline will appear here</Text>
                </View>
            ) : (
                <FlatList
                    data={drafts}
                    keyExtractor={item => item.id}
                    renderItem={renderDraft}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
    closeBtn: { padding: 4 },

    offlineBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 10,
    },
    offlineBadgeText: { color: '#fff', fontSize: 13, fontWeight: '500' },

    draftCard: {
        backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
        borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },
    draftContent: { padding: 14 },
    draftImage: { width: '100%', height: 140, borderRadius: RADIUS.md, marginBottom: 10 },
    draftText: { color: COLORS.text, fontSize: 14, lineHeight: 20, marginBottom: 8 },
    draftDate: { color: COLORS.textMuted, fontSize: 11 },

    draftActions: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10,
    },
    publishBtn: {
        flex: 1, backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md, paddingVertical: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    publishBtnDisabled: { backgroundColor: COLORS.textMuted },
    publishBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    deleteBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
    emptySubtext: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});