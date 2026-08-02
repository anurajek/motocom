/**
 * Background ride recorder using expo-location + expo-task-manager.
 * - On native: registers a background location task and streams points.
 * - On web: falls back to browser geolocation (foreground only).
 * - Points are batched and posted to /api/rides/track every 30s or on stop.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';

const TASK_NAME = 'MOTOCOM_RIDE_LOCATION_TASK';

type Point = {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;
};

// Simple in-memory buffer (also usable in background handler via global)
declare global {
  // eslint-disable-next-line no-var
  var __motocomBuffer: Point[] | undefined;
  // eslint-disable-next-line no-var
  var __motocomRideId: string | undefined;
}

if (!globalThis.__motocomBuffer) globalThis.__motocomBuffer = [];

// Register background task once at module load (idempotent)
try {
  if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK_NAME)) {
    TaskManager.defineTask(TASK_NAME, async ({ data, error }: any) => {
      if (error || !data) return;
      const locations = data.locations || [];
      for (const l of locations) {
        globalThis.__motocomBuffer!.push({
          lat: l.coords.latitude,
          lng: l.coords.longitude,
          speed: Math.max(0, l.coords.speed || 0) * 3.6,
          heading: l.coords.heading || 0,
          timestamp: (l.timestamp || Date.now()) / 1000,
        });
      }
      // Flush if buffer large
      if (globalThis.__motocomBuffer!.length >= 20) {
        await flushBuffer();
      }
    });
  }
} catch {}

async function flushBuffer(name?: string): Promise<{ ride_id?: string } | null> {
  const buf = globalThis.__motocomBuffer!;
  if (!buf.length) return null;
  const points = buf.splice(0, buf.length);
  try {
    const res = await api<{ ride_id: string; points: number; distance_km: number }>('/rides/track', {
      method: 'POST',
      body: JSON.stringify({
        ride_id: globalThis.__motocomRideId,
        name,
        points,
      }),
    });
    globalThis.__motocomRideId = res.ride_id;
    return { ride_id: res.ride_id };
  } catch {
    // Restore points on failure so we retry next time
    globalThis.__motocomBuffer!.unshift(...points);
    return null;
  }
}

let webWatchId: number | null = null;
let flushTimer: any = null;

export type RideRecorder = {
  mode: 'native' | 'web' | 'unavailable';
  isSupported: boolean;
  start: (name?: string) => Promise<{ ok: boolean; error?: string }>;
  stop: () => Promise<{ ride_id?: string; points: number }>;
  isRunning: () => Promise<boolean>;
};

export const rideRecorder: RideRecorder = {
  get mode() {
    if (Platform.OS === 'web') return 'web';
    return 'native';
  },
  get isSupported() {
    return Platform.OS !== 'web' || (typeof navigator !== 'undefined' && !!navigator.geolocation);
  },

  async isRunning() {
    if (Platform.OS === 'web') return webWatchId !== null;
    try {
      return await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    } catch { return false; }
  },

  async start(name) {
    globalThis.__motocomBuffer = [];
    globalThis.__motocomRideId = undefined;

    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return { ok: false, error: 'Geolocation not supported in this browser' };
      }
      return new Promise((resolve) => {
        webWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            globalThis.__motocomBuffer!.push({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              speed: (pos.coords.speed || 0) * 3.6,
              heading: pos.coords.heading || 0,
              timestamp: pos.timestamp / 1000,
            });
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 1000 },
        );
        flushTimer = setInterval(() => flushBuffer(name), 30000);
        resolve({ ok: true });
      });
    }

    // Native
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { ok: false, error: 'Location permission denied' };
    // Background permission is optional; we start foreground first
    try { await Location.requestBackgroundPermissionsAsync(); } catch {}

    try {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'MotoCom is recording your ride',
          notificationBody: 'Tap to return to the app',
          notificationColor: '#FF5E00',
        },
        pausesUpdatesAutomatically: false,
      });
      flushTimer = setInterval(() => flushBuffer(name), 30000);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Failed to start tracking' };
    }
  },

  async stop() {
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    if (Platform.OS === 'web') {
      if (webWatchId !== null && typeof navigator !== 'undefined') {
        try { navigator.geolocation.clearWatch(webWatchId); } catch {}
        webWatchId = null;
      }
    } else {
      try {
        if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
          await Location.stopLocationUpdatesAsync(TASK_NAME);
        }
      } catch {}
    }
    const total = globalThis.__motocomBuffer!.length;
    const res = await flushBuffer();
    const ride_id = res?.ride_id || globalThis.__motocomRideId;
    globalThis.__motocomRideId = undefined;
    return { ride_id, points: total };
  },
};
