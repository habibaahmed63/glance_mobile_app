import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, Switch, ActivityIndicator
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { COLORS, RADIUS } from '../constants/theme';

export default function LocationScreen() {
    const { user, profile } = useAuthStore();
    const [location, setLocation] = useState(null);
    const [sharing, setSharing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [friendLocations, setFriendLocations] = useState([]);
    const mapRef = useRef(null);
    const watchRef = useRef(null);
    const channelRef = useRef(null);

    useEffect(() => {
        requestLocation();
        subscribeFriendLocations();
        return () => {
            stopSharing();
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, []);

    const requestLocation = async () => {
        setLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Location access is required to use this feature.');
            setLoading(false);
            return;
        }

        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation(current.coords);
        setLoading(false);
    };

    const subscribeFriendLocations = () => {
        channelRef.current = supabase
            .channel('location-sharing')
            .on('broadcast', { event: 'location' }, ({ payload }) => {
                if (payload.user_id !== user.id) {
                    setFriendLocations(prev => {
                        const filtered = prev.filter(l => l.user_id !== payload.user_id);
                        return [...filtered, payload];
                    });
                }
            })
            .subscribe();
    };

    const startSharing = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        setSharing(true);
        watchRef.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
            async (loc) => {
                setLocation(loc.coords);

                await channelRef.current?.send({
                    type: 'broadcast',
                    event: 'location',
                    payload: {
                        user_id: user.id,
                        username: profile?.username,
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                    },
                });
            }
        );
    };

    const stopSharing = () => {
        setSharing(false);
        if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
        }
    };

    const toggleSharing = async (val) => {
        if (val) await startSharing();
        else stopSharing();
    };

    const centerOnUser = () => {
        if (location && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 500);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar style="light" />
                <ActivityIndicator color={COLORS.primary} size="large" />
                <Text style={styles.loadingText}>Getting your location...</Text>
            </View>
        );
    }

    if (!location) {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar style="light" />
                <Ionicons name="location-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.loadingText}>Location not available</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={requestLocation}>
                    <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            =            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
                customMapStyle={darkMapStyle}
            >
                <Marker
                    coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                    title="You"
                >
                    <View style={styles.userMarker}>
                        <Ionicons name="person" size={14} color="#fff" />
                    </View>
                </Marker>

                <Circle
                    center={{ latitude: location.latitude, longitude: location.longitude }}
                    radius={50}
                    fillColor="rgba(124, 92, 191, 0.15)"
                    strokeColor="rgba(124, 92, 191, 0.4)"
                    strokeWidth={1}
                />

                {friendLocations.map((friend) => (
                    <Marker
                        key={friend.user_id}
                        coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
                        title={`@${friend.username}`}
                    >
                        <View style={styles.friendMarker}>
                            <Text style={styles.friendMarkerText}>
                                {friend.username?.[0]?.toUpperCase() || '?'}
                            </Text>
                        </View>
                    </Marker>
                ))}
            </MapView>

            <View style={styles.headerOverlay}>
                <Text style={styles.headerTitle}>Live Location</Text>
                {friendLocations.length > 0 && (
                    <Text style={styles.friendsOnline}>{friendLocations.length} friend{friendLocations.length > 1 ? 's' : ''} nearby</Text>
                )}
            </View>

            <View style={styles.controls}>
                {/* Share toggle */}
                <View style={styles.shareToggle}>
                    <View style={styles.shareToggleLeft}>
                        <Ionicons
                            name={sharing ? 'radio' : 'radio-outline'}
                            size={20}
                            color={sharing ? COLORS.primary : COLORS.textSecondary}
                        />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.shareToggleTitle}>
                                {sharing ? 'Sharing Live' : 'Share Location'}
                            </Text>
                            <Text style={styles.shareToggleSubtitle}>
                                {sharing ? 'Friends can see you' : 'Only you can see yourself'}
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={sharing}
                        onValueChange={toggleSharing}
                        trackColor={{ false: COLORS.border, true: COLORS.primary }}
                        thumbColor={sharing ? '#fff' : COLORS.textMuted}
                    />
                </View>

                <TouchableOpacity style={styles.centerBtn} onPress={centerOnUser}>
                    <Ionicons name="locate" size={20} color={COLORS.text} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#0a0a0f' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0f' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a24' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#13131a' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060834' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    map: { flex: 1 },

    loadingContainer: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: { color: COLORS.textSecondary, fontSize: 15 },
    retryBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    retryBtnText: { color: '#fff', fontWeight: '600' },

    headerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(10,10,15,0.8)',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.text,
    },
    friendsOnline: {
        fontSize: 13,
        color: COLORS.primary,
        marginTop: 2,
    },

    userMarker: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: COLORS.primary,
        borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    friendMarker: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: COLORS.accent,
        borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    friendMarkerText: { color: '#000', fontWeight: '700', fontSize: 13 },

    controls: {
        position: 'absolute',
        bottom: 20,
        left: 16,
        right: 16,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
    },
    shareToggle: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(19,19,26,0.95)',
        borderRadius: RADIUS.lg,
        padding: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    shareToggleLeft: { flexDirection: 'row', alignItems: 'center' },
    shareToggleTitle: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
    shareToggleSubtitle: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
    centerBtn: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(19,19,26,0.95)',
        borderWidth: 1, borderColor: COLORS.border,
        alignItems: 'center', justifyContent: 'center',
    },
});