import { useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Switch, ScrollView, AccessibilityInfo
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import useAccessibilityStore from '../store/accessibilityStore';
import { COLORS, RADIUS } from '../constants/theme';

export default function AccessibilityScreen({ onClose }) {
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

    const fontSize = largeFonts ? 17 : 14;
    const titleSize = largeFonts ? 22 : 18;
    const bg = highContrast ? '#000000' : COLORS.background;
    const surface = highContrast ? '#1a1a1a' : COLORS.surface;
    const text = highContrast ? '#ffffff' : COLORS.text;
    const textSecondary = highContrast ? '#cccccc' : COLORS.textSecondary;
    const border = highContrast ? '#ffffff' : COLORS.border;

    const settings = [
        {
            id: 'largeFonts',
            icon: 'text-outline',
            title: 'Large Text',
            subtitle: 'Increase font size throughout the app',
            value: largeFonts,
            onToggle: toggleLargeFonts,
        },
        {
            id: 'highContrast',
            icon: 'contrast-outline',
            title: 'High Contrast',
            subtitle: 'Increase contrast for better visibility',
            value: highContrast,
            onToggle: toggleHighContrast,
        },
        {
            id: 'reduceMotion',
            icon: 'speedometer-outline',
            title: 'Reduce Motion',
            subtitle: 'Minimize animations and transitions',
            value: reduceMotion,
            onToggle: toggleReduceMotion,
        },
    ];

    const themeOptions = [
        { value: null, label: 'System', icon: 'phone-portrait-outline' },
        { value: 'dark', label: 'Dark', icon: 'moon-outline' },
        { value: 'light', label: 'Light', icon: 'sunny-outline' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: bg }]}>
            <StatusBar style="light" />

            <View style={[styles.header, { borderBottomColor: border }]}>
                {onClose && (
                    <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color={text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.title, { color: text, fontSize: titleSize }]}>
                    Accessibility
                </Text>
                <View style={{ width: 30 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                <View style={[styles.preview, { backgroundColor: surface, borderColor: border }]}>
                    <Text style={[styles.previewLabel, { color: COLORS.primary, fontSize: largeFonts ? 11 : 10 }]}>
                        PREVIEW
                    </Text>
                    <Text style={[styles.previewTitle, { color: text, fontSize: largeFonts ? 20 : 16 }]}>
                        This is how text looks
                    </Text>
                    <Text style={[styles.previewBody, { color: textSecondary, fontSize }]}>
                        Adjust settings below to customize your Glance experience for better readability.
                    </Text>
                </View>

                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: COLORS.primary }]}>THEME</Text>
                    <View style={[styles.themeRow, { backgroundColor: surface, borderColor: border }]}>
                        {themeOptions.map(option => (
                            <TouchableOpacity
                                key={option.label}
                                style={[
                                    styles.themeOption,
                                    themeOverride === option.value && styles.themeOptionActive,
                                ]}
                                onPress={() => setThemeOverride(option.value)}
                            >
                                <Ionicons
                                    name={option.icon}
                                    size={20}
                                    color={themeOverride === option.value ? COLORS.primaryLight : COLORS.textMuted}
                                />
                                <Text style={[
                                    styles.themeLabel,
                                    { color: themeOverride === option.value ? COLORS.primaryLight : COLORS.textMuted }
                                ]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: COLORS.primary }]}>DISPLAY SETTINGS</Text>
                    {settings.map((setting, index) => (
                        <View
                            key={setting.id}
                            style={[
                                styles.settingRow,
                                { backgroundColor: surface, borderColor: border },
                                index === 0 && styles.settingRowFirst,
                                index === settings.length - 1 && styles.settingRowLast,
                            ]}
                        >
                            <View style={[styles.settingIcon, { backgroundColor: `${COLORS.primary}22` }]}>
                                <Ionicons name={setting.icon} size={20} color={COLORS.primaryLight} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingTitle, { color: text, fontSize: largeFonts ? 16 : 15 }]}>
                                    {setting.title}
                                </Text>
                                <Text style={[styles.settingSubtitle, { color: textSecondary, fontSize: largeFonts ? 13 : 12 }]}>
                                    {setting.subtitle}
                                </Text>
                            </View>
                            <Switch
                                value={setting.value}
                                onValueChange={setting.onToggle}
                                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                                thumbColor={setting.value ? '#fff' : COLORS.textMuted}
                            />
                        </View>
                    ))}
                </View>

                <View style={[styles.infoCard, { backgroundColor: surface, borderColor: border }]}>
                    <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={[styles.infoText, { color: textSecondary, fontSize: largeFonts ? 13 : 12 }]}>
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
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    title: { fontWeight: '700' },
    backBtn: { padding: 4 },
    content: { padding: 16, gap: 16 },
    preview: {
        borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, gap: 6,
    },
    previewLabel: { fontWeight: '700', letterSpacing: 2 },
    previewTitle: { fontWeight: '700' },
    previewBody: { lineHeight: 20 },
    settingsSection: { gap: 1 },
    sectionLabel: {
        fontSize: 10, fontWeight: '700',
        letterSpacing: 2, marginBottom: 8, marginLeft: 4,
    },
    themeRow: {
        flexDirection: 'row', borderRadius: RADIUS.lg,
        borderWidth: 1, overflow: 'hidden',
    },
    themeOption: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, gap: 6,
    },
    themeOptionActive: { backgroundColor: '#7c5cbf33' },
    themeLabel: { fontSize: 12, fontWeight: '600' },
    settingRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderWidth: 1, gap: 12,
    },
    settingRowFirst: { borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg },
    settingRowLast: { borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
    settingIcon: {
        width: 38, height: 38, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    settingInfo: { flex: 1 },
    settingTitle: { fontWeight: '600', marginBottom: 2 },
    settingSubtitle: { lineHeight: 16 },
    infoCard: {
        flexDirection: 'row', alignItems: 'flex-start',
        gap: 10, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1,
    },
    infoText: { flex: 1, lineHeight: 18 },
});