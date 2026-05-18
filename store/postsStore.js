import { create } from 'zustand';
import { supabase } from '../supabaseClient';

const usePostsStore = create((set) => ({
    posts: [],
    loading: false,

    fetchPosts: async () => {
        set({ loading: true });
        try {
            const { data: posts, error } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.log('fetchPosts error:', error.message);
                set({ loading: false });
                return;
            }

            if (!posts || posts.length === 0) {
                set({ posts: [], loading: false });
                return;
            }

            // Try to get profiles//
            const userIds = [...new Set(posts.map(p => p.user_id))];
            let profileMap = {};
            try {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name')
                    .in('id', userIds);
                if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
            } catch (e) {
                console.log('profiles fetch failed, showing posts without usernames');
            }

            // Try to get likes//
            let likeCounts = {};
            try {
                const postIds = posts.map(p => p.id);
                const { data: likes } = await supabase
                    .from('likes').select('post_id').in('post_id', postIds);
                if (likes) likes.forEach(l => {
                    likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
                });
            } catch (e) {
                console.log('likes fetch failed');
            }

            const enriched = posts.map(p => ({
                ...p,
                profiles: profileMap[p.user_id] || { username: 'user', avatar_url: null },
                likes_count: likeCounts[p.id] || 0,
            }));

            console.log(`Loaded ${enriched.length} posts`);
            set({ posts: enriched, loading: false });
        } catch (e) {
            console.log('fetchPosts exception:', e.message);
            set({ loading: false });
        }
    },

    addPost: (post) => set((state) => ({
        posts: [{ ...post, likes_count: 0 }, ...state.posts],
    })),

    updateLikes: (postId, delta) => set((state) => ({
        posts: state.posts.map(p =>
            p.id === postId
                ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + delta) }
                : p
        ),
    })),
}));

export default usePostsStore;