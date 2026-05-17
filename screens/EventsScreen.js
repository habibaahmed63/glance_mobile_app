import { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Alert, ActivityIndicator,
    Modal, TextInput, ScrollView, Image
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabaseClient';
import useAuthStore from '../store/authStore';
import { successFeedback, mediumFeedback } from '../utils/haptics';
import { COLORS, RADIUS } from '../constants/theme';
import { useTheme } from '../utils/useTheme';

export default function EventsScreen({ onClose }) {
    const C = useTheme();
    const { user, profile } = useAuthStore();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userLocation, setUserLocation] = useState(null);
    const [checkedIn, setCheckedIn] = useState(new Set());
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [attendees, setAttendees] = useState([]);
    const [createVisible, setCreateVisible] = useState(false);
    const [mapVisible, setMapVisible] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchEvents();
        getUserLocation();
    }, []);

    const getUserLocation = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation(loc.coords);
    };

    const fetchEvents = async () => {
        setLoading(true);
        const { data: eventsData } = await supabase
            .from('events')
            .select('*, profiles(username, avatar_url)')
            .order('created_at', { ascending: false });

        const { data: checkinsData } = await supabase
            .from('event_checkins')
            .select('event_id')
            .eq('user_id', user.id);

        if (eventsData) setEvents(eventsData);
        if (checkinsData) setCheckedIn(new Set(checkinsData.map(c => c.event_id)));
        setLoading(false);
    };

    const checkIn = async (event) => {
        if (!userLocation) {
            Alert.alert('Location needed', 'Please enable location to check in.');
            return;
        }

        const dist = getDistance(
            userLocation.latitude, userLocation.longitude,
            event.latitude, event.longitude
        );

        if (dist > 500) {
            Alert.alert(
                'Too far away',
                `You need to be within 500m of the event. You are ${Math.round(dist)}m away.`
            );
            return;
        }

        await mediumFeedback();

        const { error } = await supabase.from('event_checkins').insert([{
            user_id: user.id,
            event_id: event.id,
        }]);

        if (error) {
            Alert.alert('Error', error.message);
            return;
        }

        setCheckedIn(prev => new Set([...prev, event.id]));
        await successFeedback();
        Alert.alert('Checked In! 📍', `Welcome to ${event.title}!`);
        fetchEventAttendees(event.id);
    };

    const fetchEventAttendees = async (eventId) => {
        const { data } = await supabase
            .from('event_checkins')
            .select('*, profiles(username, avatar_url)')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });
        if (data) setAttendees(data);
    };

    const createEvent = async () => {
        if (!title.trim()) {
            Alert.alert('Missing title', 'Please enter an event title.');
            return;
        }
        if (!userLocation) {
            Alert.alert('Location needed', 'Enable location to create an event at your current position.');
            return;
        }

        setCreating(true);

        let eventAddress = address.trim();
        if (!eventAddress) {
            try {
                const [place] = await Location.reverseGeocodeAsync({
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                });
                eventAddress = [place.street, place.city, place.country].filter(Boolean).join(', ');
            } catch (e) {
                eventAddress = 'Unknown location';
            }
        }

        const { error } = await supabase.from('events').insert([{
            creator_id: user.id,
            title: title.trim(),
            description: description.trim(),
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            address: eventAddress,
            event_date: new Date().toISOString(),
        }]);

        if (error) {
            Alert.alert('Error', error.message);
        } else {
            await successFeedback();
            setTitle('');
            setDescription('');
            setAddress('');
            setCreateVisible(false);
            await fetchEvents();
        }
        setCreating(false);
    };

    const viewEvent = (event) => {
        setSelectedEvent(event);
        fetchEventAttendees(event.id);
    };

    const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const renderEvent = ({ item }) => {
        const isCheckedIn = checkedIn.has(item.id);
        const distance = userLocation
            ? Math.round(getDistance(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude))
            : null;

        return (
            <TouchableOpacity style={[styles.eventCard, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => viewEvent(item)}>
                <View style={styles.eventHeader}>
                    <View style={styles.eventIconContainer}>
                        <Ionicons name="location" size={22} color={COLORS.primary} />
                    </View>
                    <View style={styles.eventInfo}>
                        <Text style={[styles.eventTitle, { color: C.text }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.eventAddress} numberOfLines={1}>
                            {item.address || 'No address'}
                        </Text>
                    </View>
                    {isCheckedIn && (
                        <View style={styles.checkedInBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                            <Text style={styles.checkedInText}>In</Text>
                        </View>
                    )}
                </View>

                {item.description ? (
                    <Text style={styles.eventDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}

                <View style={styles.eventFooter}>
                    <Text style={styles.eventMeta}>
                        by @{item.profiles?.username}
                    </Text>
                    {distance !== null && (
                        <Text style={[styles.eventDistance, distance <= 500 && styles.eventDistanceNear]}>
                            {distance < 1000 ? `${distance}m away` : `${(distance / 1000).toFixed(1)}km away`}
                        </Text>
                    )}
                </View>

                <TouchableOpacity
                    style={[styles.checkInBtn, isCheckedIn && styles.checkInBtnDone]}
                    onPress={() => !isCheckedIn && checkIn(item)}
                    disabled={isCheckedIn}
                >
                    <Ionicons
                        name={isCheckedIn ? 'checkmark-circle' : 'location-outline'}
                        size={16}
                        color={isCheckedIn ? COLORS.success : '#fff'}
                    />
                    <Text style={[styles.checkInBtnText, isCheckedIn && { color: COLORS.success }]}>
                        {isCheckedIn ? 'Checked In' : 'Check In'}
                    </Text>
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: C.background }]}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <View style={styles.headerLeft}>
                    {onClose && (
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
                        </TouchableOpacity>
                    )}
                    <Text style={[styles.headerTitle, { color: C.text }]}>Events</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setMapVisible(true)}>
                        <Ionicons name="map-outline" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.createBtn} onPress={() => setCreateVisible(true)}>
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.createBtnText}>Create</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : events.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
                    <Text style={styles.emptyTitle}>No events yet</Text>
                    <Text style={styles.emptySubtext}>Create the first event in your area!</Text>
                    <TouchableOpacity style={styles.emptyBtn} onPress={() => setCreateVisible(true)}>
                        <Text style={styles.emptyBtnText}>Create Event</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={events}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderEvent}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            <Modal
                visible={selectedEvent !== null}
                animationType="slide"
                transparent
                onRequestClose={() => setSelectedEvent(null)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSelectedEvent(null)} />
                    <View style={[styles.detailSheet, { backgroundColor: C.surface }]}>
                        <View style={styles.handle} />

                        {selectedEvent && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={styles.detailTitle}>{selectedEvent.title}</Text>
                                <Text style={styles.detailAddress}>
                                    <Ionicons name="location-outline" size={14} color={COLORS.primary} />
                                    {' '}{selectedEvent.address}
                                </Text>

                                {selectedEvent.description ? (
                                    <Text style={styles.detailDesc}>{selectedEvent.description}</Text>
                                ) : null}

                                {/* Mini map */}
                                {selectedEvent.latitude && (
                                    <MapView
                                        style={styles.miniMap}
                                        initialRegion={{
                                            latitude: selectedEvent.latitude,
                                            longitude: selectedEvent.longitude,
                                            latitudeDelta: 0.005,
                                            longitudeDelta: 0.005,
                                        }}
                                        customMapStyle={darkMapStyle}
                                        scrollEnabled={false}
                                    >
                                        <Marker
                                            coordinate={{
                                                latitude: selectedEvent.latitude,
                                                longitude: selectedEvent.longitude,
                                            }}
                                        >
                                            <View style={styles.eventMarker}>
                                                <Ionicons name="location" size={18} color="#fff" />
                                            </View>
                                        </Marker>
                                    </MapView>
                                )}

                                <Text style={styles.attendeesTitle}>
                                    {attendees.length} Attendee{attendees.length !== 1 ? 's' : ''}
                                </Text>
                                <View style={styles.attendeesList}>
                                    {attendees.slice(0, 8).map(a => (
                                        <View key={a.id} style={styles.attendeeAvatar}>
                                            {a.profiles?.avatar_url ? (
                                                <Image source={{ uri: a.profiles.avatar_url }} style={styles.attendeeImg} />
                                            ) : (
                                                <Text style={styles.attendeeInitial}>
                                                    {a.profiles?.username?.[0]?.toUpperCase()}
                                                </Text>
                                            )}
                                        </View>
                                    ))}
                                    {attendees.length > 8 && (
                                        <View style={[styles.attendeeAvatar, styles.attendeeMore]}>
                                            <Text style={styles.attendeeMoreText}>+{attendees.length - 8}</Text>
                                        </View>
                                    )}
                                </View>

                                {!checkedIn.has(selectedEvent.id) && (
                                    <TouchableOpacity
                                        style={styles.detailCheckInBtn}
                                        onPress={() => { checkIn(selectedEvent); setSelectedEvent(null); }}
                                    >
                                        <Ionicons name="location" size={18} color="#fff" />
                                        <Text style={styles.detailCheckInText}>Check In Now</Text>
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={createVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setCreateVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBackdrop} onPress={() => setCreateVisible(false)} />
                    <View style={[styles.createSheet, { backgroundColor: C.surface }]}>
                        <View style={styles.handle} />
                        <View style={styles.createHeader}>
                            <Text style={styles.createTitle}>Create Event</Text>
                            <TouchableOpacity onPress={() => setCreateVisible(false)}>
                                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.createLabel}>Event Title *</Text>
                        <TextInput
                            style={[styles.createInput, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                            placeholder="What's happening?"
                            placeholderTextColor={COLORS.textMuted}
                            value={title}
                            onChangeText={setTitle}
                        />

                        <Text style={styles.createLabel}>Description</Text>
                        <TextInput
                            style={[styles.createInput, styles.createTextArea]}
                            placeholder="Tell people about your event..."
                            placeholderTextColor={COLORS.textMuted}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                        />

                        <Text style={styles.createLabel}>Address (optional)</Text>
                        <TextInput
                            style={[styles.createInput, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                            placeholder="Leave blank to use your current location"
                            placeholderTextColor={COLORS.textMuted}
                            value={address}
                            onChangeText={setAddress}
                        />

                        {userLocation && (
                            <View style={styles.locationNote}>
                                <Ionicons name="location" size={14} color={COLORS.primary} />
                                <Text style={styles.locationNoteText}>
                                    Event will be placed at your current GPS location
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.createSubmitBtn, creating && { opacity: 0.6 }]}
                            onPress={createEvent}
                            disabled={creating}
                        >
                            {creating
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={styles.createSubmitText}>Create Event</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={mapVisible}
                animationType="slide"
                onRequestClose={() => setMapVisible(false)}
            >
                <View style={styles.mapContainer}>
                    <StatusBar style="light" />
                    <TouchableOpacity style={styles.mapCloseBtn} onPress={() => setMapVisible(false)}>
                        <Ionicons name="arrow-back" size={22} color={COLORS.text} />
                    </TouchableOpacity>

                    {userLocation && (
                        <MapView
                            style={styles.fullMap}
                            initialRegion={{
                                latitude: userLocation.latitude,
                                longitude: userLocation.longitude,
                                latitudeDelta: 0.05,
                                longitudeDelta: 0.05,
                            }}
                            customMapStyle={darkMapStyle}
                        >
                            <Marker coordinate={userLocation} title="You">
                                <View style={styles.userMarker}>
                                    <Ionicons name="person" size={14} color="#fff" />
                                </View>
                            </Marker>

                            {events.map(event => (
                                <Marker
                                    key={event.id}
                                    coordinate={{ latitude: event.latitude, longitude: event.longitude }}
                                    title={event.title}
                                    onPress={() => { setMapVisible(false); viewEvent(event); }}
                                >
                                    <View style={[styles.eventMarker, checkedIn.has(event.id) && styles.eventMarkerChecked]}>
                                        <Ionicons name="location" size={16} color="#fff" />
                                    </View>
                                </Marker>
                            ))}
                        </MapView>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#0a0a0f' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0f' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a24' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060834' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: { padding: 6 },
    createBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    eventCard: {
        backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
        padding: 16, borderWidth: 1, borderColor: COLORS.border,
    },
    eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    eventIconContainer: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: `${COLORS.primary}22`,
        alignItems: 'center', justifyContent: 'center',
    },
    eventInfo: { flex: 1 },
    eventTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
    eventAddress: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
    checkedInBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    checkedInText: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
    eventDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 },
    eventFooter: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    eventMeta: { color: COLORS.textMuted, fontSize: 12 },
    eventDistance: { color: COLORS.textMuted, fontSize: 12 },
    eventDistanceNear: { color: COLORS.success, fontWeight: '600' },
    checkInBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingVertical: 10, gap: 6,
    },
    checkInBtnDone: { backgroundColor: `${COLORS.success}22`, borderWidth: 1, borderColor: COLORS.success },
    checkInBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
    emptySubtext: { color: COLORS.textSecondary, fontSize: 14 },
    emptyBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
    },
    emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalBackdrop: { flex: 1 },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16,
    },

    detailSheet: {
        backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, paddingBottom: 40, maxHeight: '85%',
        borderTopWidth: 1, borderColor: COLORS.border,
    },
    detailTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
    detailAddress: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 12 },
    detailDesc: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
    miniMap: { height: 160, borderRadius: RADIUS.lg, marginBottom: 16, overflow: 'hidden' },
    attendeesTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16, marginBottom: 10 },
    attendeesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    attendeeAvatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: COLORS.card, borderWidth: 2, borderColor: COLORS.border,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    attendeeImg: { width: 36, height: 36, borderRadius: 18 },
    attendeeInitial: { color: COLORS.primaryLight, fontWeight: '700', fontSize: 14 },
    attendeeMore: { backgroundColor: COLORS.primary },
    attendeeMoreText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    detailCheckInBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingVertical: 14, gap: 8,
    },
    detailCheckInText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    createSheet: {
        backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, paddingBottom: 40,
        borderTopWidth: 1, borderColor: COLORS.border,
    },
    createHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    createTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
    createLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8, marginTop: 14 },
    createInput: {
        backgroundColor: COLORS.card, borderRadius: RADIUS.md,
        borderWidth: 1, borderColor: COLORS.border,
        paddingHorizontal: 14, paddingVertical: 12,
        color: COLORS.text, fontSize: 15,
    },
    createTextArea: { height: 80, textAlignVertical: 'top' },
    locationNote: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 10, padding: 10,
        backgroundColor: `${COLORS.primary}11`,
        borderRadius: RADIUS.md,
    },
    locationNoteText: { color: COLORS.textSecondary, fontSize: 12, flex: 1 },
    createSubmitBtn: {
        backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
        paddingVertical: 14, alignItems: 'center', marginTop: 20,
    },
    createSubmitText: { color: '#fff', fontWeight: '700', fontSize: 16 },

    mapContainer: { flex: 1, backgroundColor: COLORS.background },
    fullMap: { flex: 1 },
    mapCloseBtn: {
        position: 'absolute', top: 60, left: 16, zIndex: 10,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(10,10,15,0.8)',
        alignItems: 'center', justifyContent: 'center',
    },
    userMarker: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: COLORS.primary, borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    eventMarker: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: COLORS.accent, borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    eventMarkerChecked: { backgroundColor: COLORS.success },
});