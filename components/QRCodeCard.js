import { useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, Share, Alert
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { lightFeedback } from '../utils/haptics';
import { COLORS, RADIUS } from '../constants/theme';
import { useTheme } from '../utils/useTheme';

export default function QRCodeCard({ visible, onClose, profile }) {
    const C = useTheme();
    const qrRef = useRef(null);

    if (!profile) return null;

    const profileUrl = `@${profile.username} on Glance`;

    const handleShare = async () => {
        await lightFeedback();
        try {
            await Share.share({
                message: `Follow me on Glance! @${profile.username}\n${profileUrl}`,
                title: `@${profile.username} on Glance`,
            });
        } catch (e) {
            Alert.alert('Error', 'Could not share profile.');
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} />

                <View style={[styles.card, { backgroundColor: C.surface, borderTopColor: C.border }]}>
                    {/* Handle bar */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: C.text }]}>My QR Code</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Profile info */}
                    <View style={styles.profileInfo}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {profile.username?.[0]?.toUpperCase() || '?'}
                            </Text>
                        </View>
                        <Text style={[styles.displayName, { color: C.text }]}>{profile.full_name}</Text>
                        <Text style={styles.username}>{'@' + (profile.username)}</Text>
                        {profile.bio ? (
                            <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
                        ) : null}
                    </View>

                    {/* QR Code */}
                    <View style={[styles.qrContainer, { backgroundColor: C.card, borderColor: C.border }]}>
                        <QRCode
                            value={profileUrl}
                            size={200}
                            color={C.text}
                            backgroundColor="transparent"
                            logo={null}
                            getRef={qrRef}
                        />
                    </View>

                    {/* URL label */}
                    <Text style={styles.urlLabel}>{profileUrl}</Text>

                    {/* Actions */}
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                            <Ionicons name="share-outline" size={20} color="#fff" />
                            <Text style={styles.shareBtnText}>Share Profile</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.hint}>
                        Scan this code to find me on Glance
                    </Text>
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
    backdrop: {
        flex: 1,
    },
    card: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 24,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: COLORS.border,
        marginTop: 12, marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        paddingVertical: 12,
        marginBottom: 8,
    },
    title: {
        fontSize: 18, fontWeight: '700', color: COLORS.text,
    },
    closeBtn: { padding: 4 },

    // Profile info
    profileInfo: { alignItems: 'center', marginBottom: 24, gap: 4 },
    avatar: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: COLORS.card,
        borderWidth: 2, borderColor: COLORS.primary,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
    },
    avatarText: { color: COLORS.primaryLight, fontSize: 24, fontWeight: '700' },
    displayName: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
    username: { color: COLORS.textSecondary, fontSize: 14 },
    bio: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },

    // QR Code
    qrContainer: {
        padding: 20,
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 16,
    },
    urlLabel: {
        color: COLORS.textMuted, fontSize: 12,
        marginBottom: 24,
    },

    // Actions
    actions: { width: '100%', marginBottom: 16 },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        gap: 8,
    },
    shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    hint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center' },
});