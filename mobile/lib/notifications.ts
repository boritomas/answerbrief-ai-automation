import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export async function registerForBriefNotifications(sessionToken: string) {
  const permissions = await Notifications.getPermissionsAsync();
  const finalPermissions = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();

  if (!finalPermissions.granted) {
    return { registered: false, reason: 'Notifications permission was not granted.' };
  }

  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.pushToken(sessionToken, token.data, Platform.OS);
  return { registered: true };
}
