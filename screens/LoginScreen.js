import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
    Platform, Alert, ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Cinzel_700Bold } from '@expo-google-fonts/cinzel';

import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';
import GlanceLogo from '../components/GlanceLogo';

export default function LoginScreen({ onGoSignup }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { setSession, fetchProfile } = useAuthStore();

    const [fontsLoaded] = useFonts({
        Cinzel_700Bold,



    });

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing fields', 'Please enter your email and password.');
            return;
        }
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim(),
        });
        if (error) Alert.alert('Login Failed', error.message);
        else {
            setSession(data.session);
            await fetchProfile(data.user.id);
        }
        setLoading(false);
    };

    if (!fontsLoaded) return <View style={styles.container} />;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.header}>
                    <GlanceLogo size={80} />
                    <Text style={styles.appName}>GLANCE</Text>
                    <Text style={styles.subtitle}>Welcome back</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={COLORS.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor={COLORS.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
                        {loading
                            ? <ActivityIndicator color={COLORS.text} />
                            : <Text style={styles.primaryBtnText}>Sign In</Text>
                        }
                    </TouchableOpacity>


                    <TouchableOpacity style={styles.switchBtn} onPress={onGoSignup}>
                        <Text style={styles.switchText}>
                            Don't have an account?{' '}
                            <Text style={styles.switchTextBold}>Sign Up</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scroll: {
        paddingHorizontal: 24,
        paddingTop: 80,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    appName: {
        fontFamily: 'Cinzel_700Bold',
        fontSize: 28,
        color: COLORS.text,
        letterSpacing: 8,
        marginTop: 16,
    },
    subtitle: {

        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 8,
    },
    form: { width: '100%' },
    label: {

        fontSize: 13,
        color: COLORS.textSecondary,
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        height: 50,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 16,
        color: COLORS.text,

        fontSize: 15,
    },
    primaryBtn: {
        height: 52,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 28,
    },
    primaryBtnText: {

        color: COLORS.text,
        fontSize: 16,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: COLORS.border,
    },
    dividerText: {

        color: COLORS.textMuted,
        fontSize: 13,
        marginHorizontal: 12,
    },
    magicBtn: {
        height: 52,
        borderWidth: 1.5,
        borderColor: COLORS.accent,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    magicBtnText: {

        color: COLORS.accent,
        fontSize: 15,
    },
    switchBtn: {
        alignItems: 'center',
        marginTop: 24,
    },
    switchText: {

        color: COLORS.textSecondary,
        fontSize: 14,
    },
    switchTextBold: {

        color: COLORS.primaryLight,
    },
});