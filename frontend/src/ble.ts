/**
 * BLE scanner with graceful fallback.
 * - On native (iOS/Android) it uses react-native-ble-plx to scan real BT devices.
 * - On web (Expo Go / preview) it falls back to simulated multi-brand devices.
 * - react-native-ble-plx requires a dev build; if the native module isn't linked
 *   we automatically fall back to simulation.
 */
import { Platform, PermissionsAndroid } from 'react-native';

export type ScanResult = {
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

export function inferBrand(name: string | null | undefined): string {
  if (!name) return 'Generic';
  const n = name.toLowerCase();
  if (n.includes('sena') || n.startsWith('50s') || n.startsWith('30k') || n.startsWith('sf')) return 'Sena';
  if (n.includes('cardo') || n.includes('packtalk') || n.includes('freecom') || n.includes('spirit')) return 'Cardo';
  if (n.includes('uclear') || n.includes('amp')) return 'UClear';
  if (n.includes('interphone') || n.includes('u-com')) return 'Interphone';
  if (n.includes('midland') || n.includes('btx')) return 'Midland';
  return 'Generic';
}

function base64ToUtf8(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const str = base64.replace(/=+$/, '');
  let output = '';
  let bits = 0, value = 0;
  for (let i = 0; i < str.length; i++) {
    value = (value << 6) | chars.indexOf(str[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(output));
  } catch {
    return output;
  }
}

export async function resolveDeviceName(deviceId: string): Promise<{ name: string | null; debug: string }> {
  const manager = await tryLoadNative();
  if (!manager) return { name: null, debug: 'no-native-manager' };

  let device: any;
  try {
    device = await manager.connectToDevice(deviceId, { timeout: 8000 });
  } catch (e: any) {
    return { name: null, debug: `connect-failed:${e?.message || e?.errorCode || String(e)}` };
  }

  try {
    await device.discoverAllServicesAndCharacteristics();
  } catch (e: any) {
    await device.cancelConnection().catch(() => {});
    return { name: null, debug: `discover-failed:${e?.message || String(e)}` };
  }

  try {
    const char = await device.readCharacteristicForService(
      '00001800-0000-1000-8000-00805f9b34fb',
      '00002a00-0000-1000-8000-00805f9b34fb'
    );
    const raw = char?.value;
    const name = raw ? base64ToUtf8(raw).trim() : '';
    await device.cancelConnection().catch(() => {});
    return { name: name || null, debug: name ? 'read-ok' : 'empty-value' };
  } catch (e: any) {
    await device.cancelConnection().catch(() => {});
    return { name: null, debug: `read-failed:${e?.message || String(e)}` };
  }
}
export function mockScan(count = 5): ScanResult[] {
  const items: ScanResult[] = [];
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

type Handler = (r: ScanResult) => void;

export type BleController = {
  mode: 'native' | 'simulated';
  start: (onFound: Handler) => Promise<void>;
  stop: () => Promise<void>;
};

let cached: any | null = null;

async function tryLoadNative(): Promise<any | null> {
  if (Platform.OS === 'web') return null;
  if (cached !== null) return cached;
  try {
    // Dynamic require so bundler doesn't try to resolve at build time on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx');
    if (!mod?.BleManager) {
      cached = null;
      return null;
    }
    cached = new mod.BleManager();
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

async function requestAndroidPerms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perms = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN as any,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT as any,
    ].filter(Boolean);
    const res = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export async function createBle(): Promise<BleController> {
  const manager = await tryLoadNative();
  if (!manager) {
    // Simulated controller
    let timer: any = null;
    return {
      mode: 'simulated',
      async start(onFound) {
        let count = 0;
        const set = new Set<string>();
        timer = setInterval(() => {
          count++;
          const items = mockScan(1);
          for (const r of items) {
            if (!set.has(r.device_id)) {
              set.add(r.device_id);
              onFound(r);
            }
          }
          if (count >= 6) {
            clearInterval(timer);
            timer = null;
          }
        }, 700);
      },
      async stop() {
        if (timer) clearInterval(timer);
        timer = null;
      },
    };
  }

  return {
    mode: 'native',
    async start(onFound) {
      const granted = await requestAndroidPerms();
      if (!granted) throw new Error('Bluetooth permissions denied');
      manager.startDeviceScan(null, null, (error: any, device: any) => {
        if (error || !device) return;
        onFound({
          device_id: device.id,
          name: device.name || device.localName || 'Unknown Device',
          brand: inferBrand(device.name || device.localName),
          rssi: device.rssi ?? -90,
        });
      });
    },
    async stop() {
      try { manager.stopDeviceScan(); } catch {}
    },
  };
}