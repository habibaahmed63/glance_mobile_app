import { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, Image, ActivityIndicator, FlatList,
    Dimensions, Platform, Animated, PanResponder
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');

const FILTERS = [
    { id: 'none', label: 'None', emoji: '🚫' },
    { id: 'sunglasses', label: 'Shades', emoji: '🕶️' },
    { id: 'crown', label: 'Crown', emoji: '👑' },
    { id: 'hearts', label: 'Hearts', emoji: '❤️' },
    { id: 'fire', label: 'Fire', emoji: '🔥' },
    { id: 'stars', label: 'Stars', emoji: '⭐' },
    { id: 'rainbow', label: 'Rainbow', emoji: '🌈' },
    { id: 'sparkles', label: 'Glitter', emoji: '✨' },
];

export default function ARFiltersScreen({ onClose, onPhotoTaken }) {
    const { user } = useAuthStore();
    const [permission, requestPermission] = useCameraPermissions();
    const [selectedFilter, setSelectedFilter] = useState('none');
    const [capturedPhoto, setCapturedPhoto] = useState(null);
    const [posting, setPosting] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [faces, setFaces] = useState([]);
    const [faceDetected, setFaceDetected] = useState(false);
    const cameraRef = useRef(null);

    // Draggable filter position — starts at face center
    const filterPos = useRef(new Animated.ValueXY({
        x: SW * 0.15,
        y: SH * 0.28,
    })).current;

    // Filter size slider
    const [filterScale, setFilterScale] = useState(1.0);

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => selectedFilter !== 'none',
        onMoveShouldSetPanResponder: () => selectedFilter !== 'none',
        onPanResponderGrant: () => {
            filterPos.setOffset({
                x: filterPos.x._value,
                y: filterPos.y._value,
            });
            filterPos.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event(
            [null, { dx: filterPos.x, dy: filterPos.y }],
            { useNativeDriver: false }
        ),
        onPanResponderRelease: () => {
            filterPos.flattenOffset();
        },
    })).current;

    // Rebuild panResponder when filter changes
    useEffect(() => {
        // Reset position to face center when switching filters
        if (selectedFilter !== 'none') {
            filterPos.setValue({ x: SW * 0.15, y: SH * 0.28 });
        }
    }, [selectedFilter]);

    const onFacesDetected = useCallback(({ faces: detected }) => {
        if (!detected || detected.length === 0) {
            setFaceDetected(false);
            setFaces([]);
            return;
        }
        setFaceDetected(true);
        // Mirror x for front camera
        const adjusted = detected.map(face => {
            if (!face.bounds) return face;
            return {
                ...face,
                bounds: {
                    origin: {
                        x: SW - face.bounds.origin.x - face.bounds.size.width,
                        y: face.bounds.origin.y,
                    },
                    size: face.bounds.size,
                },
            };
        });
        setFaces(adjusted);
        // Auto-move filter to detected face
        if (adjusted[0]?.bounds) {
            const b = adjusted[0].bounds;
            filterPos.setValue({
                x: b.origin.x,
                y: b.origin.y,
            });
        }
    }, []);

    const takePhoto = async () => {
        if (!cameraRef.current || !cameraReady) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
            const flipped = await ImageManipulator.manipulateAsync(
                photo.uri,
                [{ flip: ImageManipulator.FlipType.Horizontal }],
                { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            setCapturedPhoto(flipped.uri);
        } catch (e) {
            Alert.alert('Error', 'Could not capture photo.');
        }
    };

    const postPhoto = async () => {
        if (!capturedPhoto || !user) return;
        setPosting(true);
        try {
            const res = await fetch(capturedPhoto);
            const blob = await res.blob();
            const ab = await new Response(blob).arrayBuffer();
            const fn = `posts/${user.id}_ar_${Date.now()}.jpg`;
            const { error } = await supabase.storage.from('media')
                .upload(fn, ab, { contentType: 'image/jpeg', upsert: true });
            if (error) throw error;
            const { data } = supabase.storage.from('media').getPublicUrl(fn);
            const f = FILTERS.find(f => f.id === selectedFilter);
            await supabase.from('posts').insert([{
                user_id: user.id,
                content: selectedFilter !== 'none'
                    ? `${f.emoji} AR selfie with ${f.label} filter! #glance #arfilter`
                    : '📸 Selfie via Glance! #glance',
                image_url: data.publicUrl,
            }]);
            Alert.alert('Posted! ✨', 'Your AR selfie is live!', [
                { text: 'OK', onPress: () => { onPhotoTaken?.(); onClose?.(); } }
            ]);
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        setPosting(false);
    };

    // ── Build filter overlay ──────────────────────────────────────────────────
    const buildFilterContent = () => {
        // Use face bounds if detected, else use draggable position
        const useFace = faceDetected && faces[0]?.bounds;
        const fw = useFace ? faces[0].bounds.size.width : SW * 0.7;
        const fh = useFace ? faces[0].bounds.size.height : SW * 0.75;
        const base = fw * filterScale;

        switch (selectedFilter) {
            case 'sunglasses':
                return (
                    <View style={[S.filterContent, { width: fw, height: fh }]}>
                        {/* Position at eye level ~30% down */}
                        <Text style={[S.filterText, { fontSize: base * 0.78, position: 'absolute', top: fh * 0.27, left: 0, right: 0, textAlign: 'center' }]}>
                            🕶️
                        </Text>
                    </View>
                );
            case 'crown':
                return (
                    <View style={[S.filterContent, { width: fw, height: fh }]}>
                        {/* Crown above head */}
                        <Text style={[S.filterText, { fontSize: base * 0.82, position: 'absolute', top: -fh * 0.45, left: 0, right: 0, textAlign: 'center' }]}>
                            👑
                        </Text>
                    </View>
                );
            case 'rainbow':
                return (
                    <View style={[S.filterContent, { width: fw * 1.3, height: fh }]}>
                        <Text style={[S.filterText, { fontSize: fw * filterScale, position: 'absolute', top: -fh * 0.65, left: 0, right: 0, textAlign: 'center' }]}>
                            🌈
                        </Text>
                    </View>
                );
            case 'hearts':
                return (
                    <View style={[S.filterContent, { width: fw * 1.2, height: fh * 1.5 }]}>
                        <Text style={[S.filterText, { fontSize: fw * 0.2 * filterScale, position: 'absolute', left: -fw * 0.1, top: fh * 0.1 }]}>❤️</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.17 * filterScale, position: 'absolute', right: -fw * 0.08, top: fh * 0.18 }]}>💕</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.15 * filterScale, position: 'absolute', left: fw * 0.4, top: -fh * 0.05 }]}>❤️</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.13 * filterScale, position: 'absolute', left: fw * 0.1, top: fh * 0.9 }]}>💖</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.12 * filterScale, position: 'absolute', right: fw * 0.05, top: fh * 1.05 }]}>❤️</Text>
                    </View>
                );
            case 'fire':
                return (
                    <View style={[S.filterContent, { width: fw, height: fh * 0.5 }]}>
                        <Text style={[S.filterText, { fontSize: fw * 0.26 * filterScale, position: 'absolute', left: fw * 0.05, top: -fh * 0.45 }]}>🔥</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.22 * filterScale, position: 'absolute', right: fw * 0.05, top: -fh * 0.4 }]}>🔥</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.18 * filterScale, position: 'absolute', left: fw * 0.35, top: -fh * 0.58 }]}>🔥</Text>
                    </View>
                );
            case 'stars':
                return (
                    <View style={[S.filterContent, { width: fw * 1.2, height: fh * 1.6 }]}>
                        <Text style={[S.filterText, { fontSize: fw * 0.21 * filterScale, position: 'absolute', left: -fw * 0.05, top: 0 }]}>⭐</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.17 * filterScale, position: 'absolute', right: -fw * 0.05, top: fh * 0.12 }]}>✨</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.19 * filterScale, position: 'absolute', left: fw * 0.42, top: -fh * 0.12 }]}>⭐</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.14 * filterScale, position: 'absolute', left: fw * 0.12, top: fh * 1.1 }]}>✨</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.16 * filterScale, position: 'absolute', right: fw * 0.1, top: fh * 1.2 }]}>⭐</Text>
                    </View>
                );
            case 'sparkles':
                return (
                    <View style={[S.filterContent, { width: fw * 1.2, height: fh * 1.5 }]}>
                        <Text style={[S.filterText, { fontSize: fw * 0.21 * filterScale, position: 'absolute', left: -fw * 0.05, top: fh * 0.05 }]}>✨</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.18 * filterScale, position: 'absolute', right: -fw * 0.05, top: fh * 0.15 }]}>💫</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.2 * filterScale, position: 'absolute', left: fw * 0.4, top: -fh * 0.08 }]}>✨</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.15 * filterScale, position: 'absolute', left: fw * 0.1, top: fh * 1.05 }]}>💫</Text>
                        <Text style={[S.filterText, { fontSize: fw * 0.17 * filterScale, position: 'absolute', right: fw * 0.05, top: fh * 1.15 }]}>✨</Text>
                    </View>
                );
            default:
                return null;
        }
    };

    if (!permission) return <View style={S.full} />;

    if (!permission.granted) {
        return (
            <View style={[S.full, S.center, { backgroundColor: '#0a0a0f', padding: 40 }]}>
                <StatusBar style="light" />
                <Text style={{ fontSize: 60, marginBottom: 20 }}>🎭</Text>
                <Text style={S.permTitle}>Camera Access Needed</Text>
                <Text style={S.permSub}>Glance needs camera access for AR filters.</Text>
                <TouchableOpacity style={S.permBtn} onPress={requestPermission}>
                    <Text style={S.permBtnText}>Grant Camera Access</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
                    <Text style={{ color: COLORS.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (capturedPhoto) {
        return (
            <View style={S.full}>
                <StatusBar style="light" hidden />
                <Image source={{ uri: capturedPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                {selectedFilter !== 'none' && (
                    <View style={S.filterBadge}>
                        <Text style={S.filterBadgeText}>
                            {FILTERS.find(f => f.id === selectedFilter)?.emoji} {FILTERS.find(f => f.id === selectedFilter)?.label} filter
                        </Text>
                    </View>
                )}
                <View style={S.previewActions}>
                    <TouchableOpacity style={S.retakeBtn} onPress={() => setCapturedPhoto(null)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="arrow-back" size={18} color="#fff" />
                            <Text style={S.retakeBtnText}>Retake</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.postBtn, posting && { opacity: 0.6 }]} onPress={postPhoto} disabled={posting}>
                        {posting
                            ? <ActivityIndicator color="#fff" size="small" />
                            : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="share-outline" size={18} color="#fff" />
                                    <Text style={S.postBtnText}>Post</Text>
                                </View>
                            )
                        }
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={S.closeBtn} onPress={onClose}>
                    <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={S.full}>
            <StatusBar style="light" hidden />

            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                onCameraReady={() => setCameraReady(true)}
                onFacesDetected={onFacesDetected}
                faceDetectorSettings={{
                    mode: 'fast',
                    detectLandmarks: 'none',
                    runClassifications: 'none',
                    minDetectionInterval: 100,
                    tracking: true,
                }}
            />

            {/* Draggable filter overlay */}
            {selectedFilter !== 'none' && (
                <Animated.View
                    style={[S.draggableFilter, {
                        transform: filterPos.getTranslateTransform(),
                    }]}
                    {...panResponder.panHandlers}
                >
                    {buildFilterContent()}
                    {/* Drag hint border */}
                    <View style={S.dragHint}>
                        <Text style={S.dragHintText}>drag to move</Text>
                    </View>
                </Animated.View>
            )}

            {/* Top bar */}
            <View style={S.topBar}>
                <TouchableOpacity style={S.topBtn} onPress={onClose}>
                    <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={S.topTitle}>AR Filters</Text>
                <View style={[S.faceChip, { backgroundColor: faceDetected ? '#4ade8044' : 'rgba(0,0,0,0.5)' }]}>
                    <View style={[S.faceDot, { backgroundColor: faceDetected ? '#4ade80' : '#888' }]} />
                    <Text style={S.faceChipText}>
                        {faceDetected ? 'Face detected ✓' : 'Drag filter to face'}
                    </Text>
                </View>
            </View>

            {/* Size controls */}
            {selectedFilter !== 'none' && (
                <View style={S.sizeControls}>
                    <TouchableOpacity style={S.sizeBtn} onPress={() => setFilterScale(s => Math.max(0.4, s - 0.1))}>
                        <Text style={S.sizeBtnText}>－</Text>
                    </TouchableOpacity>
                    <Text style={S.sizeLabel}>Size</Text>
                    <TouchableOpacity style={S.sizeBtn} onPress={() => setFilterScale(s => Math.min(2.0, s + 0.1))}>
                        <Text style={S.sizeBtnText}>＋</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Shutter */}
            <TouchableOpacity
                style={[S.shutter, !cameraReady && { opacity: 0.4 }]}
                onPress={takePhoto}
                disabled={!cameraReady}
                activeOpacity={0.7}
            >
                <View style={S.shutterOuter}>
                    <View style={S.shutterInner} />
                </View>
            </TouchableOpacity>

            {/* Filter strip */}
            <View style={S.filterBar}>
                <FlatList
                    data={FILTERS}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}
                    renderItem={({ item }) => {
                        const active = selectedFilter === item.id;
                        return (
                            <TouchableOpacity
                                style={[S.chip, active && S.chipActive]}
                                onPress={() => setSelectedFilter(item.id)}
                            >
                                <Text style={S.chipEmoji}>{item.emoji}</Text>
                                <Text style={[S.chipLabel, active && S.chipLabelActive]}>{item.label}</Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    full: { flex: 1, backgroundColor: '#000' },
    center: { alignItems: 'center', justifyContent: 'center' },
    filterContent: { position: 'relative' },
    filterText: { textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 6 },

    // Draggable filter container
    draggableFilter: {
        position: 'absolute',
        zIndex: 10,
    },
    dragHint: {
        position: 'absolute', bottom: -22, left: 0, right: 0,
        alignItems: 'center',
    },
    dragHintText: {
        color: 'rgba(255,255,255,0.55)', fontSize: 10,
        backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    },

    // Top bar
    topBar: {
        position: 'absolute', top: 52, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, gap: 10,
    },
    topBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    topTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
    faceChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    },
    faceDot: { width: 7, height: 7, borderRadius: 4 },
    faceChipText: { color: '#fff', fontSize: 11 },

    // Size controls
    sizeControls: {
        position: 'absolute', right: 16, top: SH * 0.4,
        alignItems: 'center', gap: 6,
    },
    sizeBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    sizeBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
    sizeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

    // Shutter
    shutter: { position: 'absolute', bottom: 118, alignSelf: 'center' },
    shutterOuter: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 4, borderColor: '#fff',
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
    shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },

    // Filter strip
    filterBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.82)',
        paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 32 : 14,
    },
    chip: {
        alignItems: 'center', gap: 3, minWidth: 62,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1.5, borderColor: 'transparent',
    },
    chipActive: { borderColor: COLORS.primaryLight, backgroundColor: 'rgba(124,92,191,0.38)' },
    chipEmoji: { fontSize: 22 },
    chipLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    chipLabelActive: { color: COLORS.primaryLight, fontWeight: '700' },

    // Preview
    filterBadge: {
        position: 'absolute', top: 60, alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20,
        paddingHorizontal: 16, paddingVertical: 7,
    },
    filterBadgeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    previewActions: {
        position: 'absolute', bottom: 48, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'center', gap: 14,
    },
    retakeBtn: {
        backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: RADIUS.full,
        paddingHorizontal: 22, paddingVertical: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    retakeBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    postBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
        paddingHorizontal: 28, paddingVertical: 14,
    },
    postBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    closeBtn: {
        position: 'absolute', top: 52, right: 14,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },

    // Permission
    permTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
    permSub: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
    permBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center',
    },
    permBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});