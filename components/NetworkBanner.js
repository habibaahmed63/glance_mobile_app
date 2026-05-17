import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export default function NetworkBanner({ isConnected, isCellular }) {
    const slideAnim = useRef(new Animated.Value(-60)).current;
    const prevConnected = useRef(true);

    useEffect(() => {
        if (!isConnected) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 80,
                friction: 10,
            }).start();
        } else if (prevConnected.current === false) {
            Animated.sequence([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                }),
                Animated.delay(2000),
                Animated.spring(slideAnim, {
                    toValue: -60,
                    useNativeDriver: true,
                }),
            ]).start();
        }
        prevConnected.current = isConnected;
    }, [isConnected]);

    return (
        <Animated.View
            style={[
                styles.banner,
                { transform: [{ translateY: slideAnim }] },
                isConnected ? styles.bannerOnline : styles.bannerOffline,
            ]}
        >
            <Ionicons
                name={isConnected ? 'wifi' : 'wifi-outline'}
                size={16}
                color="#fff"
            />
            <Text style={styles.bannerText}>
                {isConnected
                    ? isCellular
                        ? '📶 Using cellular data — reduced quality'
                        : '✓ Back online'
                    : '⚠ No internet connection'
                }
            </Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
        zIndex: 999,
    },
    bannerOffline: {
        backgroundColor: '#ef4444',
    },
    bannerOnline: {
        backgroundColor: '#22c55e',
    },
    bannerText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});