/**
 * Web fallback for NativeMap - renders a stylized radar-grid map
 * because react-native-maps does not work on web.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, radius } from '@/src/theme';

export type NativeMapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isMe?: boolean;
  speed?: number;
};

export function NativeMap({ markers }: { markers: NativeMapMarker[]; me?: { lat: number; lng: number } | null }) {
  const pulse = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  const positions = useMemo(() => {
    if (!markers.length) return [];
    const lats = markers.map((l) => l.lat);
    const lngs = markers.map((l) => l.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const dLat = Math.max(0.005, maxLat - minLat);
    const dLng = Math.max(0.005, maxLng - minLng);
    return markers.map((l) => ({
      ...l,
      x: 40 + ((l.lng - minLng) / dLng) * 240,
      y: 40 + ((maxLat - l.lat) / dLat) * 300,
    }));
  }, [markers]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 3 }],
    opacity: 1 - pulse.value,
  }));

  return (
    <View style={s.wrap}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`h${i}`} style={[s.gridLine, { top: (i + 1) * 55, left: 0, right: 0, height: 1 }]} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`v${i}`} style={[s.gridLine, { left: (i + 1) * 42, top: 0, bottom: 0, width: 1 }]} />
      ))}
      <View style={s.radarCenter}>
        <Animated.View style={[s.radarPulse, pulseStyle]} />
        <View style={s.radarCore} />
      </View>
      {positions.map((p) => (
        <View key={p.id} style={[s.marker, { left: p.x - 20, top: p.y - 20 }]} testID={`rider-marker-${p.id}`}>
          <View style={[s.markerCircle, { borderColor: p.isMe ? colors.brand : colors.success }]}>
            <Text style={s.markerInitial}>{(p.label || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={s.markerLabel}>
            <Text style={s.markerName} numberOfLines={1}>{p.isMe ? 'YOU' : p.label}</Text>
            {p.speed != null && <Text style={s.markerSpeed}>{Math.round(p.speed)} km/h</Text>}
          </View>
        </View>
      ))}
      {positions.length === 0 && (
        <View style={s.mapEmpty}>
          <Text style={s.mapEmptyText}>Waiting for riders...</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: '#0A0A0A', borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,94,0,0.08)' },
  radarCenter: {
    position: 'absolute', top: '50%', left: '50%',
    width: 12, height: 12, marginLeft: -6, marginTop: -6,
    alignItems: 'center', justifyContent: 'center',
  },
  radarPulse: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.brand },
  radarCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  marker: { position: 'absolute', alignItems: 'center', width: 40 },
  markerCircle: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 3,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
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
});
