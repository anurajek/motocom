import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

type Group = { group_id: string; name: string; member_count: number; invite_code: string };
type Loc = { user_id: string; user_name: string; lat: number; lng: number; speed: number; heading: number };

export default function MapScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  const loadGroups = useCallback(async () => {
    try {
      const g = await api<Group[]>('/groups');
      setGroups(g);
      if (g.length && !selected) setSelected(g[0].group_id);
    } catch {}
  }, [selected]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const loadLocs = useCallback(async () => {
    if (!selected) return;
    try {
      const l = await api<Loc[]>(`/groups/${selected}/locations`);
      setLocs(l);
    } catch {}
  }, [selected]);

  // Broadcast a simulated location for current user
  const broadcastMock = useCallback(async () => {
    if (!selected) return;
    // Simulate roaming around a base point
    const lat = 37.7749 + (Math.random() - 0.5) * 0.02;
    const lng = -122.4194 + (Math.random() - 0.5) * 0.02;
    const speed = Math.round(Math.random() * 90);
    try {
      await api(`/groups/${selected}/location`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng, speed, heading: Math.round(Math.random() * 360) }),
      });
      await loadLocs();
    } catch {}
  }, [selected, loadLocs]);

  useEffect(() => {
    loadLocs();
    const t = setInterval(loadLocs, 5000);
    return () => clearInterval(t);
  }, [loadLocs]);

  // On selecting group, seed one initial location
  useEffect(() => {
    if (selected) broadcastMock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 3 }],
    opacity: 1 - pulse.value,
  }));

  const positions = useMemo(() => {
    // Map lat/lng to pixel positions on a 320x420 canvas centered on average
    if (!locs.length) return [];
    const lats = locs.map((l) => l.lat);
    const lngs = locs.map((l) => l.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const dLat = Math.max(0.005, maxLat - minLat);
    const dLng = Math.max(0.005, maxLng - minLng);
    return locs.map((l) => ({
      ...l,
      x: 40 + ((l.lng - minLng) / dLng) * 240,
      y: 40 + ((maxLat - l.lat) / dLat) * 300,
    }));
  }, [locs]);

  return (
    <SafeAreaView style={s.root} edges={['top']} testID="map-screen">
      <View style={s.header}>
        <Text style={s.title}>LIVE MAP</Text>
        <Text style={s.sub}>Group riders tracked in real time</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={s.chipsContent}>
        {groups.length === 0 ? (
          <View style={[s.chip, { borderStyle: 'dashed' }]}>
            <Text style={s.chipText}>No groups yet</Text>
          </View>
        ) : groups.map((g) => (
          <Pressable
            key={g.group_id}
            onPress={() => setSelected(g.group_id)}
            style={[s.chip, selected === g.group_id && s.chipActive]}
            testID={`map-group-chip-${g.group_id}`}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={14}
              color={selected === g.group_id ? colors.brand : colors.onSurfaceSecondary}
            />
            <Text style={[s.chipText, selected === g.group_id && s.chipTextActive]}>{g.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={s.mapContainer}>
        {/* Grid background */}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`h${i}`} style={[s.gridLine, { top: (i + 1) * 55, left: 0, right: 0, height: 1 }]} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`v${i}`} style={[s.gridLine, { left: (i + 1) * 42, top: 0, bottom: 0, width: 1 }]} />
        ))}

        {/* Pulsing center radar */}
        <View style={s.radarCenter}>
          <Animated.View style={[s.radarPulse, pulseStyle]} />
          <View style={s.radarCore} />
        </View>

        {/* Rider markers */}
        {positions.map((p) => {
          const isMe = p.user_id === user?.user_id;
          return (
            <View key={p.user_id} style={[s.marker, { left: p.x - 20, top: p.y - 20 }]} testID={`rider-marker-${p.user_id}`}>
              <View style={[s.markerCircle, { borderColor: isMe ? colors.brand : colors.success }]}>
                <Text style={s.markerInitial}>{(p.user_name || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={s.markerLabel}>
                <Text style={s.markerName} numberOfLines={1}>{isMe ? 'YOU' : p.user_name}</Text>
                <Text style={s.markerSpeed}>{Math.round(p.speed)} km/h</Text>
              </View>
            </View>
          );
        })}

        {positions.length === 0 && (
          <View style={s.mapEmpty}>
            <Text style={s.mapEmptyText}>{selected ? 'Waiting for riders...' : 'Select a group to track'}</Text>
          </View>
        )}
      </View>

      <View style={s.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.bottomLabel}>ACTIVE RIDERS</Text>
          <Text style={s.bottomValue} testID="active-riders-count">{positions.length}</Text>
        </View>
        <Pressable
          onPress={broadcastMock}
          style={({ pressed }) => [s.broadcastBtn, pressed && { opacity: 0.85 }]}
          disabled={!selected}
          testID="broadcast-location-button"
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.onBrandPrimary} />
          <Text style={s.broadcastText}>Broadcast</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  chipsRow: { flexGrow: 0, marginTop: spacing.md, height: 56 },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: 'rgba(255,94,0,0.10)' },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.brand },

  mapContainer: {
    flex: 1, marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md,
    backgroundColor: '#0A0A0A', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,94,0,0.08)' },
  radarCenter: {
    position: 'absolute', top: '50%', left: '50%',
    width: 12, height: 12, marginLeft: -6, marginTop: -6,
    alignItems: 'center', justifyContent: 'center',
  },
  radarPulse: {
    position: 'absolute', width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: colors.brand,
  },
  radarCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },

  marker: { position: 'absolute', alignItems: 'center', width: 40 },
  markerCircle: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 3,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  markerInitial: { color: colors.onSurface, fontWeight: '900', fontSize: 14 },
  markerLabel: {
    marginTop: 4, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4, minWidth: 56, alignItems: 'center',
  },
  markerName: { color: colors.onSurface, fontSize: 9, fontWeight: '900' },
  markerSpeed: { color: colors.onSurfaceSecondary, fontSize: 9 },

  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapEmptyText: { color: colors.onSurfaceTertiary, fontSize: 13 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border,
  },
  bottomLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  bottomValue: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
  broadcastBtn: {
    height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md,
    backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  broadcastText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
