import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { NativeMap, type NativeMapMarker } from '@/src/native-map';

type HeatPoint = { lat: number; lng: number; w: number };
type Payload = { points: HeatPoint[]; ride_count: number; is_pro: boolean };

export default function Heatmap() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = await api<Payload>('/rides/heatmap');
      setData(p);
    } catch (e: any) {
      setError(e?.message || 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Convert heat points to markers (down-sampled) so the shared NativeMap can render them
  const markers: NativeMapMarker[] = (data?.points || []).slice(0, 200).map((p, i) => ({
    id: `h${i}`,
    lat: p.lat,
    lng: p.lng,
    label: 'H',
    isMe: p.w > 0.6,
  }));

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="heatmap-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.iconBtn} hitSlop={10} testID="heatmap-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>RIDE HEATMAP</Text>
          <Text style={s.sub}>Your most-traveled roads</Text>
        </View>
        <View style={s.proChip}>
          <MaterialCommunityIcons name="crown" size={12} color={colors.brand} />
          <Text style={s.proChipText}>PRO</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.statsRow}>
          <Stat icon="motorbike" label="Rides" value={String(data?.ride_count ?? 0)} />
          <Stat icon="map-marker-path" label="Points" value={String(data?.points.length ?? 0)} />
          <Stat icon="fire" label="Intensity" value={data && data.points.length ? 'HOT' : '—'} />
        </View>

        <View style={s.mapWrap}>
          {loading ? (
            <View style={s.mapLoader}><ActivityIndicator color={colors.brand} /></View>
          ) : (
            <NativeMap markers={markers} />
          )}
        </View>

        {!!error && (
          <View style={s.errorBox} testID="heatmap-error">
            <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {(!loading && data && data.points.length === 0) && (
          <View style={s.emptyBox} testID="heatmap-empty">
            <MaterialCommunityIcons name="motorbike-electric" size={40} color={colors.onSurfaceTertiary} />
            <Text style={s.emptyTitle}>No recorded rides yet</Text>
            <Text style={s.emptyText}>
              Go to the Map tab and tap REC to record a real ride. As you rack up rides, this heatmap fills in with your most-traveled roads.
            </Text>
            <Pressable onPress={() => router.replace('/(tabs)/map')} style={s.emptyBtn} testID="empty-go-map">
              <Text style={s.emptyBtnText}>OPEN MAP</Text>
            </Pressable>
          </View>
        )}

        <Text style={s.footnote}>
          Heatmap is a Rider Pro perk. On a dev/production build with real Google Maps enabled, a native heatmap tile overlay is drawn.
          In the preview, sampled points are shown on the radar view.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.brand} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
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
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  proChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: 'rgba(255,94,0,0.15)', borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.brand,
  },
  proChipText: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statValue: { color: colors.onSurface, fontSize: 18, fontWeight: '900', marginTop: 4 },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },

  mapWrap: {
    height: 320, borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, marginHorizontal: -spacing.lg,
  },
  mapLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },

  errorBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.12)', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 12, flex: 1 },
  emptyBox: {
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '900' },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.sm, paddingHorizontal: spacing.lg, height: 40,
    backgroundColor: colors.brand, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  footnote: { color: colors.onSurfaceTertiary, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: spacing.sm },
});
