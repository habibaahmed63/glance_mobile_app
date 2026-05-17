import useAccessibilityStore from '../store/accessibilityStore';
import { useColorScheme } from 'react-native';

export const darkColors = {
    background: '#0a0a0f',
    surface: '#13131a',
    card: '#1a1a24',
    border: '#2a2a3a',
    primary: '#7c5cbf',
    primaryLight: '#9b7fd4',
    accent: '#e8a0ff',
    text: '#ffffff',
    textSecondary: '#8a8a9a',
    textMuted: '#4a4a5a',
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
};

export const lightColors = {
    background: '#f8f7ff',
    surface: '#ffffff',
    card: '#f0eeff',
    border: '#e0d9f7',
    primary: '#7c5cbf',
    primaryLight: '#6344a8',
    accent: '#9333ea',
    text: '#1a1a2e',
    textSecondary: '#4a4a6a',
    textMuted: '#9a9ab0',
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
};

export const highContrastColors = {
    background: '#000000',
    surface: '#111111',
    card: '#1a1a1a',
    border: '#ffffff',
    primary: '#a78bfa',
    primaryLight: '#c4b5fd',
    accent: '#f0abfc',
    text: '#ffffff',
    textSecondary: '#dddddd',
    textMuted: '#aaaaaa',
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
};

export const COLORS = darkColors;

export const FONTS = {
    regular: 14, medium: 15, large: 18, xlarge: 24, xxlarge: 32,
};

export const RADIUS = {
    sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};