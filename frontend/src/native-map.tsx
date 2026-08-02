/**
 * Native map view using react-native-maps (Google provider).
 * Only imported on native platforms; see native-map.web.tsx for web fallback.
 */
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import { colors, radius, spacing } from '@/src/theme';

export type NativeMapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isMe?: boolean;
  speed?: number;
};

export function NativeMap({ markers, me }: { markers: NativeMapMarker[]; me?: { lat: number; lng: number } | null }) {
  const initial = me
    ? { latitude: me.lat, longitude: me.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : markers.length
      ? { latitude: markers[0].lat, longitude: markers[0].lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  return (
    <View style={s.wrap}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
      >
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.label}
            description={m.speed != null ? `${Math.round(m.speed)} km/h` : undefined}
            pinColor={m.isMe ? colors.brand : colors.success}
          >
            <View style={[s.marker, { borderColor: m.isMe ? colors.brand : colors.success }]}>
              <Text style={s.markerText}>{m.label.slice(0, 1).toUpperCase()}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  marker: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 3,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  markerText: { color: colors.onSurface, fontWeight: '900', fontSize: 12 },
});
