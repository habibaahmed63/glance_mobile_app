import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Switch, Alert, ActivityIndicator
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

export const BIOMETRIC_KEY = 'glance_biometric_enabled';

// ─── Lock Screen ──────────────────────────────────────────────────────────────
export function BiometricLockScreen({ onUnlock, onMount }) {
    const [status, setStatus] = useState('idle'); // idle | authenticating | failed | success
    const [biometricLabel, setBiometricLabel] = useState('Biometric');
    const [biometricIcon, setBiometricIcon] = useState('finger-print-outline');
    const hasTriggered = useRef(false);

    useEffect(() => {
        onMount?.(); // tell App.js that biometric prompt is active
        init();
    }, []);

    const init = async () => {
        // Detect type
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricLabel('Face ID');
            setBiometricIcon('scan-outline');
        } else {
            setBiometricLabel('Fingerprint');
            setBiometricIcon('finger-print-outline');
        }
        // Auto-trigger once
        if (!hasTriggered.current) {
            hasTriggered.current = true;
            setTimeout(authenticate, 500);
        }
    };

    const authenticate = async () => {
        setStatus('authenticating');
        try {
            // Try biometric-only first (Face ID / Fingerprint)
            let result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Use Face ID or Fingerprint to unlock Glance',
                cancelLabel: 'Cancel',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
            });
            if (result.success) {
                setStatus('success');
                setTimeout(() => onUnlock(), 200);
            } else if (result.error === 'user_cancel') {
                setStatus('failed');
            } else {
                setStatus('failed');
            }
        } catch (e) {
            setStatus('failed');
        }
    };

    const disableAndEnter = async () => {
        await AsyncStorage.setItem(BIOMETRIC_KEY, 'false');
        onUnlock();
    };

    return (
        <View style={styles.lockScreen}>
            <StatusBar style="light" />

            <View style={styles.logoWrap}>
               
                <Text style={styles.logoText}>GLANCE</Text>
            </View>

            <View style={[
                styles.iconWrap,
                status === 'failed' && styles.iconWrapFailed,
                status === 'success' && styles.iconWrapSuccess,
            ]}>
                {status === 'authenticating' ? (
                    <ActivityIndicator color={COLORS.primary} size="large" />
                ) : status === 'success' ? (
                    <Ionicons name="checkmark-circle" size={52} color={COLORS.success} />
                ) : (
                    <Ionicons
                        name={status === 'failed' ? 'lock-closed' : biometricIcon}
                        size={52}
                        color={status === 'failed' ? COLORS.error : COLORS.primary}
                    />
                )}
            </View>

            <Text style={styles.lockTitle}>
                {status === 'authenticating' ? 'Verifying...'
                    : status === 'success' ? 'Unlocked!'
                        : status === 'failed' ? 'Authentication Failed'
                            : `Unlock with ${biometricLabel}`}
            </Text>
            <Text style={styles.lockSub}>
                {status === 'failed'
                    ? 'Your identity could not be verified'
                    : `Use ${biometricLabel} to access Glance`}
            </Text>

            {(status === 'idle' || status === 'failed') && (
                <TouchableOpacity style={styles.authBtn} onPress={authenticate}>
                    <Ionicons name={biometricIcon} size={20} color="#fff" />
                    <Text style={styles.authBtnText}>
                        {status === 'failed' ? 'Try Again' : `Use ${biometricLabel}`}
                    </Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.disableBtn} onPress={disableAndEnter}>
                <Text style={styles.disableBtnText}>Disable lock & enter app</Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Settings Screen ──────────────────────────────────────────────────────────
export function BiometricSettingsScreen({ onClose }) {
    const C = useTheme();
    const [supported, setSupported] = useState(false);
    const [enrolled, setEnrolled] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [biometricLabel, setBiometricLabel] = useState('Biometric');
    const [biometricIcon, setBiometricIcon] = useState('finger-print-outline');
    const [loading, setLoading] = useState(true);

    useEffect(() => { checkStatus(); }, []);

    const checkStatus = async () => {
        const hasHW = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const saved = await AsyncStorage.getItem(BIOMETRIC_KEY);

        setSupported(hasHW);
        setEnrolled(isEnrolled);
        setEnabled(saved === 'true');

        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricLabel('Face ID');
            setBiometricIcon('scan-outline');
        } else {
            setBiometricLabel('Fingerprint');
            setBiometricIcon('finger-print-outline');
        }
        setLoading(false);
    };

    const toggle = async (value) => {
        if (value) {
            if (!supported || !enrolled) {
                Alert.alert('Not Available', `Please set up ${biometricLabel} in your device Settings first.`);
                return;
            }
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: `Enable ${biometricLabel} Lock`,
                cancelLabel: 'Cancel',
            });
            if (result.success) {
                await AsyncStorage.setItem(BIOMETRIC_KEY, 'true');
                setEnabled(true);
                Alert.alert(`${biometricLabel} Lock Enabled ✅`,
                    `Glance will require ${biometricLabel} when you return from background.`);
            }
        } else {
            Alert.alert(`Disable ${biometricLabel} Lock?`, '', [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disable', style: 'destructive', onPress: async () => {
                        await AsyncStorage.setItem(BIOMETRIC_KEY, 'false');
                        setEnabled(false);
                    }
                },
            ]);
        }
    };

    if (loading) {
        return (
            <View style={[styles.settingsScreen, { backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
        );
    }

    return (
        <View style={[styles.settingsScreen, { backgroundColor: C.background }]}>
            <StatusBar style="light" />
            <View style={[styles.settingsHeader, { borderBottomColor: C.border }]}>
                {onClose && (
                    <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
                        <Ionicons name="arrow-back" size={22} color={C.text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.settingsTitle, { color: C.text }]}>App Lock</Text>
                <View style={{ width: 34 }} />
            </View>

            <View style={styles.settingsContent}>
                <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <View style={[styles.cardIcon, { backgroundColor: supported && enrolled ? `${COLORS.primary}22` : `${COLORS.textMuted}22` }]}>
                        <Ionicons name={biometricIcon} size={28} color={supported && enrolled ? COLORS.primary : COLORS.textMuted} />
                    </View>
                    <View style={styles.cardText}>
                        <Text style={[styles.cardTitle, { color: C.text }]}>{biometricLabel} Lock</Text>
                        <Text style={[styles.cardSub, { color: C.textSecondary }]}>
                            {!supported ? 'Not supported on this device'
                                : !enrolled ? `Set up ${biometricLabel} in device Settings first`
                                    : enabled ? 'Active — locks when app is backgrounded'
                                        : `Tap to enable ${biometricLabel} protection`}
                        </Text>
                    </View>
                    <Switch
                        value={enabled}
                        onValueChange={toggle}
                        trackColor={{ false: C.border, true: COLORS.primary }}
                        thumbColor={enabled ? '#fff' : C.textMuted}
                        disabled={!supported || !enrolled}
                    />
                </View>

                <View style={[styles.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.infoTitle, { color: C.text }]}>How it works</Text>
                        <Text style={[styles.infoText, { color: C.textSecondary }]}>
                            When enabled, Glance requires {biometricLabel} every time you open the app after it has been in the background.
                        </Text>
                    </View>
                </View>

                <View style={[styles.statusPill, { backgroundColor: enabled ? '#4ade8022' : `${COLORS.textMuted}22` }]}>
                    <View style={[styles.statusDot, { backgroundColor: enabled ? '#4ade80' : COLORS.textMuted }]} />
                    <Text style={[styles.statusText, { color: enabled ? '#4ade80' : C.textMuted }]}>
                        {enabled ? 'Biometric lock is ACTIVE' : 'Biometric lock is disabled'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

export default BiometricSettingsScreen;

const styles = StyleSheet.create({
    lockScreen: {
        flex: 1, backgroundColor: COLORS.background,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
    },
    logoWrap: { alignItems: 'center', marginBottom: 56 },
    logoCircle: {
        width: 76, height: 76, borderRadius: 38,
        backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.primary,
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    logoEmoji: { fontSize: 34 },
    logoText: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: 7 },
    iconWrap: {
        width: 110, height: 110, borderRadius: 55,
        backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    iconWrapFailed: { borderColor: COLORS.error, backgroundColor: `${COLORS.error}11` },
    iconWrapSuccess: { borderColor: COLORS.success, backgroundColor: `${COLORS.success}11` },
    lockTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
    lockSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 40 },
    authBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingVertical: 16, paddingHorizontal: 32, width: '100%', gap: 10, marginBottom: 16,
    },
    authBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    disableBtn: { paddingVertical: 10 },
    disableBtnText: { color: COLORS.textMuted, fontSize: 13 },
    settingsScreen: { flex: 1 },
    settingsHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1,
    },
    settingsTitle: { fontSize: 18, fontWeight: '700' },
    settingsContent: { padding: 16, gap: 14 },
    card: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, gap: 14,
    },
    cardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    cardSub: { fontSize: 13, lineHeight: 18 },
    infoCard: {
        flexDirection: 'row', gap: 12, padding: 14,
        borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'flex-start',
    },
    infoTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    infoText: { fontSize: 13, lineHeight: 18 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, fontWeight: '600' },
});