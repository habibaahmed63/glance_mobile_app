import { create } from 'zustand';
import { supabase } from '../supabaseClient';

const useAuthStore = create((set) => ({
    user: null,
    profile: null,
    session: null,
    loading: true,

    setSession: (session) => set({
        session,
        user: session?.user ?? null,
        loading: false,
    }),

    fetchProfile: async (userId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (!error) set({ profile: data });
    },

    setProfile: (profile) => set({ profile }),

    clearAuth: () => set({ user: null, profile: null, session: null }),
}));

export default useAuthStore;