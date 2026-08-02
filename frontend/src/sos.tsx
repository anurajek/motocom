import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from './theme';
import { api } from './api';

async function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 },
      );
    });
  }
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { return null; }
}

export function SosButton({ testID = 'sos-button', style }: { testID?: string; style?: any }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ notified_groups: number } | null>(null);
  const [error, setError] = useState('');
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  const openModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setModalOpen(true);
    setConfirming(false);
    setResult(null);
    setError('');
  }, []);

  const send = useCallback(async () => {
    setSending(true); setError('');
    try {
      const coords = await getCoords();
      const fallback = { lat: 0, lng: 0 };
      const c = coords || fallback;
      const res = await api<{ notified_groups: number }>('/sos', {
        method: 'POST',
        body: JSON.stringify({ lat: c.lat, lng: c.lng }),
      });
      setResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Failed to send SOS');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSending(false);
    }
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.4 }],
    opacity: (1 - pulse.value) * 0.6,
  }));

  return (
    <>
      <View style={[s.wrap, style]}>
        <Animated.View style={[s.pulseRing, pulseStyle]} pointerEvents="none" />
        <Pressable
          onPress={openModal}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
          testID={testID}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="alert-octagram" size={26} color={colors.onError} />
          <Text style={s.btnText}>SOS</Text>
        </Pressable>
      </View>

      <Modal transparent animationType="fade" visible={modalOpen} onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet} testID="sos-sheet">
            <View style={s.sheetIcon}>
              <MaterialCommunityIcons name="alert-octagram" size={30} color={colors.error} />
            </View>
            {result ? (
              <>
                <Text style={s.sheetTitle}>SOS BROADCASTED</Text>
                <Text style={s.sheetBody}>
                  Alert sent to {result.notified_groups} group{result.notified_groups === 1 ? '' : 's'}.
                  Your live location was shared via chat.
                </Text>
                <Pressable
                  onPress={() => setModalOpen(false)}
                  style={s.primary}
                  testID="sos-close-button"
                >
                  <Text style={s.primaryText}>CLOSE</Text>
                </Pressable>
              </>
            ) : confirming ? (
              <>
                <Text style={s.sheetTitle}>Send emergency alert?</Text>
                <Text style={s.sheetBody}>
                  This will broadcast your current GPS location to every group you belong to. Use for real emergencies only.
                </Text>
                {!!error && <Text style={s.errorText} testID="sos-error">{error}</Text>}
                <View style={s.btnRow}>
                  <Pressable
                    onPress={() => setModalOpen(false)}
                    style={[s.ghost, { flex: 1 }]}
                    disabled={sending}
                    testID="sos-cancel-button"
                  >
                    <Text style={s.ghostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={send}
                    disabled={sending}
                    style={[s.danger, { flex: 1 }]}
                    testID="sos-confirm-button"
                  >
                    {sending ? <ActivityIndicator color={colors.onError} /> : <Text style={s.dangerText}>SEND SOS</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.sheetTitle}>Emergency SOS</Text>
                <Text style={s.sheetBody}>
                  Tap SEND SOS to alert every group you belong to with your live location.
                </Text>
                <View style={s.btnRow}>
                  <Pressable
                    onPress={() => setModalOpen(false)}
                    style={[s.ghost, { flex: 1 }]}
                    testID="sos-dismiss-button"
                  >
                    <Text style={s.ghostText}>Not now</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirming(true)}
                    style={[s.danger, { flex: 1 }]}
                    testID="sos-open-confirm-button"
                  >
                    <Text style={s.dangerText}>SEND SOS</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.error,
  },
  btn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 6px 16px rgba(255,59,48,0.5)',
  },
  btnText: { color: colors.onError, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: -2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    width: '100%', maxWidth: 380,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.xl, gap: spacing.md, alignItems: 'center',
  },
  sheetIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1, borderColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sheetBody: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  errorText: { color: colors.error, fontSize: 12, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.sm },
  ghost: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
  danger: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error },
  dangerText: { color: colors.onError, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  primary: { height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, marginTop: spacing.sm },
  primaryText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
