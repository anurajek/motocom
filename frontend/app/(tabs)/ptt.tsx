import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withRepeat, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

type Group = { group_id: string; name: string; member_count: number };
type Device = { id: string; device_name: string; brand: string; connected: boolean };

type State = 'idle' | 'transmitting' | 'receiving';

export default function PTT() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [state, setState] = useState<State>('idle');
  const [talkers, setTalkers] = useState<string[]>([]);
  const pulse = useSharedValue(0);
  const scale = useSharedValue(1);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [g, d] = await Promise.all([api<Group[]>('/groups'), api<Device[]>('/devices')]);
        setGroups(g);
        if (g.length) setSelected(g[0]);
        setDevice(d.find((x) => x.connected) || null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  // Simulate another rider talking randomly
  useEffect(() => {
    if (!selected) return;
    const iv = setInterval(() => {
      if (state === 'transmitting') return;
      if (Math.random() < 0.35) {
        const names = ['Rex', 'Nova', 'Ash', 'Kai'];
        const who = names[Math.floor(Math.random() * names.length)];
        setTalkers([who]);
        setState('receiving');
        setTimeout(() => {
          setTalkers([]);
          setState((s) => (s === 'receiving' ? 'idle' : s));
        }, 2500);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [selected, state]);

  const startTalk = useCallback(() => {
    if (!selected) return;
    setState('transmitting');
    setTalkers([user?.name || 'You']);
    scale.value = withTiming(0.94, { duration: 120 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [selected, scale, user?.name]);

  const endTalk = useCallback(() => {
    setState('idle');
    setTalkers([]);
    scale.value = withTiming(1, { duration: 120 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [scale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.8 }],
    opacity: (1 - pulse.value) * 0.6,
  }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bgColor =
    state === 'transmitting' ? colors.error : state === 'receiving' ? colors.success : colors.brand;
  const stateLabel =
    state === 'transmitting' ? 'TRANSMITTING' : state === 'receiving' ? 'RECEIVING' : 'HOLD TO TALK';

  return (
    <SafeAreaView style={s.root} edges={['top']} testID="ptt-screen">
      <View style={s.header}>
        <Text style={s.title}>PUSH-TO-TALK</Text>
        <Text style={s.sub}>Voice channel across all connected intercoms</Text>
      </View>

      <View style={s.channelBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.channelLabel}>CHANNEL</Text>
          <Text style={s.channelName} numberOfLines={1} testID="ptt-channel-name">
            {selected ? selected.name : 'No channel'}
          </Text>
        </View>
        <View style={s.deviceBadge}>
          <MaterialCommunityIcons
            name={device ? 'bluetooth-connect' : 'bluetooth-off'}
            size={16}
            color={device ? colors.success : colors.onSurfaceTertiary}
          />
          <Text style={[s.deviceBadgeText, { color: device ? colors.success : colors.onSurfaceTertiary }]}>
            {device ? device.brand.toUpperCase() : 'NO INTERCOM'}
          </Text>
        </View>
      </View>

      {groups.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={s.chipsContent}>
          {groups.map((g) => (
            <Pressable
              key={g.group_id}
              onPress={() => setSelected(g)}
              style={[s.chip, selected?.group_id === g.group_id && s.chipActive]}
              testID={`ptt-channel-chip-${g.group_id}`}
            >
              <Text style={[s.chipText, selected?.group_id === g.group_id && s.chipTextActive]}>{g.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={s.speakerArea}>
        <Text style={s.speakerLabel}>ACTIVE SPEAKER</Text>
        <Text style={s.speakerName} testID="ptt-speaker-name">
          {talkers.length ? talkers.join(', ') : '—'}
        </Text>
        {state === 'receiving' && <View style={s.wave}><View style={s.waveBar} /><View style={[s.waveBar, { height: 22 }]} /><View style={[s.waveBar, { height: 14 }]} /><View style={[s.waveBar, { height: 26 }]} /><View style={s.waveBar} /></View>}
      </View>

      <View style={s.pttArea}>
        <View style={s.pttWrap}>
          <Animated.View style={[s.pulseRing, pulseStyle, { borderColor: bgColor }]} />
          <Animated.View style={btnStyle}>
            <Pressable
              onPressIn={startTalk}
              onPressOut={endTalk}
              disabled={!selected}
              hitSlop={20}
              style={[s.pttBtn, { backgroundColor: bgColor }, !selected && { opacity: 0.4 }]}
              testID="ptt-button"
            >
              <MaterialCommunityIcons name="microphone" size={72} color={colors.onBrandPrimary} />
            </Pressable>
          </Animated.View>
        </View>
        <Text style={[s.stateLabel, { color: bgColor }]} testID="ptt-state-label">{stateLabel}</Text>
        <Text style={s.hint}>{selected ? 'Press and hold the mic to broadcast to the group.' : 'Join or create a group first.'}</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  channelBar: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  channelLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  channelName: { color: colors.onSurface, fontSize: 16, fontWeight: '900', marginTop: 2 },
  deviceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  deviceBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  chipsRow: { flexGrow: 0, marginTop: spacing.sm, height: 56 },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.brand, backgroundColor: 'rgba(255,94,0,0.10)' },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.brand },

  speakerArea: { alignItems: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  speakerLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  speakerName: { color: colors.onSurface, fontSize: 20, fontWeight: '900', marginTop: 6 },
  wave: { flexDirection: 'row', gap: 4, marginTop: spacing.sm, alignItems: 'center', height: 30 },
  waveBar: { width: 4, height: 18, backgroundColor: colors.success, borderRadius: 2 },

  pttArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pttWrap: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 4 },
  pttBtn: {
    width: 220, height: 220, borderRadius: 110,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  stateLabel: { fontSize: 16, fontWeight: '900', letterSpacing: 3, marginTop: spacing.xl },
  hint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xl },
});
