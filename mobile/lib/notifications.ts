import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export async function registerForBriefNotifications(sessionToken: string) {
  const permissions = await Notifications.getPermissionsAsync();
  const finalPermissions = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();

  if (!finalPermissions.granted) {
    return { registered: false, reason: 'Notifications permission was not granted.' };
  }

  const token = await Notifications.getExpoPushTokenAsync();
  await api.pushToken(sessionToken, token.data, Platform.OS);
  return { registered: true };
}

