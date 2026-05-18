import { useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Switch, ScrollView, AccessibilityInfo
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import useAccessibilityStore from '../store/accessibilityStore';
import { useTheme } from '../utils/useTheme';
import { COLORS, RADIUS } from '../constants/theme';

export default function AccessibilityScreen({ onClose }) {
    const C = useTheme();
    const {
        largeFonts, highContrast, reduceMotion, themeOverride,
        toggleLargeFonts, toggleHighContrast, toggleReduceMotion,
        setThemeOverride, loadPreferences,
    } = useAccessibilityStore();

    useEffect(() => {
        loadPreferences();
        AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
            if (enabled && !reduceMotion) toggleReduceMotion();
        });
    }, []);

    const settings = [
        { id: 'largeFonts', icon: 'text-outline', title: 'Large Text', subtitle: 'Increase font size throughout the app', value: largeFonts, onToggle: toggleLargeFonts },
        { id: 'highContrast', icon: 'contrast-outline', title: 'High Contrast', subtitle: 'Increase contrast for better visibility', value: highContrast, onToggle: toggleHighContrast },
        { id: 'reduceMotion', icon: 'speedometer-outline', title: 'Reduce Motion', subtitle: 'Minimize animations and transitions', value: reduceMotion, onToggle: toggleReduceMotion },
    ];

    const themeOptions = [
        { value: null, label: 'System', icon: 'phone-portrait-outline' },
        { value: 'dark', label: 'Dark', icon: 'moon-outline' },
        { value: 'light', label: 'Light', icon: 'sunny-outline' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style={C === COLORS || themeOverride === 'dark' || (!themeOverride && C.background === COLORS.background) ? 'light' : 'dark'} />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: C.border, backgroundColor: C.background }]}>
                {onClose && (
                    <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color={C.text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.title, { color: C.text, fontSize: largeFonts ? 22 : 18 }]}>
                    Accessibility
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Preview */}
                <View style={[styles.preview, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <Text style={[styles.previewLabel, { color: C.primary, fontSize: largeFonts ? 11 : 10 }]}>PREVIEW</Text>
                    <Text style={[styles.previewTitle, { color: C.text, fontSize: largeFonts ? 20 : 16 }]}>This is how text looks</Text>
                    <Text style={[styles.previewBody, { color: C.textSecondary, fontSize: largeFonts ? 15 : 13 }]}>
                        Adjust settings below to customize your Glance experience.
                    </Text>
                </View>

                {/* Theme selector */}
                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: C.primary }]}>THEME</Text>
                    <View style={[styles.themeRow, { backgroundColor: C.surface, borderColor: C.border }]}>
                        {themeOptions.map(option => {
                            const active = themeOverride === option.value;
                            return (
                                <TouchableOpacity
                                    key={option.label}
                                    style={[styles.themeOption, active && { backgroundColor: C.primary + '33' }]}
                                    onPress={() => setThemeOverride(option.value)}
                                >
                                    <Ionicons name={option.icon} size={20} color={active ? C.primary : C.textMuted} />
                                    <Text style={[styles.themeLabel, { color: active ? C.primary : C.textMuted, fontWeight: active ? '700' : '400' }]}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Display settings */}
                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: C.primary }]}>DISPLAY SETTINGS</Text>
                    {settings.map((setting, index) => (
                        <View
                            key={setting.id}
                            style={[
                                styles.settingRow,
                                { backgroundColor: C.surface, borderColor: C.border },
                                index === 0 && styles.settingRowFirst,
                                index === settings.length - 1 && styles.settingRowLast,
                            ]}
                        >
                            <View style={[styles.settingIcon, { backgroundColor: C.primary + '22' }]}>
                                <Ionicons name={setting.icon} size={20} color={C.primary} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingTitle, { color: C.text, fontSize: largeFonts ? 16 : 15 }]}>
                                    {setting.title}
                                </Text>
                                <Text style={[styles.settingSubtitle, { color: C.textSecondary, fontSize: largeFonts ? 13 : 12 }]}>
                                    {setting.subtitle}
                                </Text>
                            </View>
                            <Switch
                                value={setting.value}
                                onValueChange={setting.onToggle}
                                trackColor={{ false: C.border, true: C.primary }}
                                thumbColor={setting.value ? '#fff' : C.textMuted}
                            />
                        </View>
                    ))}
                </View>

                {/* Info */}
                <View style={[styles.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <Ionicons name="information-circle-outline" size={18} color={C.primary} />
                    <Text style={[styles.infoText, { color: C.textSecondary, fontSize: largeFonts ? 13 : 12 }]}>
                        Some settings may require restarting the app to take full effect.
                    </Text>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1,
    },
    title: { fontWeight: '700' },
    backBtn: { padding: 4 },
    content: { padding: 16, gap: 16 },
    preview: { borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, gap: 6 },
    previewLabel: { fontWeight: '700', letterSpacing: 2 },
    previewTitle: { fontWeight: '700' },
    previewBody: { lineHeight: 20 },
    settingsSection: { gap: 1 },
    sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8, marginLeft: 4 },
    themeRow: { flexDirection: 'row', borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
    themeOption: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6 },
    themeLabel: { fontSize: 12 },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, gap: 12 },
    settingRowFirst: { borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg },
    settingRowLast: { borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
    settingIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    settingInfo: { flex: 1 },
    settingTitle: { fontWeight: '600', marginBottom: 2 },
    settingSubtitle: { lineHeight: 16 },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1 },
    infoText: { flex: 1, lineHeight: 18 },
});