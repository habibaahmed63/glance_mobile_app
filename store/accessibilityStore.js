import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESSIBILITY_KEY = 'glance_accessibility';

const useAccessibilityStore = create((set, get) => ({
    largeFonts: false,
    highContrast: false,
    reduceMotion: false,
    themeOverride: null, 
    loaded: false,

    // Load saved preferences//
    loadPreferences: async () => {
        try {
            const data = await AsyncStorage.getItem(ACCESSIBILITY_KEY);
            if (data) {
                const prefs = JSON.parse(data);
                set({ ...prefs, themeOverride: prefs.themeOverride || null, loaded: true });
            } else {
                set({ loaded: true });
            }
        } catch (e) {
            set({ loaded: true });
        }
    },

    // Toggle large fonts//
    toggleLargeFonts: async () => {
        const newVal = !get().largeFonts;
        set({ largeFonts: newVal });
        await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify({
            largeFonts: newVal,
            highContrast: get().highContrast,
            reduceMotion: get().reduceMotion,
        }));
    },

    // Toggle high contrast//
    toggleHighContrast: async () => {
        const newVal = !get().highContrast;
        set({ highContrast: newVal });
        await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify({
            largeFonts: get().largeFonts,
            highContrast: newVal,
            reduceMotion: get().reduceMotion,
        }));
    },

    // Set theme override//
    setThemeOverride: async (theme) => {
        set({ themeOverride: theme });
        const current = {
            largeFonts: get().largeFonts,
            highContrast: get().highContrast,
            reduceMotion: get().reduceMotion,
            themeOverride: theme,
        };
        await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(current));
    },

    // Toggle reduce motion//
    toggleReduceMotion: async () => {
        const newVal = !get().reduceMotion;
        set({ reduceMotion: newVal });
        await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify({
            largeFonts: get().largeFonts,
            highContrast: get().highContrast,
            reduceMotion: newVal,
        }));
    },
}));

export default useAccessibilityStore;