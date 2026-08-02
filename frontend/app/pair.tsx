import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { createBle, type BleController, type ScanResult } from '@/src/ble';

type Device = {
  id: string;
  device_name: string;
  brand: string;
  device_id: string;
  connected: boolean;
  rssi: number;
};

export default function Pair() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<ScanResult[]>([]);
  const [saved, setSaved] = useState<Device[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'native' | 'simulated'>('simulated');
  const bleRef = useRef<BleController | null>(null);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  useEffect(() => {
    (async () => {
      const b = await createBle();
      bleRef.current = b;
      setMode(b.mode);
    })();
    return () => { bleRef.current?.stop().catch(() => {}); };
  }, []);

  const loadSaved = useCallback(async () => {
    try { setSaved(await api<Device[]>('/devices')); } catch {}
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const startScan = async () => {
    setError('');
    setDiscovered([]);
    setScanning(true);
    try {
      const set = new Set<string>();
      await bleRef.current!.start((r) => {
        if (set.has(r.device_id)) return;
        set.add(r.device_id);
        setDiscovered((prev) => [...prev, r].sort((a, b) => b.rssi - a.rssi));
      });
      // Auto stop after 10s
      setTimeout(async () => {
        await bleRef.current?.stop();
        setScanning(false);
      }, 10000);
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
      setScanning(false);
    }
  };

  const stopScan = async () => {
    await bleRef.current?.stop();
    setScanning(false);
  };

  const connect = async (item: ScanResult) => {
    setConnecting(item.device_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await api('/devices', {
        method: 'POST',
        body: JSON.stringify({
          device_name: item.name,
          brand: item.brand,
          device_id: item.device_id,
          rssi: item.rssi,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await loadSaved();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setConnecting(null);
    }
  };

  const toggle = async (dev: Device) => {
    try { await api(`/devices/${dev.id}/toggle`, { method: 'POST' }); await loadSaved(); } catch {}
  };
  const remove = async (dev: Device) => {
    try { await api(`/devices/${dev.id}`, { method: 'DELETE' }); await loadSaved(); } catch {}
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 2 }],
    opacity: (1 - pulse.value) * 0.7,
  }));

  const signalIcon = (rssi: number) => (rssi > -50 ? 'signal-cellular-3' : rssi > -70 ? 'signal-cellular-2' : 'signal-cellular-1');

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="pair-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10} testID="pair-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>PAIR INTERCOM</Text>
          <Text style={s.sub}>
            {mode === 'native' ? 'Real Bluetooth scanning' : 'Simulated scan (dev build for real BLE)'}
          </Text>
        </View>
        <View style={[s.modeBadge, { borderColor: mode === 'native' ? colors.success : colors.warning }]}>
          <Text style={[s.modeBadgeText, { color: mode === 'native' ? colors.success : colors.warning }]}>
            {mode === 'native' ? 'BLE' : 'SIM'}
          </Text>
        </View>
      </View>

      <View style={s.radarBox}>
        {scanning && <Animated.View style={[s.radarPulse, pulseStyle]} />}
        <View style={s.radarCore}>
          <MaterialCommunityIcons name="bluetooth" size={36} color={colors.onBrandPrimary} />
        </View>
        <Text style={s.scanLabel}>
          {scanning ? 'SCANNING NEARBY DEVICES...' : discovered.length ? `${discovered.length} DEVICE${discovered.length === 1 ? '' : 'S'} FOUND` : 'READY TO SCAN'}
        </Text>
        {!!error && <Text style={s.errorText}>{error}</Text>}
        <Pressable
          onPress={scanning ? stopScan : startScan}
          style={({ pressed }) => [s.scanBtn, pressed && { opacity: 0.85 }]}
          testID="start-scan-button"
        >
          {scanning
            ? <><ActivityIndicator color={colors.onBrandPrimary} /><Text style={s.scanBtnText}>  STOP</Text></>
            : <Text style={s.scanBtnText}>{discovered.length ? 'SCAN AGAIN' : 'START SCAN'}</Text>}
        </Pressable>
      </View>

      <FlatList
        data={discovered}
        keyExtractor={(i) => i.device_id}
        contentContainerStyle={s.list}
        ListHeaderComponent={() => (
          <>
            {saved.length > 0 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={s.sectionTitle}>MY DEVICES</Text>
                {saved.map((d) => (
                  <View key={d.id} style={s.savedRow} testID={`saved-device-${d.id}`}>
                    <View style={[s.savedIcon, { backgroundColor: d.connected ? colors.success : colors.surfaceTertiary }]}>
                      <MaterialCommunityIcons name="bluetooth" size={18} color={d.connected ? colors.onSuccess : colors.onSurfaceSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.savedName} numberOfLines={1}>{d.device_name}</Text>
                      <Text style={s.savedBrand}>{d.brand} · {d.connected ? 'CONNECTED' : 'Disconnected'}</Text>
                    </View>
                    <Pressable onPress={() => toggle(d)} style={s.smallBtn} hitSlop={8} testID={`toggle-device-${d.id}`}>
                      <Text style={s.smallBtnText}>{d.connected ? 'Disc.' : 'Connect'}</Text>
                    </Pressable>
                    <Pressable onPress={() => remove(d)} hitSlop={8} testID={`remove-device-${d.id}`}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.onSurfaceSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Text style={s.sectionTitle}>NEARBY</Text>
          </>
        )}
        ListEmptyComponent={() => (
          <View style={s.emptyDiscovered}>
            <Text style={s.emptyText}>
              {scanning ? 'Searching for intercom devices...' : 'Tap Start Scan to discover nearby helmets.'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isConnecting = connecting === item.device_id;
          return (
            <View style={s.deviceRow} testID={`discovered-${item.device_id}`}>
              <View style={s.brandBadge}>
                <MaterialCommunityIcons name="motorbike" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.deviceName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.deviceMeta}>{item.brand} · {item.device_id} · {item.rssi} dBm</Text>
              </View>
              <MaterialCommunityIcons name={signalIcon(item.rssi) as any} size={18} color={colors.onSurfaceSecondary} />
              <Pressable
                onPress={() => connect(item)}
                disabled={isConnecting}
                style={({ pressed }) => [s.connectBtn, pressed && { opacity: 0.85 }, isConnecting && { opacity: 0.6 }]}
                testID={`connect-${item.device_id}`}
              >
                {isConnecting ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> :
                  <Text style={s.connectBtnText}>PAIR</Text>}
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  modeBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.sm, borderWidth: 1,
  },
  modeBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  radarBox: {
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    padding: spacing.xl, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    gap: spacing.md, minHeight: 220,
  },
  radarPulse: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: colors.brand, top: '35%',
  },
  radarCore: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  scanLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  errorText: { color: colors.error, fontSize: 12, textAlign: 'center' },
  scanBtn: {
    height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.md,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  scanBtnText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },

  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: spacing.sm },

  savedRow: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  savedIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  savedName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  savedBrand: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  smallBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  smallBtnText: { color: colors.onSurface, fontSize: 11, fontWeight: '700' },

  emptyDiscovered: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center' },

  deviceRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  brandBadge: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  deviceName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  deviceMeta: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  connectBtn: {
    height: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  connectBtnText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
