import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';

type Device = { id: string; device_name: string; brand: string; connected: boolean; rssi: number };
type Ride = { ride_id: string; name: string; distance_km: number; duration_min: number; top_speed: number; created_at: string };
type Group = { group_id: string; name: string; member_count: number; invite_code: string };

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, r, g] = await Promise.all([
        api<Device[]>('/devices'),
        api<Ride[]>('/rides'),
        api<Group[]>('/groups'),
      ]);
      setDevices(d);
      setRides(r);
      setGroups(g);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeDevice = devices.find((d) => d.connected);
  const totalKm = rides.reduce((a, r) => a + r.distance_km, 0);
  const rideCount = rides.length;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const startDemoRide = async () => {
    try {
      await api('/rides', {
        method: 'POST',
        body: JSON.stringify({
          name: `Ride ${new Date().toLocaleDateString()}`,
          distance_km: Math.round((30 + Math.random() * 120) * 10) / 10,
          duration_min: Math.round(45 + Math.random() * 120),
          top_speed: Math.round(80 + Math.random() * 80),
        }),
      });
      await load();
    } catch {}
  };

  return (
    <SafeAreaView style={s.root} edges={['top']} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello}>HELLO, RIDER</Text>
            <Text style={s.name} testID="dashboard-user-name" numberOfLines={1}>{user?.name || 'Rider'}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            style={s.avatarBtn}
            testID="dashboard-profile-button"
            hitSlop={10}
          >
            <MaterialCommunityIcons name="account-circle" size={40} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* Intercom status card */}
        <View style={s.heroCard}>
          <LinearGradient
            colors={[colors.brandTertiary, colors.surfaceSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.heroContent}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroLabel}>INTERCOM STATUS</Text>
                <Text style={s.heroTitle} testID="intercom-status-text">
                  {activeDevice ? activeDevice.device_name : 'No device connected'}
                </Text>
                {activeDevice && (
                  <View style={s.brandChip}>
                    <MaterialCommunityIcons name="bluetooth" size={12} color={colors.brand} />
                    <Text style={s.brandChipText}>{activeDevice.brand}</Text>
                  </View>
                )}
              </View>
              <View style={[s.statusDot, { backgroundColor: activeDevice ? colors.success : colors.error }]} />
            </View>
            <Pressable
              onPress={() => router.push('/pair')}
              style={({ pressed }) => [s.heroCta, pressed && { opacity: 0.85 }]}
              testID="pair-device-button"
            >
              <MaterialCommunityIcons
                name={activeDevice ? 'bluetooth-connect' : 'bluetooth-transfer'}
                size={18}
                color={colors.onBrandPrimary}
              />
              <Text style={s.heroCtaText}>{activeDevice ? 'Manage devices' : 'Pair intercom'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatCard icon="road-variant" label="Total KM" value={totalKm.toFixed(1)} />
          <StatCard icon="map-marker-path" label="Rides" value={String(rideCount)} />
          <StatCard icon="account-group" label="Groups" value={String(groups.length)} />
        </View>

        {/* Quick actions */}
        <Text style={s.sectionTitle}>QUICK ACTIONS</Text>
        <View style={s.actionsGrid}>
          <ActionTile icon="motorbike" label="Log Ride" onPress={startDemoRide} testID="log-ride-button" />
          <ActionTile icon="map-marker-radius" label="Live Map" onPress={() => router.push('/(tabs)/map')} testID="open-map-button" />
          <ActionTile icon="microphone" label="Push-to-Talk" onPress={() => router.push('/(tabs)/ptt')} testID="open-ptt-button" />
          <ActionTile icon="account-group" label="My Groups" onPress={() => router.push('/(tabs)/groups')} testID="open-groups-button" />
        </View>

        {/* Recent rides */}
        <Text style={s.sectionTitle}>RECENT RIDES</Text>
        {rides.length === 0 ? (
          <View style={s.emptyBox} testID="empty-rides">
            <MaterialCommunityIcons name="motorbike" size={36} color={colors.onSurfaceTertiary} />
            <Text style={s.emptyText}>No rides logged. Tap "Log Ride" to add one.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {rides.slice(0, 5).map((r) => (
              <View key={r.ride_id} style={s.rideCard} testID={`ride-item-${r.ride_id}`}>
                <View style={s.rideIconBox}>
                  <MaterialCommunityIcons name="road-variant" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rideName} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.rideMeta}>
                    {r.distance_km.toFixed(1)} km · {r.duration_min} min · top {Math.round(r.top_speed)} km/h
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={signOut} style={s.logoutBtn} testID="logout-button">
          <MaterialCommunityIcons name="logout" size={16} color={colors.onSurfaceSecondary} />
          <Text style={s.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.statCard}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.brand} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ActionTile({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.actionTile, pressed && { opacity: 0.85, borderColor: colors.brand }]}
      testID={testID}
    >
      <View style={s.actionIconBox}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.brand} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  hello: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  name: { color: colors.onSurface, fontSize: 24, fontWeight: '900', marginTop: 2 },
  avatarBtn: { padding: 4 },

  heroCard: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, minHeight: 160,
  },
  heroContent: { padding: spacing.lg, gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  heroTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '900', marginTop: 4 },
  brandChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(255,94,0,0.15)', borderRadius: radius.sm, marginTop: spacing.sm,
  },
  brandChipText: { color: colors.brand, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  heroCta: {
    height: 48, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm,
  },
  heroCtaText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statValue: { color: colors.onSurface, fontSize: 22, fontWeight: '900', marginTop: 4 },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, fontWeight: '700' },

  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: spacing.md },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionTile: {
    width: '48%', flexGrow: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, minHeight: 88,
  },
  actionIconBox: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },

  emptyBox: {
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center' },

  rideCard: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  rideIconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  rideName: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  rideMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  logoutBtn: {
    marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md,
  },
  logoutText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
});
