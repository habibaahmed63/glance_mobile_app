import { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

const REPORT_REASONS = [
    { id: 'spam', label: 'Spam', icon: 'mail-unread-outline' },
    { id: 'harassment', label: 'Harassment or bullying', icon: 'sad-outline' },
    { id: 'hate_speech', label: 'Hate speech', icon: 'warning-outline' },
    { id: 'violence', label: 'Violence or harmful content', icon: 'alert-circle-outline' },
    { id: 'misinformation', label: 'False information', icon: 'information-circle-outline' },
    { id: 'inappropriate', label: 'Inappropriate content', icon: 'eye-off-outline' },
    { id: 'other', label: 'Something else', icon: 'ellipsis-horizontal-outline' },
];

export default function ReportModal({ visible, onClose, postId }) {
    const { user } = useAuthStore();
    const [selectedReason, setSelectedReason] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!selectedReason) {
            Alert.alert('Select a reason', 'Please select a reason for reporting.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: existing } = await supabase
                .from('reports')
                .select('id')
                .eq('reporter_id', user.id)
                .eq('post_id', postId)
                .single();

            if (existing) {
                Alert.alert('Already reported', 'You have already reported this post.');
                setSubmitting(false);
                onClose();
                return;
            }

            const { error } = await supabase.from('reports').insert([{
                reporter_id: user.id,
                post_id: postId,
                reason: selectedReason,
            }]);

            if (error) throw new Error(error.message);

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSubmitted(true);
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        setSubmitting(false);
    };

    const handleClose = () => {
        setSelectedReason(null);
        setSubmitted(false);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={handleClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    {submitted ? (
                        <View style={styles.successState}>
                            <View style={styles.successIcon}>
                                <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
                            </View>
                            <Text style={styles.successTitle}>Report Submitted</Text>
                            <Text style={styles.successText}>
                                Thank you for helping keep Glance safe. We'll review this content shortly.
                            </Text>
                            <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                                <Text style={styles.doneBtnText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <View style={styles.header}>
                                <Text style={styles.title}>Report Post</Text>
                                <TouchableOpacity onPress={handleClose}>
                                    <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.subtitle}>
                                Why are you reporting this post?
                            </Text>

                            <View style={styles.reasons}>
                                {REPORT_REASONS.map(reason => (
                                    <TouchableOpacity
                                        key={reason.id}
                                        style={[
                                            styles.reasonItem,
                                            selectedReason === reason.id && styles.reasonItemSelected,
                                        ]}
                                        onPress={() => {
                                            setSelectedReason(reason.id);
                                            Haptics.selectionAsync();
                                        }}
                                    >
                                        <Ionicons
                                            name={reason.icon}
                                            size={20}
                                            color={selectedReason === reason.id ? COLORS.primaryLight : COLORS.textSecondary}
                                        />
                                        <Text style={[
                                            styles.reasonText,
                                            selectedReason === reason.id && styles.reasonTextSelected,
                                        ]}>
                                            {reason.label}
                                        </Text>
                                        {selectedReason === reason.id && (
                                            <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TouchableOpacity
                                style={[styles.submitBtn, !selectedReason && styles.submitBtnDisabled]}
                                onPress={handleSubmit}
                                disabled={submitting || !selectedReason}
                            >
                                {submitting
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={styles.submitBtnText}>Submit Report</Text>
                                }
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdrop: { flex: 1 },
    sheet: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderColor: COLORS.border,
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: 'center',
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
    subtitle: {
        color: COLORS.textSecondary,
        fontSize: 14,
        marginBottom: 16,
    },

    reasons: { gap: 4, marginBottom: 20 },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
    },
    reasonItemSelected: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}22`,
    },
    reasonText: {
        flex: 1,
        color: COLORS.textSecondary,
        fontSize: 14,
    },
    reasonTextSelected: {
        color: COLORS.text,
        fontWeight: '600',
    },

    submitBtn: {
        height: 52,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    successState: { alignItems: 'center', paddingVertical: 20, gap: 12 },
    successIcon: { marginBottom: 8 },
    successTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
    successText: {
        color: COLORS.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    doneBtn: {
        marginTop: 8,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingHorizontal: 40,
        paddingVertical: 14,
    },
    doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});