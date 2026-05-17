import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFTS_KEY = 'glance_drafts';

export const getDrafts = async () => {
  try {
    const data = await AsyncStorage.getItem(DRAFTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveDraft = async (draft) => {
  try {
    const drafts = await getDrafts();
    const newDraft = {
      id: Date.now().toString(),
      content: draft.content || '',
      imageUri: draft.imageUri || null,
      createdAt: new Date().toISOString(),
    };
    const updated = [newDraft, ...drafts];
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
    return newDraft;
  } catch (e) {
    console.error('Error saving draft:', e);
    return null;
  }
};

export const deleteDraft = async (draftId) => {
  try {
    const drafts = await getDrafts();
    const updated = drafts.filter(d => d.id !== draftId);
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error deleting draft:', e);
  }
};

export const clearAllDrafts = async () => {
  try {
    await AsyncStorage.removeItem(DRAFTS_KEY);
  } catch (e) {
    console.error('Error clearing drafts:', e);
  }
};