import { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, Image, ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

export default function CameraScreen({ onClose, onPostCreated }) {
    const { user } = useAuthStore();
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState('back');
    const [flash, setFlash] = useState('off');
    const [capturedPhoto, setCapturedPhoto] = useState(null);
    const [posting, setPosting] = useState(false);
    const cameraRef = useRef(null);

    useEffect(() => {
        if (!permission?.granted) requestPermission();
    }, []);

    const takePhoto = async () => {
        if (!cameraRef.current) return;
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            const manipulated = await ImageManipulator.manipulateAsync(
                photo.uri,
                [{ resize: { width: 1080 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
            );
            setCapturedPhoto(manipulated.uri);
        } catch (e) {
            Alert.alert('Error', 'Failed to take photo.');
        }
    };

    const uploadAndPost = async () => {
        if (!capturedPhoto) return;
        setPosting(true);
        try {
            const response = await fetch(capturedPhoto);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();
            const fileName = `posts/${user.id}_${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);

            const { error: postError } = await supabase.from('posts').insert([{
                user_id: user.id,
                content: '',
                image_url: urlData.publicUrl,
            }]);

            if (postError) throw new Error(postError.message);

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Posted! ✨', 'Your photo has been shared.', [
                { text: 'OK', onPress: () => { onPostCreated?.(); onClose(); } }
            ]);
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        setPosting(false);
    };

    if (!permission) return <View style={styles.container} />;

    if (!permission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <StatusBar style="light" />
                <Text style={styles.permissionIcon}>📷</Text>
                <Text style={styles.permissionTitle}>Camera Access</Text>
                <Text style={styles.permissionText}>
                    Glance needs camera access to capture and share moments.
                </Text>
                <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Grant Access</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (capturedPhoto) {
        return (
            <View style={styles.container}>
                <StatusBar style="light" />
                <Image source={{ uri: capturedPhoto }} style={styles.preview} resizeMode="cover" />
                <View style={styles.previewActions}>
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedPhoto(null)}>
                        <Text style={styles.retakeBtnText}>↩  Retake</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.postBtn, posting && { opacity: 0.6 }]}
                        onPress={uploadAndPost}
                        disabled={posting}
                    >
                        {posting
                            ? <ActivityIndicator color={COLORS.text} size="small" />
                            : <Text style={styles.postBtnText}>Share ✨</Text>
                        }
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing={facing}
                flash={flash}
            >
                <View style={styles.topControls}>
                    <TouchableOpacity style={styles.controlBtn} onPress={onClose}>
                        <Text style={styles.controlBtnText}>✕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.controlBtn} onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}>
                        <Text style={styles.controlBtnText}>{flash === 'off' ? '⚡' : '⚡️'}</Text>
                        <Text style={styles.controlBtnLabel}>{flash === 'off' ? 'Off' : 'On'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomControls}>
                    <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
                        <Text style={styles.flipBtnText}>🔄</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.shutter} onPress={takePhoto}>
                        <View style={styles.shutterInner} />
                    </TouchableOpacity>
                    <View style={{ width: 50 }} />
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1, justifyContent: 'space-between' },
    topControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
    },
    controlBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center', justifyContent: 'center',
    },
    controlBtnText: { color: '#fff', fontSize: 16 },
    controlBtnLabel: { color: '#fff', fontSize: 9, marginTop: 1 },
    bottomControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 60,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    flipBtn: {
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    flipBtnText: { fontSize: 22 },
    shutter: {
        width: 76, height: 76, borderRadius: 38,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderWidth: 4, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
    preview: { flex: 1 },
    previewActions: {
        position: 'absolute', bottom: 60,
        left: 0, right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 40,
    },
    retakeBtn: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: RADIUS.full,
        paddingHorizontal: 24, paddingVertical: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    retakeBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    postBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.full,
        paddingHorizontal: 24, paddingVertical: 14,
        minWidth: 120, alignItems: 'center',
    },
    postBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    closeBtn: {
        position: 'absolute', top: 60, right: 20,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center', justifyContent: 'center',
    },
    closeBtnText: { color: '#fff', fontSize: 16 },
    permissionContainer: {
        flex: 1, backgroundColor: COLORS.background,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 40,
    },
    permissionIcon: { fontSize: 60, marginBottom: 20 },
    permissionTitle: { color: COLORS.text, fontSize: 24, fontWeight: '700', marginBottom: 12 },
    permissionText: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    permissionBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingHorizontal: 32, paddingVertical: 14,
        width: '100%', alignItems: 'center', marginBottom: 12,
    },
    permissionBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    cancelBtn: { paddingVertical: 14, width: '100%', alignItems: 'center' },
    cancelBtnText: { color: COLORS.textSecondary, fontSize: 15 },
});