"""Iteration 3: ride detail (GET/DELETE/{id}), GPX export, and heatmap."""
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


@pytest.fixture(scope="module")
def user_a():
    p = {"email": _rand("a"), "password": "Ride1234!", "name": "Rider A"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_b():
    p = {"email": _rand("b"), "password": "Ride1234!", "name": "Rider B"}
    r = requests.post(f"{API}/auth/register", json=p, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def ride_a(user_a):
    """Create a real tracked ride with 5 GPS points for user A."""
    h = _h(user_a["token"])
    now = time.time()
    payload = {
        "name": "TEST_Iter3Ride",
        "points": [
            {"lat": 12.90 + i * 0.01, "lng": 77.50 + i * 0.01, "speed": 20 + i * 10, "heading": 90, "timestamp": now + i * 60}
            for i in range(5)
        ],
    }
    r = requests.post(f"{API}/rides/track", json=payload, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["points"] == 5
    return d["ride_id"]


# -------- GET /rides/{id} --------
class TestGetRide:
    def test_get_ride_scoped_to_owner(self, user_a, ride_a):
        r = requests.get(f"{API}/rides/{ride_a}", headers=_h(user_a["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ride_id"] == ride_a
        assert d["user_id"] == user_a["user"]["user_id"]
        assert d["distance_km"] > 0
        assert d["name"] == "TEST_Iter3Ride"

    def test_get_ride_foreign_returns_404(self, user_b, ride_a):
        r = requests.get(f"{API}/rides/{ride_a}", headers=_h(user_b["token"]))
        assert r.status_code == 404

    def test_get_ride_nonexistent_404(self, user_a):
        r = requests.get(f"{API}/rides/rid_nonexistent123", headers=_h(user_a["token"]))
        assert r.status_code == 404

    def test_get_ride_requires_auth(self, ride_a):
        r = requests.get(f"{API}/rides/{ride_a}")
        assert r.status_code == 401


# -------- GPX export --------
class TestGpxExport:
    def test_gpx_headers_and_body(self, user_a, ride_a):
        r = requests.get(f"{API}/rides/{ride_a}/gpx", headers=_h(user_a["token"]))
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "application/gpx+xml" in ct, ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "filename=" in cd.lower()
        body = r.text
        assert '<gpx version="1.1"' in body
        # each of the 5 points should be a trkpt with lat/lon
        assert body.count("<trkpt") == 5
        assert 'lat="' in body and 'lon="' in body

    def test_gpx_foreign_ride_404(self, user_b, ride_a):
        r = requests.get(f"{API}/rides/{ride_a}/gpx", headers=_h(user_b["token"]))
        assert r.status_code == 404


# -------- Heatmap --------
class TestHeatmap:
    def test_heatmap_empty_for_new_user(self, user_b):
        r = requests.get(f"{API}/rides/heatmap", headers=_h(user_b["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["points"] == []
        assert d["ride_count"] == 0
        assert d["is_pro"] is False

    def test_heatmap_returns_points_after_track(self, user_a, ride_a):
        r = requests.get(f"{API}/rides/heatmap", headers=_h(user_a["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ride_count"] >= 1
        assert isinstance(d["points"], list)
        assert len(d["points"]) >= 1
        pt = d["points"][0]
        assert "lat" in pt and "lng" in pt and "w" in pt
        assert isinstance(pt["w"], (int, float))

    def test_heatmap_route_not_shadowed_by_id_route(self, user_a):
        """CRITICAL: /rides/heatmap must NOT be caught by /rides/{id}. If it were,
        the handler would try to look up ride_id='heatmap' and 404."""
        r = requests.get(f"{API}/rides/heatmap", headers=_h(user_a["token"]))
        assert r.status_code == 200
        # Body should be heatmap payload, not a 'Ride not found' error
        d = r.json()
        assert "points" in d and "ride_count" in d and "is_pro" in d

    def test_heatmap_requires_auth(self):
        r = requests.get(f"{API}/rides/heatmap")
        assert r.status_code == 401


# -------- DELETE /rides/{id} (run last so earlier tests still see the ride) --------
class TestDeleteRide:
    def test_delete_ride_foreign_404(self, user_a, user_b):
        # Create a ride for A then try to delete as B
        h = _h(user_a["token"])
        payload = {
            "name": "TEST_ToBeProtected",
            "points": [{"lat": 12.1, "lng": 77.1, "speed": 10, "timestamp": time.time()}],
        }
        r = requests.post(f"{API}/rides/track", json=payload, headers=h)
        rid = r.json()["ride_id"]
        r2 = requests.delete(f"{API}/rides/{rid}", headers=_h(user_b["token"]))
        assert r2.status_code == 404
        # Still exists for A
        r3 = requests.get(f"{API}/rides/{rid}", headers=h)
        assert r3.status_code == 200

    def test_delete_ride_removes_ride_and_points(self, user_a):
        h = _h(user_a["token"])
        now = time.time()
        payload = {
            "name": "TEST_Deletable",
            "points": [
                {"lat": 13.0, "lng": 77.6, "speed": 20, "timestamp": now},
                {"lat": 13.01, "lng": 77.61, "speed": 25, "timestamp": now + 30},
            ],
        }
        r = requests.post(f"{API}/rides/track", json=payload, headers=h)
        rid = r.json()["ride_id"]

        # Points exist
        r_pts = requests.get(f"{API}/rides/{rid}/points", headers=h)
        assert r_pts.status_code == 200 and len(r_pts.json()) == 2

        # Delete
        rd = requests.delete(f"{API}/rides/{rid}", headers=h)
        assert rd.status_code == 200, rd.text
        assert rd.json() == {"ok": True}

        # Ride 404
        r_get = requests.get(f"{API}/rides/{rid}", headers=h)
        assert r_get.status_code == 404
        # Points removed
        r_pts2 = requests.get(f"{API}/rides/{rid}/points", headers=h)
        assert r_pts2.status_code == 200 and r_pts2.json() == []

    def test_delete_requires_auth(self, ride_a):
        r = requests.delete(f"{API}/rides/{ride_a}")
        assert r.status_code == 401
