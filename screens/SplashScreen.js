import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Cinzel_700Bold } from '@expo-google-fonts/cinzel';

import { COLORS } from '../constants/theme';
import GlanceLogo from '../components/GlanceLogo';

export default function SplashScreen({ onFinish }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const taglineAnim = useRef(new Animated.Value(0)).current;

    const [fontsLoaded] = useFonts({
        Cinzel_700Bold,


    });

    useEffect(() => {
        if (!fontsLoaded) return;

        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 900,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 60,
                friction: 7,
                useNativeDriver: true,
            }),
        ]).start(() => {
            Animated.timing(taglineAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }).start();
        });

        const timer = setTimeout(() => {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start(() => onFinish());
        }, 3000);

        return () => clearTimeout(timer);
    }, [fontsLoaded]);

    if (!fontsLoaded) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <Animated.View style={[styles.content, {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
            }]}>
                <GlanceLogo size={120} />
                <Text style={styles.appName}>GLANCE</Text>
                <Animated.Text style={[styles.tagline, { opacity: taglineAnim }]}>
                    see what matters
                </Animated.Text>
            </Animated.View>

            <Animated.View style={[styles.dots, { opacity: taglineAnim }]}>
                <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
                <View style={[styles.dot, { backgroundColor: COLORS.primaryLight }]} />
                <View style={[styles.dot, { backgroundColor: COLORS.accent }]} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: { alignItems: 'center' },
    appName: {
        fontFamily: 'Cinzel_700Bold',
        fontSize: 40,
        color: COLORS.text,
        letterSpacing: 10,
        marginTop: 24,
    },
    tagline: {

        fontSize: 13,
        color: COLORS.textSecondary,
        letterSpacing: 2,
        marginTop: 10,
    },
    dots: {
        position: 'absolute',
        bottom: 60,
        flexDirection: 'row',
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
});