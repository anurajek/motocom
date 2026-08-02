import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';
import { NativeMap, type NativeMapMarker } from '@/src/native-map';
import { rideRecorder } from '@/src/ride-recorder';
import { SosButton } from '@/src/sos';

type Group = { group_id: string; name: string; member_count: number; invite_code: string };
type Loc = { user_id: string; user_name: string; lat: number; lng: number; speed: number; heading: number };

export default function MapScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [recording, setRecording] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const loadGroups = useCallback(async () => {
    try {
      const g = await api<Group[]>('/groups');
      setGroups(g);
      if (g.length && !selected) setSelected(g[0].group_id);
    } catch {}
  }, [selected]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { rideRecorder.isRunning().then(setRecording); }, []);

  const loadLocs = useCallback(async () => {
    if (!selected) return;
    try {
      const l = await api<Loc[]>(`/groups/${selected}/locations`);
      setLocs(l);
    } catch {}
  }, [selected]);

  const broadcast = useCallback(async () => {
    if (!selected) return;
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

  useEffect(() => { if (selected) broadcast(); /* eslint-disable-next-line */ }, [selected]);

  const toggleRecord = async () => {
    setStatusMsg('');
    if (recording) {
      const res = await rideRecorder.stop();
      setRecording(false);
      setStatusMsg(res.ride_id ? `Ride saved (${res.points} points)` : 'Recording stopped');
    } else {
      const res = await rideRecorder.start(`Ride ${new Date().toLocaleDateString()}`);
      if (!res.ok) setStatusMsg(res.error || 'Could not start');
      else { setRecording(true); setStatusMsg('Recording started · GPS active'); }
    }
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const markers: NativeMapMarker[] = locs.map((l) => ({
    id: l.user_id,
    lat: l.lat,
    lng: l.lng,
    label: l.user_id === user?.user_id ? 'You' : (l.user_name || '?'),
    isMe: l.user_id === user?.user_id,
    speed: l.speed,
  }));

  return (
    <SafeAreaView style={s.root} edges={['top']} testID="map-screen">
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>LIVE MAP</Text>
          <Text style={s.sub}>Group riders tracked in real time</Text>
        </View>
        <Pressable
          onPress={toggleRecord}
          style={[s.recBtn, recording && s.recBtnActive]}
          testID="record-ride-toggle"
          hitSlop={10}
        >
          <MaterialCommunityIcons name={recording ? 'stop-circle' : 'record-circle'} size={18} color={recording ? colors.onError : colors.onBrandPrimary} />
          <Text style={[s.recBtnText, recording && { color: colors.onError }]}>{recording ? 'STOP' : 'REC'}</Text>
        </Pressable>
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

      <NativeMap markers={markers} />

      <View pointerEvents="box-none" style={s.sosLayer}>
        <SosButton testID="map-sos-button" />
      </View>

      {!!statusMsg && (
        <View style={s.statusBanner} testID="ride-status-banner">
          <MaterialCommunityIcons name="information" size={14} color={colors.brand} />
          <Text style={s.statusText}>{statusMsg}</Text>
        </View>
      )}

      <View style={s.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.bottomLabel}>ACTIVE RIDERS</Text>
          <Text style={s.bottomValue} testID="active-riders-count">{markers.length}</Text>
        </View>
        <Pressable
          onPress={broadcast}
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
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  recBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  recBtnActive: { backgroundColor: colors.error },
  recBtnText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },

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

  statusBanner: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,94,0,0.12)', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brand,
  },
  statusText: { color: colors.brand, fontSize: 12, fontWeight: '700', flex: 1 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border,
  },
  bottomLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  bottomValue: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
  broadcastBtn: {
    height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md,
    backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  broadcastText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  sosLayer: {
    position: 'absolute', right: spacing.lg, bottom: 96 + spacing.lg,
  },
});
