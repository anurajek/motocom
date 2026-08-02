import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@/src/theme';
import { Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ride',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="motorbike" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="map-marker-radius" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ptt"
        options={{
          title: 'Talk',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="microphone" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
