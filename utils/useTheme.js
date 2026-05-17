import { useColorScheme } from 'react-native';
import useAccessibilityStore from '../store/accessibilityStore';
import { darkColors, lightColors, highContrastColors } from '../constants/theme';

export function useTheme() {
    const systemScheme = useColorScheme();
    const { highContrast, themeOverride } = useAccessibilityStore();
    if (highContrast) return highContrastColors;
    const scheme = themeOverride || systemScheme || 'dark';
    return scheme === 'light' ? lightColors : darkColors;
}