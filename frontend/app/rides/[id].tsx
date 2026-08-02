import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, spacing, radius } from '@/src/theme';
import { api, getToken } from '@/src/api';
import { NativeMap, type NativeMapMarker } from '@/src/native-map';

type Ride = { ride_id: string; name: string; distance_km: number; duration_min: number; top_speed: number; created_at: string };
type Point = { lat: number; lng: number; speed: number; ts: number };

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api<Ride>(`/rides/${id}`),
        api<Point[]>(`/rides/${id}/points`),
      ]);
      setRide(r);
      setPoints(p);
    } catch (e: any) {
      setError(e?.message || 'Failed to load ride');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const downloadGpx = async () => {
    if (!id) return;
    setDownloading(true); setError(''); setMsg('');
    try {
      const token = await getToken();
      const url = `${BASE}/api/rides/${id}/gpx`;

      if (Platform.OS === 'web') {
        // Fetch as blob and trigger browser download
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (typeof window !== 'undefined') {
          const objUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = `${ride?.name || id}.gpx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(objUrl);
        }
        setMsg('GPX file downloaded.');
        return;
      }

      // Native: download to cache then share
      const target = `${FileSystem.cacheDirectory}${id}.gpx`;
      const dl = await FileSystem.downloadAsync(url, target, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (dl.status !== 200) throw new Error(`Download failed (${dl.status})`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: 'application/gpx+xml', dialogTitle: 'Save GPX' });
        setMsg('GPX ready to share/save.');
      } else {
        setMsg(`GPX saved to ${dl.uri}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const removeRide = async () => {
    if (!id) return;
    try {
      await api(`/rides/${id}`, { method: 'DELETE' });
      router.back();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  };

  const markers: NativeMapMarker[] = points.length
    ? [
        {
          id: 'start',
          lat: points[0].lat,
          lng: points[0].lng,
          label: 'Start',
        },
        {
          id: 'end',
          lat: points[points.length - 1].lat,
          lng: points[points.length - 1].lng,
          label: 'End',
          isMe: true,
        },
      ]
    : [];

  if (loading || !ride) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.loader}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="ride-detail-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.iconBtn} hitSlop={10} testID="ride-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{ride.name}</Text>
          <Text style={s.sub}>{new Date(ride.created_at).toLocaleString()}</Text>
        </View>
        <Pressable onPress={removeRide} style={s.iconBtn} hitSlop={10} testID="ride-delete-button">
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.statsRow}>
          <Stat icon="road-variant" label="Distance" value={`${ride.distance_km.toFixed(1)} km`} />
          <Stat icon="clock-outline" label="Duration" value={`${ride.duration_min} min`} />
          <Stat icon="speedometer" label="Top speed" value={`${Math.round(ride.top_speed)} km/h`} />
        </View>

        <View style={s.mapWrap}>
          <NativeMap markers={markers} me={points[0] ? { lat: points[0].lat, lng: points[0].lng } : null} />
        </View>

        <View style={s.pointsBox}>
          <View style={s.pointsHeader}>
            <Text style={s.sectionTitle}>ROUTE POINTS</Text>
            <View style={s.proChip}>
              <MaterialCommunityIcons name="crown" size={10} color={colors.brand} />
              <Text style={s.proChipText}>PRO</Text>
            </View>
          </View>
          <Text style={s.pointsCount}>{points.length} GPS points logged</Text>
          {points.length > 0 && (
            <Text style={s.pointsMeta}>
              From {new Date(points[0].ts * 1000).toLocaleTimeString()} to {new Date(points[points.length - 1].ts * 1000).toLocaleTimeString()}
            </Text>
          )}
        </View>

        {!!error && (
          <View style={s.errorBox} testID="ride-error"><Text style={s.errorText}>{error}</Text></View>
        )}
        {!!msg && (
          <View style={s.msgBox} testID="ride-message"><Text style={s.msgText}>{msg}</Text></View>
        )}

        <Pressable
          onPress={downloadGpx}
          style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
          disabled={downloading || points.length === 0}
          testID="download-gpx-button"
        >
          {downloading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <>
              <MaterialCommunityIcons name="download" size={18} color={colors.onBrandPrimary} />
              <Text style={s.primaryText}>DOWNLOAD GPX</Text>
              <View style={s.btnProChip}>
                <Text style={s.btnProText}>PRO</Text>
              </View>
            </>
          )}
        </Pressable>

        {points.length === 0 && (
          <Text style={s.footnote}>
            No GPS points recorded for this ride (probably a demo entry from `Log Ride`). Record a real ride from the Map tab (REC) to enable GPX export.
          </Text>
        )}
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '900' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statValue: { color: colors.onSurface, fontSize: 18, fontWeight: '900', marginTop: 4 },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },

  mapWrap: {
    height: 260, borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, marginHorizontal: -spacing.lg,
  },

  pointsBox: {
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  pointsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  proChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(255,94,0,0.15)', borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.brand,
  },
  proChipText: { color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pointsCount: { color: colors.onSurface, fontSize: 15, fontWeight: '800', marginTop: 4 },
  pointsMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  errorBox: {
    backgroundColor: 'rgba(255,59,48,0.12)', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 12 },
  msgBox: {
    backgroundColor: 'rgba(50,215,75,0.12)', borderColor: colors.success, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  msgText: { color: colors.success, fontSize: 12 },

  primaryBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: spacing.sm,
  },
  primaryText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  btnProChip: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  btnProText: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  footnote: { color: colors.onSurfaceTertiary, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
