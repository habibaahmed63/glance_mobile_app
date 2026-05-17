import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhqgivbqcyvfutamydmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocWdpdmJxY3l2ZnV0YW15ZG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDA1NzcsImV4cCI6MjA5Mjg3NjU3N30.jaRU_HoHEXH2EHw8xfEAUM_NTMD6FC27XGiqvYfmKmU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
    global: {
        fetch: fetch.bind(globalThis),
    },
});