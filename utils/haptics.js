import * as Haptics from 'expo-haptics';

export const lightFeedback = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);


export const mediumFeedback = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);


export const heavyFeedback = () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);


export const successFeedback = () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);


export const errorFeedback = () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);


export const warningFeedback = () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);


export const selectionFeedback = () =>
    Haptics.selectionAsync();