import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';

type Device = {
  id: string;
  device_name: string;
  brand: string;
  device_id: string;
  connected: boolean;
  rssi: number;
};

type ScanItem = {
  device_id: string;
  name: string;
  brand: string;
  rssi: number;
};

const BRANDS = [
  { brand: 'Sena', prefixes: ['50S', '30K', 'SF4', 'Spider ST1'] },
  { brand: 'Cardo', prefixes: ['Packtalk Edge', 'Freecom 4x', 'Spirit HD'] },
  { brand: 'UClear', prefixes: ['Motion 6', 'AMP Pro'] },
  { brand: 'Interphone', prefixes: ['U-COM 16', 'Tour'] },
  { brand: 'Midland', prefixes: ['BT Next Pro', 'BTX2 Pro'] },
  { brand: 'Generic', prefixes: ['BT Intercom', 'Helmet BT'] },
];

function makeMockScan(count = 5): ScanItem[] {
  const items: ScanItem[] = [];
  const used = new Set<string>();
  while (items.length < count) {
    const b = BRANDS[Math.floor(Math.random() * BRANDS.length)];
    const p = b.prefixes[Math.floor(Math.random() * b.prefixes.length)];
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const key = `${b.brand}-${p}-${suffix}`;
    if (used.has(key)) continue;
    used.add(key);
    items.push({
      device_id: `BT-${suffix}${Math.floor(Math.random() * 999)}`,
      name: `${p} ${suffix}`,
      brand: b.brand,
      rssi: -1 * (30 + Math.floor(Math.random() * 60)),
    });
  }
  return items.sort((a, b) => b.rssi - a.rssi);
}

export default function Pair() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<ScanItem[]>([]);
  const [saved, setSaved] = useState<Device[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  const loadSaved = useCallback(async () => {
    try {
      const d = await api<Device[]>('/devices');
      setSaved(d);
    } catch {}
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const startScan = () => {
    setScanning(true);
    setDiscovered([]);
    // Simulate progressive discovery
    let count = 0;
    const iv = setInterval(() => {
      count++;
      setDiscovered((prev) => {
        const next = makeMockScan(Math.min(prev.length + 1, 6));
        return next;
      });
      if (count >= 5) {
        clearInterval(iv);
        setScanning(false);
      }
    }, 700);
  };

  const connect = async (item: ScanItem) => {
    setConnecting(item.device_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      // Simulate 1.5s handshake
      await new Promise((r) => setTimeout(r, 1500));
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
    try {
      await api(`/devices/${dev.id}/toggle`, { method: 'POST' });
      await loadSaved();
    } catch {}
  };

  const remove = async (dev: Device) => {
    try {
      await api(`/devices/${dev.id}`, { method: 'DELETE' });
      await loadSaved();
    } catch {}
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 2 }],
    opacity: (1 - pulse.value) * 0.7,
  }));

  const activeDevice = saved.find((d) => d.connected);

  const signalIcon = (rssi: number) => {
    if (rssi > -50) return 'signal-cellular-3';
    if (rssi > -70) return 'signal-cellular-2';
    return 'signal-cellular-1';
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="pair-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10} testID="pair-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>PAIR INTERCOM</Text>
          <Text style={s.sub}>Multi-brand Bluetooth device manager</Text>
        </View>
      </View>

      {/* Radar / scan area */}
      <View style={s.radarBox}>
        {scanning && <Animated.View style={[s.radarPulse, pulseStyle]} />}
        <View style={s.radarCore}>
          <MaterialCommunityIcons name="bluetooth" size={36} color={colors.onBrandPrimary} />
        </View>
        <Text style={s.scanLabel}>
          {scanning ? 'SCANNING NEARBY DEVICES...' : discovered.length ? 'DEVICES FOUND' : 'READY TO SCAN'}
        </Text>
        <Pressable
          onPress={startScan}
          disabled={scanning}
          style={({ pressed }) => [s.scanBtn, pressed && { opacity: 0.85 }, scanning && { opacity: 0.5 }]}
          testID="start-scan-button"
        >
          {scanning ? <ActivityIndicator color={colors.onBrandPrimary} /> :
            <Text style={s.scanBtnText}>{discovered.length ? 'SCAN AGAIN' : 'START SCAN'}</Text>}
        </Pressable>
      </View>

      <FlatList
        data={discovered}
        keyExtractor={(i) => i.device_id}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
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
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

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
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20,
  },
  scanLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  scanBtn: {
    height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.md,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
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
