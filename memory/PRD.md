# MotoCom — Product Requirements Document

## Vision
A cross-brand motorcycle intercom companion app for group riding. Riders pair their Bluetooth intercoms (Sena, Cardo, UClear, Interphone, Midland, Generic BT) to their phone, then use MotoCom to form riding groups, track each other on a live map, push-to-talk, and chat.

## Core Features (MVP)

1. **Authentication**
   - Email + password (JWT)
   - Emergent-managed Google social login (session token)

2. **Multi-brand BLE Pairing** (`/pair`)
   - Simulated BLE scan discovering nearby devices from multiple brands
   - Pair / disconnect / remove device
   - Only one device connected at a time

3. **Groups**
   - Create group with auto-generated 6-char invite code
   - Join with invite code
   - Group detail: members list, invite code sharing, leave group
   - Owner tracking

4. **Live Map**
   - Custom stylized radar/grid map (works in preview + native)
   - Rider markers with initials + speed
   - Broadcast own location
   - Auto-refresh every 5s

5. **Push-to-Talk**
   - Massive circular PTT button
   - State: idle (amber) / transmitting (red) / receiving (green)
   - Haptics on press/release
   - Simulated peer transmissions
   - Channel switching per group

6. **Group Chat**
   - Text messages fallback (poll every 4s while open)
   - Per-group message thread

7. **Ride Log**
   - Dashboard stats (total km, ride count, groups)
   - "Log Ride" seeds a demo ride

8. **Profile**
   - Basic profile with bike info, sign out

## Technical Notes / Caveats

- **Real BLE control of Sena/Cardo hardware is NOT possible** via public APIs. They use proprietary protocols and manufacturer SDKs. This app **simulates** discovery/pairing to give an authentic UX. Native BLE scanning (react-native-ble-plx) can be added in a development build for real device discovery — but audio bridging to intercoms still requires manufacturer partnerships.
- **PTT is UI-only** (voice transport not implemented). Real WebRTC/LiveKit voice channels can be added later.
- **Google Maps not integrated** — a stylized radar map is used to avoid preview limitations of react-native-maps. Can be swapped to react-native-maps in a native build.

## Backend

FastAPI + MongoDB. Endpoints under `/api/*`:
- `/auth/register`, `/auth/login`, `/auth/session`, `/auth/me`, `/auth/logout`
- `/groups`, `/groups/{id}`, `/groups/{id}/members`, `/groups/join`, `/groups/{id}/leave`
- `/groups/{id}/messages` (GET/POST)
- `/groups/{id}/location` (POST), `/groups/{id}/locations` (GET)
- `/devices` (GET/POST), `/devices/{id}/toggle`, `/devices/{id}` (DELETE)
- `/rides` (GET/POST)
