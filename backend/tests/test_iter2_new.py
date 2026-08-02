"""Iteration 2 new endpoints: rides/track, rides/{id}/points, billing/status, billing/checkout-session, billing/webhook."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://intercom-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand(prefix="rider"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@motocom-test.com"


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def user_a():
    p = {"email": _rand("a"), "password": "Ride1234!", "name": "Rider A"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "email": p["email"]}


@pytest.fixture(scope="module")
def user_b():
    p = {"email": _rand("b"), "password": "Ride1234!", "name": "Rider B"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "email": p["email"]}


# ---------- Ride tracking ----------
class TestRideTracking:
    def test_track_without_ride_id_autocreates_ride(self, user_a):
        h = _h(user_a["token"])
        now = time.time()
        payload = {
            "name": "TEST_AutoRide",
            "points": [
                {"lat": 12.9, "lng": 77.5, "speed": 20, "heading": 90, "timestamp": now},
                {"lat": 12.91, "lng": 77.51, "speed": 30, "heading": 90, "timestamp": now + 60},
                {"lat": 12.92, "lng": 77.52, "speed": 40, "heading": 90, "timestamp": now + 120},
            ],
        }
        r = requests.post(f"{API}/rides/track", json=payload, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ride_id"].startswith("rid_")
        assert d["points"] == 3
        assert d["distance_km"] > 0
        pytest.ride_id_a = d["ride_id"]

    def test_track_with_existing_ride_appends(self, user_a):
        assert getattr(pytest, "ride_id_a", None)
        h = _h(user_a["token"])
        now = time.time() + 200
        payload = {
            "ride_id": pytest.ride_id_a,
            "points": [
                {"lat": 12.93, "lng": 77.53, "speed": 50, "heading": 90, "timestamp": now},
                {"lat": 12.94, "lng": 77.54, "speed": 55, "heading": 90, "timestamp": now + 30},
            ],
        }
        r = requests.post(f"{API}/rides/track", json=payload, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ride_id"] == pytest.ride_id_a
        assert d["points"] == 5  # 3 + 2

    def test_get_ride_points_ordered_and_scoped(self, user_a, user_b):
        h = _h(user_a["token"])
        r = requests.get(f"{API}/rides/{pytest.ride_id_a}/points", headers=h)
        assert r.status_code == 200
        pts = r.json()
        assert len(pts) == 5
        ts_values = [p["ts"] for p in pts]
        assert ts_values == sorted(ts_values), "points must be ascending by ts"
        assert all("_id" not in p for p in pts)

        # user_b should NOT see user_a's ride points
        r2 = requests.get(f"{API}/rides/{pytest.ride_id_a}/points", headers=_h(user_b["token"]))
        assert r2.status_code == 200
        assert r2.json() == []

    def test_track_requires_auth(self):
        r = requests.post(f"{API}/rides/track", json={"points": []})
        assert r.status_code == 401


# ---------- Billing ----------
class TestBilling:
    def test_billing_status_default_false(self, user_a):
        r = requests.get(f"{API}/billing/status", headers=_h(user_a["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["is_pro"] is False

    def test_billing_status_requires_auth(self):
        r = requests.get(f"{API}/billing/status")
        assert r.status_code == 401

    def test_checkout_session_returns_clean_error_when_stripe_not_configured(self, user_a):
        """With placeholder STRIPE_RIDER_PRO_PRICE_ID/SECRET_KEY, must NOT 5xx-crash.
        Acceptance: any non-500 status with clear error message, ideally 503."""
        h = _h(user_a["token"])
        body = {"return_url": "https://intercom-hub-3.preview.emergentagent.com/rider-pro"}
        r = requests.post(f"{API}/billing/checkout-session", json=body, headers=h)
        # Accept 400 or 503 (graceful); reject 500 (crash)
        assert r.status_code in (400, 503), f"Expected clean error, got {r.status_code}: {r.text}"
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        assert detail, "Expected a clear error message in 'detail'"

    def test_webhook_invalid_signature_400(self):
        r = requests.post(
            f"{API}/billing/webhook",
            data=b'{"type":"ping"}',
            headers={"stripe-signature": "invalid", "Content-Type": "application/json"},
        )
        assert r.status_code == 400
