import { useEffect, useState, useRef } from 'react';
import { View, Modal, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import useAuthStore from './store/authStore';
import useAccessibilityStore from './store/accessibilityStore';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ProfileScreen from './screens/ProfileScreen';
import FeedScreen from './screens/FeedScreen';
import CameraScreen from './screens/CameraScreen';
import MessagesScreen from './screens/MessagesScreen';
import SearchScreen from './screens/SearchScreen';
import ARFiltersScreen from './screens/ARFiltersScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import { BiometricLockScreen } from './screens/BiometricLockScreen';
import NetworkBanner from './components/NetworkBanner';
import { COLORS, darkColors, lightColors } from './constants/theme';
import { mediumFeedback } from './utils/haptics';
import { useNetworkStatus } from './utils/useNetworkStatus';
import { registerForPushNotifications } from './utils/notifications';

const Tab = createBottomTabNavigator();
const BIOMETRIC_KEY = 'glance_biometric_enabled';

function MainApp({ onARPress, onNotifPress }) {
  const [cameraVisible, setCameraVisible] = useState(false);
  const { isConnected, isCellular } = useNetworkStatus();
  const { themeOverride, highContrast, loadPreferences } = useAccessibilityStore();

  useEffect(() => { loadPreferences(); }, []);

  const C = highContrast
    ? { ...darkColors, background: '#000', surface: '#111', border: '#fff', text: '#fff' }
    : themeOverride === 'light' ? lightColors
      : darkColors;

  return (
    <>
      <NetworkBanner isConnected={isConnected} isCellular={isCellular} />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: C.surface,
              borderTopColor: C.border,
              borderTopWidth: 1,
              height: 65,
              paddingBottom: 10,
              paddingTop: 8,
            },
            tabBarActiveTintColor: C.primary,
            tabBarInactiveTintColor: C.textMuted,
            tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
          }}
        >
          <Tab.Screen name="Home"
            options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} /> }}
          >
            {() => <FeedScreen onNotifPress={onNotifPress} onARPress={onARPress} themeColors={C} />}
          </Tab.Screen>

          <Tab.Screen name="Search"
            options={{ tabBarLabel: 'Search', tabBarIcon: ({ color }) => <Ionicons name="search-outline" size={22} color={color} /> }}
          >
            {() => <SearchScreen themeColors={C} />}
          </Tab.Screen>

          <Tab.Screen name="Post" component={View}
            listeners={{ tabPress: async (e) => { e.preventDefault(); await mediumFeedback(); setCameraVisible(true); } }}
            options={{
              tabBarLabel: () => null,
              tabBarIcon: () => (
                <View style={styles.cameraTabBtn}>
                  <Ionicons name="add" size={28} color="#fff" />
                </View>
              ),
            }}
          />

          <Tab.Screen name="Messages"
            options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <Ionicons name="chatbubble-outline" size={22} color={color} /> }}
          >
            {() => <MessagesScreen themeColors={C} />}
          </Tab.Screen>

          <Tab.Screen name="Profile"
            options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} /> }}
          >
            {() => <ProfileScreen themeColors={C} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>

      <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => setCameraVisible(false)}>
        <CameraScreen onClose={() => setCameraVisible(false)} onPostCreated={() => setCameraVisible(false)} />
      </Modal>
    </>
  );
}

export default function App() {
  const [appState, setAppState] = useState('splash');
  const [locked, setLocked] = useState(false);
  const [arVisible, setArVisible] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const isLoggedInRef = useRef(false);
  const appStateRef = useRef('active');
  const biometricPromptActiveRef = useRef(false); 
  const { setSession, fetchProfile, clearAuth } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSession(session);
          await fetchProfile(session.user.id);
          isLoggedInRef.current = true;
          registerForPushNotifications(session.user.id);
        }
      } catch (e) { }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setSession(session);
        await fetchProfile(session.user.id);
        isLoggedInRef.current = true;
        setAppState('app');
      } else if (event === 'SIGNED_OUT') {
        clearAuth();
        isLoggedInRef.current = false;
        setLocked(false);
        setAppState('login');
      }
    });

   
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === 'background' && nextState === 'active') {
        if (isLoggedInRef.current && !biometricPromptActiveRef.current) {
          const val = await AsyncStorage.getItem(BIOMETRIC_KEY);
          if (val === 'true') {
            setLocked(true);
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const handleSplashFinish = () => {
    setAppState(isLoggedInRef.current ? 'app' : 'login');
  };

  const handleUnlock = () => {
    biometricPromptActiveRef.current = false;
    setLocked(false);
  };

  const handleLockMount = () => {
    biometricPromptActiveRef.current = true;
  };

  if (locked) {
    return (
      <BiometricLockScreen
        onUnlock={handleUnlock}
        onMount={handleLockMount}
      />
    );
  }
  if (appState === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;
  if (appState === 'login') return <LoginScreen onGoSignup={() => setAppState('signup')} />;
  if (appState === 'signup') return <SignupScreen onGoLogin={() => setAppState('login')} />;

  return (
    <>
      <MainApp
        onARPress={() => setArVisible(true)}
        onNotifPress={() => setNotifVisible(true)}
      />
      <Modal visible={arVisible} animationType="slide" onRequestClose={() => setArVisible(false)}>
        <ARFiltersScreen onClose={() => setArVisible(false)} onPhotoTaken={() => setArVisible(false)} />
      </Modal>
      <Modal visible={notifVisible} animationType="slide" transparent onRequestClose={() => setNotifVisible(false)}>
        <NotificationsScreen onClose={() => setNotifVisible(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cameraTabBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
});