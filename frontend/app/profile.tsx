import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

  const rows: { icon: any; label: string; onPress: () => void; testID: string; badge?: string }[] = [
    { icon: 'crown', label: 'Rider Pro', onPress: () => router.push('/rider-pro'), testID: 'profile-riderpro-row', badge: 'UPGRADE' },
    { icon: 'motorbike', label: 'Ride History', onPress: () => router.push('/rides'), testID: 'profile-rides-row' },
    { icon: 'fire', label: 'Ride Heatmap', onPress: () => router.push('/rides/heatmap'), testID: 'profile-heatmap-row', badge: 'PRO' },
    { icon: 'bluetooth', label: 'Paired Intercoms', onPress: () => router.push('/pair'), testID: 'profile-pair-row' },
    { icon: 'account-group', label: 'My Groups', onPress: () => router.push('/(tabs)/groups'), testID: 'profile-groups-row' },
    { icon: 'map-marker-radius', label: 'Live Map', onPress: () => router.push('/(tabs)/map'), testID: 'profile-map-row' },
    { icon: 'microphone', label: 'Push-to-Talk', onPress: () => router.push('/(tabs)/ptt'), testID: 'profile-ptt-row' },
  ];

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="profile-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10} testID="profile-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>PROFILE</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.name} numberOfLines={1}>{user?.name || 'Rider'}</Text>
          <Text style={s.email} numberOfLines={1}>{user?.email}</Text>
          {!!user?.bike && (
            <View style={s.bikeChip}>
              <MaterialCommunityIcons name="motorbike" size={14} color={colors.brand} />
              <Text style={s.bikeText}>{user.bike}</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>SHORTCUTS</Text>
        {rows.map((r) => (
          <Pressable
            key={r.label}
            onPress={r.onPress}
            style={({ pressed }) => [s.row, pressed && { borderColor: colors.brand }]}
            testID={r.testID}
          >
            <View style={s.rowIcon}>
              <MaterialCommunityIcons name={r.icon} size={20} color={colors.brand} />
            </View>
            <Text style={s.rowLabel}>{r.label}</Text>
            {r.badge && (
              <View style={s.rowBadge}>
                <Text style={s.rowBadgeText}>{r.badge}</Text>
              </View>
            )}
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}

        <Pressable onPress={signOut} style={s.signOut} testID="profile-signout-button">
          <MaterialCommunityIcons name="logout" size={18} color={colors.error} />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, textAlign: 'center', color: colors.onSurface, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },

  profileCard: {
    alignItems: 'center', padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandTertiary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.brand,
  },
  avatarText: { color: colors.brand, fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
  email: { color: colors.onSurfaceSecondary, fontSize: 13 },
  bikeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: 'rgba(255,94,0,0.12)', borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brand,
  },
  bikeText: { color: colors.brand, fontSize: 12, fontWeight: '700' },

  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: spacing.lg },
  row: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  rowBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.brand, borderRadius: radius.sm,
  },
  rowBadgeText: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  signOut: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.xl, paddingVertical: spacing.md,
  },
  signOutText: { color: colors.error, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
