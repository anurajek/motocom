import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

  const doDelete = async () => {
    setDeleting(true); setDeleteError('');
    try {
      await api('/auth/account', { method: 'DELETE' });
      await signOut();
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

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

        <Pressable
          onPress={() => { setDeleteOpen(true); setConfirmText(''); setDeleteError(''); }}
          style={s.deleteBtn}
          testID="profile-delete-account-button"
        >
          <MaterialCommunityIcons name="account-remove" size={14} color={colors.onSurfaceTertiary} />
          <Text style={s.deleteText}>Delete account</Text>
        </Pressable>
      </ScrollView>

      <Modal transparent animationType="fade" visible={deleteOpen} onRequestClose={() => setDeleteOpen(false)}>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 380 }}>
            <View style={s.sheet} testID="delete-account-sheet">
              <View style={s.deleteIconBox}>
                <MaterialCommunityIcons name="alert-octagram" size={30} color={colors.error} />
              </View>
              <Text style={s.sheetTitle}>Delete account?</Text>
              <Text style={s.sheetBody}>
                This permanently deletes your profile, rides, GPS traces, paired devices, groups you own, and cancels your Rider Pro subscription. This cannot be undone.
              </Text>
              <Text style={s.sheetHint}>Type <Text style={{ color: colors.error, fontWeight: '900' }}>DELETE</Text> to confirm.</Text>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                placeholder="DELETE"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={s.confirmInput}
                testID="delete-confirm-input"
              />
              {!!deleteError && <Text style={s.errText}>{deleteError}</Text>}
              <View style={s.btnRow}>
                <Pressable
                  onPress={() => setDeleteOpen(false)}
                  disabled={deleting}
                  style={[s.ghost, { flex: 1 }]}
                  testID="delete-cancel-button"
                >
                  <Text style={s.ghostText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={doDelete}
                  disabled={deleting || confirmText.trim().toUpperCase() !== 'DELETE'}
                  style={[s.danger, { flex: 1 }, (confirmText.trim().toUpperCase() !== 'DELETE' || deleting) && { opacity: 0.5 }]}
                  testID="delete-confirm-button"
                >
                  {deleting ? <ActivityIndicator color={colors.onError} /> : <Text style={s.dangerText}>DELETE</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  deleteBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm, paddingVertical: spacing.sm,
  },
  deleteText: { color: colors.onSurfaceTertiary, fontSize: 12 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  sheet: {
    width: '100%', maxWidth: 380,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.xl, gap: spacing.sm, alignItems: 'center',
  },
  deleteIconBox: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1, borderColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sheetBody: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  sheetHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
  confirmInput: {
    width: '100%', height: 48, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15, textAlign: 'center', letterSpacing: 4,
  },
  errText: { color: colors.error, fontSize: 12, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.sm },
  ghost: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
  danger: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error },
  dangerText: { color: colors.onError, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
