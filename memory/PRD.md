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

7. **Ride Log & History**
   - Dashboard "Recent Rides" (top 5) + `SEE ALL` → full `/rides` list
   - Ride detail: distance/duration/top-speed, start+end markers on map, ROUTE POINTS card, delete ride
   - **GPX export** — one-tap download of ride as GPX 1.1 file (native uses Sharing sheet, web triggers browser download). Marketed as a Rider Pro perk.
   - **Ride heatmap** — sampled route points across all rides rendered on the map (Pro perk). Empty state guides user to record their first ride.

8. **Profile**
   - Basic profile with bike info, sign-out

## Technical Notes / Caveats

- **BLE real scanning is now wired** via `react-native-ble-plx` with automatic fallback to a simulated scanner on web / Expo Go. Real device discovery requires a **dev/production build** (react-native-ble-plx is a native module). Audio bridging to intercoms still requires manufacturer partnerships.
- **PTT is UI-only** (voice transport not implemented — LiveKit intentionally skipped per user request).
- **Google Maps** is now wired via `react-native-maps` (PROVIDER_GOOGLE) on native, with the radar fallback still used on web. To render real Google Maps in production, replace the two `REPLACE_WITH_YOUR_GOOGLE_MAPS_*_KEY` placeholders in `app.json`.
- **Background ride recording** implemented with `expo-location` + `expo-task-manager`. Points are batched and posted to `/api/rides/track` every 30s. Web falls back to `navigator.geolocation.watchPosition` (foreground only).
- **Rider Pro subscription** ($4.99/month, 7-day trial) implemented end-to-end. Backend: `/api/billing/*` endpoints + Stripe webhook. Frontend: `/rider-pro` screen using Stripe Checkout via `expo-web-browser` + deep link. **Requires** replacing placeholders in `backend/.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RIDER_PRO_PRICE_ID`. Backend returns 503 with a clean error when placeholders are still in use.

## Backend

FastAPI + MongoDB. Endpoints under `/api/*`:
- `/auth/register`, `/auth/login`, `/auth/session`, `/auth/me`, `/auth/logout`
- `/groups`, `/groups/{id}`, `/groups/{id}/members`, `/groups/join`, `/groups/{id}/leave`
- `/groups/{id}/messages` (GET/POST)
- `/groups/{id}/location` (POST), `/groups/{id}/locations` (GET)
- `/devices` (GET/POST), `/devices/{id}/toggle`, `/devices/{id}` (DELETE)
- `/rides` (GET/POST)
