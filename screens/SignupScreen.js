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

export default function SignupScreen({ onGoLogin }) {
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const { setSession, fetchProfile } = useAuthStore();

    const [fontsLoaded] = useFonts({
        Cinzel_700Bold,



    });

    const handleSignup = async () => {
        if (!fullName.trim() || !username.trim() || !email.trim() || !password.trim() || !confirm.trim()) {
            Alert.alert('Missing fields', 'Please fill in all fields.');
            return;
        }
        if (password !== confirm) {
            Alert.alert('Password mismatch', 'Passwords do not match.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Weak password', 'Password must be at least 6 characters.');
            return;
        }
        if (username.includes(' ')) {
            Alert.alert('Invalid username', 'Username cannot contain spaces.');
            return;
        }

        setLoading(true);

        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username.trim().toLowerCase())
            .single();

        if (existing) {
            Alert.alert('Username taken', 'Please choose a different username.');
            setLoading(false);
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: password.trim(),
        });

        if (error) {
            Alert.alert('Signup Failed', error.message);
            setLoading(false);
            return;
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: data.user.id,
                full_name: fullName.trim(),
                username: username.trim().toLowerCase(),
            }]);

        if (profileError) Alert.alert('Profile Error', profileError.message);
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

                <View style={styles.header}>
                    <GlanceLogo size={70} />
                    <Text style={styles.appName}>GLANCE</Text>
                    <Text style={styles.subtitle}>Create your account</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Your full name"
                        placeholderTextColor={COLORS.textMuted}
                        value={fullName}
                        onChangeText={setFullName}
                    />

                    <Text style={styles.label}>Username</Text>
                    <View style={styles.usernameRow}>
                        <Text style={styles.atSign}>@</Text>
                        <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder="yourhandle"
                            placeholderTextColor={COLORS.textMuted}
                            value={username}
                            onChangeText={(t) => setUsername(t.toLowerCase().replace(' ', ''))}
                            autoCapitalize="none"
                        />
                    </View>

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

                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor={COLORS.textMuted}
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry
                    />

                    <TouchableOpacity style={styles.primaryBtn} onPress={handleSignup} disabled={loading}>
                        {loading
                            ? <ActivityIndicator color={COLORS.text} />
                            : <Text style={styles.primaryBtnText}>Create Account</Text>
                        }
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.switchBtn} onPress={onGoLogin}>
                        <Text style={styles.switchText}>
                            Already have an account?{' '}
                            <Text style={styles.switchTextBold}>Sign In</Text>
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
        paddingTop: 60,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    appName: {
        fontFamily: 'Cinzel_700Bold',
        fontSize: 26,
        color: COLORS.text,
        letterSpacing: 8,
        marginTop: 14,
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
    usernameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    atSign: {

        color: COLORS.primaryLight,
        fontSize: 20,
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