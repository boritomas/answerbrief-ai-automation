import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.border }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="home-outline" size={size} /> }} />
      <Tabs.Screen name="fit-check" options={{ title: 'Fit Check', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="sparkles-outline" size={size} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="briefcase-outline" size={size} /> }} />
      <Tabs.Screen name="support" options={{ title: 'Support', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="chatbubbles-outline" size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons color={color} name="person-circle-outline" size={size} /> }} />
    </Tabs>
  );
}

