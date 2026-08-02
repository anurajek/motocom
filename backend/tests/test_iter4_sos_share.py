"""Iteration 4: Emergency SOS broadcast + Ride sharing (public token, HTML page)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://intercom-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand(prefix="rider"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@motocom-test.com"


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# -------- Fixtures --------
@pytest.fixture(scope="module")
def user_a():
    p = {"email": _rand("iter4a"), "password": "Ride1234!", "name": "SOS Rider A"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_b():
    p = {"email": _rand("iter4b"), "password": "Ride1234!", "name": "Rider B"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_lonely():
    """User with 0 groups (for zero-group SOS test)."""
    p = {"email": _rand("iter4lonely"), "password": "Ride1234!", "name": "Lonely Rider"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def two_groups(user_a):
    """Create 2 groups owned by user_a."""
    h = _h(user_a["token"])
    g_ids = []
    for i in range(2):
        r = requests.post(
            f"{API}/groups",
            json={"name": f"TEST_SOS_Group_{uuid.uuid4().hex[:6]}", "description": "iter4 sos"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        g_ids.append(r.json()["group_id"])
    return g_ids


@pytest.fixture(scope="module")
def ride_a(user_a):
    """Real tracked ride with 5 points for share tests."""
    h = _h(user_a["token"])
    now = time.time()
    payload = {
        "name": "TEST_Iter4ShareRide",
        "points": [
            {"lat": 12.90 + i * 0.01, "lng": 77.50 + i * 0.01, "speed": 20 + i * 5, "timestamp": now + i * 60}
            for i in range(5)
        ],
    }
    r = requests.post(f"{API}/rides/track", json=payload, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["ride_id"]


@pytest.fixture(scope="module")
def empty_ride(user_a):
    """Demo ride with 0 points (for HTML 'No GPS points' branch)."""
    h = _h(user_a["token"])
    r = requests.post(
        f"{API}/rides",
        json={"name": "TEST_EmptyShareRide", "distance_km": 0, "duration_min": 0, "top_speed": 0},
        headers=h,
    )
    assert r.status_code == 200, r.text
    return r.json()["ride_id"]


# ============ SOS ============
class TestSOSBroadcast:
    def test_sos_broadcasts_to_all_groups(self, user_a, two_groups):
        h = _h(user_a["token"])
        r = requests.post(f"{API}/sos", json={"lat": 12.9716, "lng": 77.5946}, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sos_id" in d and d["sos_id"].startswith("sos_")
        assert d["notified_groups"] == 2
        assert len(d["message_ids"]) == 2
        assert "google.com/maps" in d["maps_url"]
        assert "12.971600" in d["maps_url"]

        # Verify SOS message is in EACH group's chat
        for gid in two_groups:
            msgs = requests.get(f"{API}/groups/{gid}/messages", headers=h)
            assert msgs.status_code == 200, msgs.text
            texts = [m["text"] for m in msgs.json()]
            assert any("🆘 EMERGENCY" in t for t in texts), f"SOS msg missing in group {gid}: {texts}"

    def test_sos_with_optional_note(self, user_a, two_groups):
        h = _h(user_a["token"])
        note = "Bike down at mile 42"
        r = requests.post(
            f"{API}/sos",
            json={"lat": 13.0, "lng": 77.6, "message": note},
            headers=h,
        )
        assert r.status_code == 200, r.text
        # Check note appears in one of the group messages
        msgs = requests.get(f"{API}/groups/{two_groups[0]}/messages", headers=h).json()
        assert any(note in m["text"] for m in msgs)

    def test_sos_zero_groups_succeeds(self, user_lonely):
        h = _h(user_lonely["token"])
        r = requests.post(f"{API}/sos", json={"lat": 40.0, "lng": -74.0}, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["notified_groups"] == 0
        assert d["message_ids"] == []
        assert "sos_id" in d

    def test_sos_requires_auth(self):
        r = requests.post(f"{API}/sos", json={"lat": 0, "lng": 0})
        assert r.status_code == 401


# ============ Ride Sharing ============
class TestRideShare:
    def test_share_returns_token_and_url(self, user_a, ride_a):
        h = _h(user_a["token"])
        r = requests.post(f"{API}/rides/{ride_a}/share", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and len(d["token"]) >= 8
        assert "url" in d and d["token"] in d["url"]
        assert "/api/public/rides/" in d["url"]

    def test_share_is_idempotent_same_token(self, user_a, ride_a):
        h = _h(user_a["token"])
        r1 = requests.post(f"{API}/rides/{ride_a}/share", headers=h).json()
        r2 = requests.post(f"{API}/rides/{ride_a}/share", headers=h).json()
        assert r1["token"] == r2["token"], "Share token must be idempotent"

    def test_share_foreign_ride_404(self, user_b, ride_a):
        r = requests.post(f"{API}/rides/{ride_a}/share", headers=_h(user_b["token"]))
        assert r.status_code == 404

    def test_share_requires_auth(self, ride_a):
        r = requests.post(f"{API}/rides/{ride_a}/share")
        assert r.status_code == 401


class TestPublicRideJSON:
    def test_public_json_no_auth_required(self, user_a, ride_a):
        h = _h(user_a["token"])
        s = requests.post(f"{API}/rides/{ride_a}/share", headers=h).json()
        token = s["token"]

        # NO auth header
        r = requests.get(f"{API}/public/rides/{token}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "ride" in d
        assert d["ride"]["name"] == "TEST_Iter4ShareRide"
        assert d["ride"]["distance_km"] > 0
        assert d["owner_name"] == "SOS Rider A"
        assert isinstance(d["points"], list)
        assert len(d["points"]) == 5
        assert "lat" in d["points"][0] and "lng" in d["points"][0]

    def test_public_json_bad_token_404(self):
        r = requests.get(f"{API}/public/rides/notarealtoken12345")
        assert r.status_code == 404


class TestPublicRideHTML:
    def test_html_page_with_points_has_polyline(self, user_a, ride_a):
        h = _h(user_a["token"])
        token = requests.post(f"{API}/rides/{ride_a}/share", headers=h).json()["token"]
        r = requests.get(f"{API}/public/ride/{token}")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/html" in ct, ct
        body = r.text
        assert "<title>" in body
        assert "TEST_Iter4ShareRide" in body
        # Ride has points → polyline should be present
        assert "<polyline points=" in body
        # Owner name should be there
        assert "SOS Rider A" in body

    def test_html_page_empty_ride_shows_no_gps_points(self, user_a, empty_ride):
        h = _h(user_a["token"])
        token = requests.post(f"{API}/rides/{empty_ride}/share", headers=h).json()["token"]
        r = requests.get(f"{API}/public/ride/{token}")
        assert r.status_code == 200
        body = r.text
        assert "<title>" in body
        assert "TEST_EmptyShareRide" in body
        assert "No GPS points" in body
        assert "<polyline points=" not in body

    def test_html_bad_token_404(self):
        r = requests.get(f"{API}/public/ride/nonexistent_token_xyz")
        assert r.status_code == 404
        assert "text/html" in r.headers.get("content-type", "")


class TestRevokeShare:
    def test_revoke_makes_public_endpoints_404(self, user_a):
        h = _h(user_a["token"])
        # Create fresh ride+share so we don't affect other tests
        now = time.time()
        rid = requests.post(
            f"{API}/rides/track",
            json={"name": "TEST_RevokeRide", "points": [{"lat": 1.0, "lng": 1.0, "speed": 5, "timestamp": now}]},
            headers=h,
        ).json()["ride_id"]
        token = requests.post(f"{API}/rides/{rid}/share", headers=h).json()["token"]

        # Verify accessible first
        r_ok = requests.get(f"{API}/public/rides/{token}")
        assert r_ok.status_code == 200

        # Revoke
        rd = requests.delete(f"{API}/rides/{rid}/share", headers=h)
        assert rd.status_code == 200
        assert rd.json().get("revoked", 0) >= 1

        # Subsequent access → 404 on both JSON and HTML
        r_json = requests.get(f"{API}/public/rides/{token}")
        assert r_json.status_code == 404
        r_html = requests.get(f"{API}/public/ride/{token}")
        assert r_html.status_code == 404

    def test_revoke_requires_auth(self, ride_a):
        r = requests.delete(f"{API}/rides/{ride_a}/share")
        assert r.status_code == 401
