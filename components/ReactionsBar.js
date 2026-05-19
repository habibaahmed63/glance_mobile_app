import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, Pressable
} from 'react-native';
import { mediumFeedback } from '../utils/haptics';
import { sendLocalNotification } from '../utils/notifications';
import { supabase as supabaseClient } from '../supabaseClient';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

const EMOJIS = ["❤", "😂", "😮", "😢", "😡", "🔥"];
export default function ReactionsBar({ postId, initialLikes = 0 }) {
    const { user } = useAuthStore();
    const [reactions, setReactions] = useState({});
    const [userReaction, setUserReaction] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [totalCount, setTotalCount] = useState(initialLikes);

    useEffect(() => {
        fetchReactions();
    }, [postId]);

    //Fetch reactions for post//
    const fetchReactions = async () => {
        const { data } = await supabase
            .from('reactions')
            .select('emoji, user_id')
            .eq('post_id', postId);

        if (data) {
            const counts = {};
            data.forEach(r => {
                counts[r.emoji] = (counts[r.emoji] || 0) + 1;
                if (r.user_id === user.id) setUserReaction(r.emoji);
            });
            setReactions(counts);
            setTotalCount(data.length);
        }
    };

    //Handle reaction tap//
    const handleReaction = async (emoji) => {
        setShowPicker(false);
        await mediumFeedback();

        if (userReaction === emoji) {
            await supabase.from('reactions')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', user.id);
            setReactions(prev => ({
                ...prev,
                [emoji]: Math.max(0, (prev[emoji] || 1) - 1),
            }));
            setUserReaction(null);
            setTotalCount(prev => Math.max(0, prev - 1));
        } else {
            await supabase.from('reactions').upsert([{
                post_id: postId,
                user_id: user.id,
                emoji,
            }], { onConflict: 'user_id,post_id' });

            setReactions(prev => {
                const updated = { ...prev };
                if (userReaction) updated[userReaction] = Math.max(0, (updated[userReaction] || 1) - 1);
                updated[emoji] = (updated[emoji] || 0) + 1;
                return updated;
            });

            if (!userReaction) setTotalCount(prev => prev + 1);
            setUserReaction(emoji);
            try {
                await sendLocalNotification('New Reaction ❤️', `Someone reacted ${emoji} to your post!`);
            } catch (e) { }
        }
    };

    const topReactions = Object.entries(reactions)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    return (
        <View style={styles.container}>
            {/* Reaction button */}
            <TouchableOpacity
                style={[styles.likeBtn, userReaction && styles.likeBtnActive]}
                onPress={() => {
                    if (userReaction) {
                        handleReaction(userReaction);
                    } else {
                        setShowPicker(true);
                    }
                }}
                onLongPress={() => setShowPicker(true)}
            >
                <Text style={styles.likeBtnEmoji}>{userReaction || "♡"}</Text>
                {totalCount > 0 && (
                    <Text style={[styles.likeCount, userReaction && styles.likeCountActive]}>
                        {totalCount}
                    </Text>
                )}
            </TouchableOpacity>

            {/* Top reaction bubbles */}
            {topReactions.length > 0 && (
                <View style={styles.reactionBubbles}>
                    {topReactions.map(([emoji, count]) => (
                        <TouchableOpacity
                            key={emoji}
                            style={[styles.reactionBubble, userReaction === emoji && styles.reactionBubbleActive]}
                            onPress={() => handleReaction(emoji)}
                        >
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                            {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Emoji picker */}
            <Modal
                visible={showPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowPicker(false)}
            >
                <Pressable style={styles.pickerOverlay} onPress={() => setShowPicker(false)}>
                    <View style={styles.pickerContainer}>
                        {EMOJIS.map(emoji => (
                            <TouchableOpacity
                                key={emoji}
                                style={[styles.emojiBtn, userReaction === emoji && styles.emojiBtnActive]}
                                onPress={() => handleReaction(emoji)}
                            >
                                <Text style={styles.emojiText}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    likeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
    },
    likeBtnActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}22`,
    },
    likeBtnEmoji: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    likeCount: {
        fontSize: 13,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    likeCountActive: {
        color: COLORS.primaryLight,
    },

    reactionBubbles: {
        flexDirection: 'row',
        gap: 4,
    },
    reactionBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: RADIUS.full,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    reactionBubbleActive: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}22`,
    },
    reactionEmoji: { fontSize: 14 },
    reactionCount: {
        fontSize: 11,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },

    pickerOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    pickerContainer: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    emojiBtn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.card,
    },
    emojiBtnActive: {
        backgroundColor: `${COLORS.primary}33`,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    emojiText: { fontSize: 24 },
});