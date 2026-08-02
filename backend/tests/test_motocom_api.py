"""MotoCom backend API tests - covers auth, groups, messages, locations, devices, rides."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://intercom-hub-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand(prefix="rider"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@motocom-test.com"


@pytest.fixture(scope="module")
def user_a():
    payload = {"email": _rand("a"), "password": "Ride1234!", "name": "Rider A", "bike": "Ducati V4"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "password": payload["password"], "email": payload["email"]}


@pytest.fixture(scope="module")
def user_b():
    payload = {"email": _rand("b"), "password": "Ride1234!", "name": "Rider B"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "password": payload["password"], "email": payload["email"]}


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_token_and_user(self, user_a):
        assert "token" in user_a
        assert user_a["user"]["email"] == user_a["email"]
        assert user_a["user"]["user_id"].startswith("usr_")

    def test_login_success(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": user_a["password"]})
        assert r.status_code == 200
        assert "token" in r.json()
        assert r.json()["user"]["email"] == user_a["email"]

    def test_login_wrong_password_401(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "WRONG"})
        assert r.status_code == 401

    def test_me_with_token(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=_h(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["email"] == user_a["email"]

    def test_me_without_token_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_duplicate_email(self, user_a):
        r = requests.post(f"{API}/auth/register", json={"email": user_a["email"], "password": "x", "name": "dup"})
        assert r.status_code == 400


# ---------- Groups ----------
@pytest.fixture(scope="module")
def group_ctx(user_a):
    r = requests.post(f"{API}/groups", json={"name": "TEST_Group_" + uuid.uuid4().hex[:6], "description": "Ride"}, headers=_h(user_a["token"]))
    assert r.status_code == 200, r.text
    return r.json()


class TestGroups:
    def test_create_group_auto_adds_owner(self, group_ctx, user_a):
        assert group_ctx["group_id"].startswith("grp_")
        assert group_ctx["invite_code"] and len(group_ctx["invite_code"]) == 6
        assert group_ctx["owner_id"] == user_a["user"]["user_id"]
        assert group_ctx["member_count"] == 1

    def test_list_my_groups_contains_created(self, group_ctx, user_a):
        r = requests.get(f"{API}/groups", headers=_h(user_a["token"]))
        assert r.status_code == 200
        assert any(g["group_id"] == group_ctx["group_id"] for g in r.json())

    def test_get_group_by_id(self, group_ctx, user_a):
        r = requests.get(f"{API}/groups/{group_ctx['group_id']}", headers=_h(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["group_id"] == group_ctx["group_id"]

    def test_group_members_endpoint(self, group_ctx, user_a):
        r = requests.get(f"{API}/groups/{group_ctx['group_id']}/members", headers=_h(user_a["token"]))
        assert r.status_code == 200
        members = r.json()
        assert any(m["user_id"] == user_a["user"]["user_id"] for m in members)

    def test_join_group_with_invite_code(self, group_ctx, user_b):
        r = requests.post(f"{API}/groups/join", json={"invite_code": group_ctx["invite_code"]}, headers=_h(user_b["token"]))
        assert r.status_code == 200
        assert r.json()["group_id"] == group_ctx["group_id"]

        # verify member_count increased
        r2 = requests.get(f"{API}/groups/{group_ctx['group_id']}", headers=_h(user_b["token"]))
        assert r2.json()["member_count"] >= 2

    def test_join_invalid_code_404(self, user_b):
        r = requests.post(f"{API}/groups/join", json={"invite_code": "ZZZZZZ"}, headers=_h(user_b["token"]))
        assert r.status_code == 404

    def test_leave_group(self, group_ctx, user_b):
        r = requests.delete(f"{API}/groups/{group_ctx['group_id']}/leave", headers=_h(user_b["token"]))
        assert r.status_code == 200
        # rejoin so subsequent tests still see user_b as member
        requests.post(f"{API}/groups/join", json={"invite_code": group_ctx["invite_code"]}, headers=_h(user_b["token"]))


# ---------- Messages ----------
class TestMessages:
    def test_send_and_list_messages_ordered(self, group_ctx, user_a, user_b):
        gid = group_ctx["group_id"]
        r1 = requests.post(f"{API}/groups/{gid}/messages", json={"text": "hello 1"}, headers=_h(user_a["token"]))
        assert r1.status_code == 200
        time.sleep(0.05)
        r2 = requests.post(f"{API}/groups/{gid}/messages", json={"text": "hello 2"}, headers=_h(user_b["token"]))
        assert r2.status_code == 200

        r = requests.get(f"{API}/groups/{gid}/messages", headers=_h(user_a["token"]))
        assert r.status_code == 200
        msgs = r.json()
        texts = [m["text"] for m in msgs]
        i1, i2 = texts.index("hello 1"), texts.index("hello 2")
        assert i1 < i2, "messages should be sorted asc by created_at"
        # ensure _id not leaked
        assert all("_id" not in m for m in msgs)


# ---------- Locations ----------
class TestLocations:
    def test_upsert_and_get_locations(self, group_ctx, user_a):
        gid = group_ctx["group_id"]
        r = requests.post(f"{API}/groups/{gid}/location", json={"lat": 12.9, "lng": 77.5, "speed": 45, "heading": 90}, headers=_h(user_a["token"]))
        assert r.status_code == 200
        # upsert again
        r2 = requests.post(f"{API}/groups/{gid}/location", json={"lat": 13.0, "lng": 77.6, "speed": 50, "heading": 95}, headers=_h(user_a["token"]))
        assert r2.status_code == 200

        r3 = requests.get(f"{API}/groups/{gid}/locations", headers=_h(user_a["token"]))
        assert r3.status_code == 200
        locs = r3.json()
        mine = [l for l in locs if l["user_id"] == user_a["user"]["user_id"]]
        assert len(mine) == 1  # upsert not duplicate
        assert mine[0]["lat"] == 13.0


# ---------- Devices ----------
class TestDevices:
    def test_add_device_marks_connected_and_disconnects_others(self, user_a):
        h = _h(user_a["token"])
        d1 = requests.post(f"{API}/devices", json={"device_name": "Sena 50S", "brand": "Sena", "device_id": "SN-1", "rssi": -60}, headers=h).json()
        d2 = requests.post(f"{API}/devices", json={"device_name": "Cardo Packtalk", "brand": "Cardo", "device_id": "CD-2", "rssi": -55}, headers=h).json()

        assert d2["connected"] is True
        # d1 should now be disconnected
        list_r = requests.get(f"{API}/devices", headers=h).json()
        by_id = {d["id"]: d for d in list_r}
        assert by_id[d1["id"]]["connected"] is False
        assert by_id[d2["id"]]["connected"] is True

    def test_toggle_and_delete_device(self, user_a):
        h = _h(user_a["token"])
        d = requests.post(f"{API}/devices", json={"device_name": "Test D", "brand": "X", "device_id": "T-1"}, headers=h).json()
        # toggle off
        t = requests.post(f"{API}/devices/{d['id']}/toggle", headers=h)
        assert t.status_code == 200
        assert t.json()["connected"] is False
        # toggle back on
        t2 = requests.post(f"{API}/devices/{d['id']}/toggle", headers=h)
        assert t2.json()["connected"] is True
        # delete
        dl = requests.delete(f"{API}/devices/{d['id']}", headers=h)
        assert dl.status_code == 200
        remaining = requests.get(f"{API}/devices", headers=h).json()
        assert not any(x["id"] == d["id"] for x in remaining)


# ---------- Rides ----------
class TestRides:
    def test_create_and_list_rides_reverse_chrono(self, user_a):
        h = _h(user_a["token"])
        r1 = requests.post(f"{API}/rides", json={"name": "Morning ride", "distance_km": 50.5, "duration_min": 90, "top_speed": 120}, headers=h)
        assert r1.status_code == 200
        time.sleep(0.05)
        r2 = requests.post(f"{API}/rides", json={"name": "Evening ride", "distance_km": 30.0, "duration_min": 60}, headers=h)
        assert r2.status_code == 200

        lst = requests.get(f"{API}/rides", headers=h).json()
        assert len(lst) >= 2
        # first should be latest
        names = [r["name"] for r in lst[:2]]
        assert names[0] == "Evening ride"

    def test_no_mongo_id_leak(self, user_a):
        h = _h(user_a["token"])
        for path in ["/rides", "/devices", "/groups", "/auth/me"]:
            r = requests.get(f"{API}{path}", headers=h)
            assert r.status_code == 200
            payload = r.json()
            items = payload if isinstance(payload, list) else [payload]
            for it in items:
                assert "_id" not in it, f"_id leaked in {path}"
