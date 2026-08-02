import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';

type Ride = { ride_id: string; name: string; distance_km: number; duration_min: number; top_speed: number; created_at: string };

export default function RidesScreen() {
  const router = useRouter();
  const [rides, setRides] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api<Ride[]>('/rides');
      setRides(r);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load rides');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const total = rides.reduce((a, r) => a + r.distance_km, 0);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="rides-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.iconBtn} hitSlop={10} testID="rides-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>RIDE HISTORY</Text>
          <Text style={s.sub}>{rides.length} ride{rides.length === 1 ? '' : 's'} · {total.toFixed(1)} km total</Text>
        </View>
        <Pressable
          onPress={() => router.push('/rides/heatmap')}
          style={[s.iconBtn, { backgroundColor: colors.brand, flexDirection: 'row', paddingHorizontal: spacing.md, gap: 6, width: undefined }]}
          hitSlop={10}
          testID="open-heatmap-button"
        >
          <MaterialCommunityIcons name="fire" size={16} color={colors.onBrandPrimary} />
          <Text style={s.heatmapBtnText}>HEATMAP</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <>
          {!!error && (
            <View style={s.errorBar} testID="rides-error">
              <MaterialCommunityIcons name="alert-circle" size={14} color={colors.error} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
          <FlatList
          data={rides}
          keyExtractor={(r) => r.ride_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={() => (
            <View style={s.empty} testID="empty-rides">
              <MaterialCommunityIcons name="motorbike" size={48} color={colors.onSurfaceTertiary} />
              <Text style={s.emptyTitle}>No rides yet</Text>
              <Text style={s.emptyText}>Tap REC on the Map tab to record your first ride, or `Log Ride` on the dashboard for a demo entry.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/rides/${item.ride_id}`)}
              style={({ pressed }) => [s.card, pressed && { borderColor: colors.brand }]}
              testID={`ride-card-${item.ride_id}`}
            >
              <View style={s.cardIcon}>
                <MaterialCommunityIcons name="road-variant" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardMeta}>
                  {item.distance_km.toFixed(1)} km · {item.duration_min} min · top {Math.round(item.top_speed)} km/h
                </Text>
                <Text style={s.cardDate}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
        />
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heatmapBtnText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  empty: {
    marginTop: spacing.xxl, padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '900' },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center' },
  card: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  cardName: { color: colors.onSurface, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  cardDate: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  errorBar: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,59,48,0.12)', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.error,
  },
  errorText: { color: colors.error, fontSize: 12, flex: 1 },
});
