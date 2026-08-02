from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import stripe
from urllib.parse import quote
from fastapi import Request
from fastapi.responses import HTMLResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_DAYS = 30

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_RIDER_PRO_PRICE_ID = os.environ.get("STRIPE_RIDER_PRO_PRICE_ID", "")
STRIPE_PUBLIC_API_URL = os.environ.get("STRIPE_PUBLIC_API_URL", "").rstrip("/")
APP_SCHEME = os.environ.get("APP_SCHEME", "motocom")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_utc():
    return datetime.now(timezone.utc)


def new_id(prefix: str = "id"):
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# ============= Models =============
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    bike: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    bike: Optional[str] = None
    picture: Optional[str] = None
    created_at: datetime


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class GroupIn(BaseModel):
    name: str
    description: Optional[str] = ""


class GroupOut(BaseModel):
    group_id: str
    name: str
    description: str
    owner_id: str
    invite_code: str
    member_count: int
    created_at: datetime


class MessageIn(BaseModel):
    text: str


class MessageOut(BaseModel):
    message_id: str
    group_id: str
    user_id: str
    user_name: str
    text: str
    created_at: datetime


class LocationIn(BaseModel):
    lat: float
    lng: float
    speed: Optional[float] = 0
    heading: Optional[float] = 0


class LocationOut(BaseModel):
    user_id: str
    user_name: str
    lat: float
    lng: float
    speed: float
    heading: float
    updated_at: datetime


class DeviceIn(BaseModel):
    device_name: str
    brand: str
    device_id: str
    rssi: Optional[int] = 0


class DeviceOut(BaseModel):
    id: str
    user_id: str
    device_name: str
    brand: str
    device_id: str
    rssi: int
    connected: bool
    created_at: datetime


class RideIn(BaseModel):
    name: str
    distance_km: float
    duration_min: int
    group_id: Optional[str] = None
    top_speed: Optional[float] = 0


class RideOut(BaseModel):
    ride_id: str
    user_id: str
    name: str
    distance_km: float
    duration_min: int
    group_id: Optional[str]
    top_speed: float
    created_at: datetime


class JoinGroupIn(BaseModel):
    invite_code: str


class LocationPoint(BaseModel):
    lat: float
    lng: float
    speed: Optional[float] = 0
    heading: Optional[float] = 0
    timestamp: Optional[float] = None


class TrackBatch(BaseModel):
    ride_id: Optional[str] = None
    group_id: Optional[str] = None
    name: Optional[str] = None
    points: List[LocationPoint] = []


class CheckoutInput(BaseModel):
    return_url: str


class BillingStatus(BaseModel):
    is_pro: bool
    status: Optional[str] = None
    cancel_at_period_end: bool = False
    current_period_end: Optional[int] = None


# ============= Auth Dep =============
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()

    # Try JWT first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.InvalidTokenError:
        pass

    # Try Emergent session token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid token")
    exp = session.get("expires_at")
    if exp:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u.get("name", ""),
        bike=u.get("bike"),
        picture=u.get("picture"),
        created_at=u.get("created_at", now_utc()),
    )


# ============= Auth Routes =============
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(body: RegisterInput):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "user_id": new_id("usr"),
        "email": body.email.lower(),
        "name": body.name,
        "bike": body.bike,
        "password_hash": hash_password(body.password),
        "picture": None,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user)
    return AuthResponse(token=make_jwt(user["user_id"]), user=user_to_out(user))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginInput):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthResponse(token=make_jwt(user["user_id"]), user=user_to_out(user))


@api_router.post("/auth/session")
async def emergent_session(body: SessionInput):
    """Exchange Emergent session_id for our session_token."""
    async with httpx.AsyncClient(timeout=15.0) as httpc:
        r = await httpc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Bad session data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user = {
            "user_id": new_id("usr"),
            "email": email,
            "name": name,
            "bike": None,
            "picture": picture,
            "password_hash": None,
            "created_at": now_utc(),
        }
        await db.users.insert_one(user)

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })

    return {"session_token": session_token, "user": user_to_out(user).model_dump(mode="json")}


@api_router.get("/auth/me", response_model=UserOut)
async def get_me(user=Depends(get_current_user)):
    return user_to_out(user)


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None), user=Depends(get_current_user)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ============= Groups =============
def _invite_code():
    return uuid.uuid4().hex[:6].upper()


async def _group_to_out(g: dict) -> GroupOut:
    count = await db.group_members.count_documents({"group_id": g["group_id"]})
    return GroupOut(
        group_id=g["group_id"],
        name=g["name"],
        description=g.get("description", ""),
        owner_id=g["owner_id"],
        invite_code=g["invite_code"],
        member_count=count,
        created_at=g["created_at"],
    )


@api_router.post("/groups", response_model=GroupOut)
async def create_group(body: GroupIn, user=Depends(get_current_user)):
    g = {
        "group_id": new_id("grp"),
        "name": body.name,
        "description": body.description or "",
        "owner_id": user["user_id"],
        "invite_code": _invite_code(),
        "created_at": now_utc(),
    }
    await db.groups.insert_one(g)
    await db.group_members.insert_one({
        "group_id": g["group_id"],
        "user_id": user["user_id"],
        "joined_at": now_utc(),
    })
    return await _group_to_out(g)


@api_router.get("/groups", response_model=List[GroupOut])
async def my_groups(user=Depends(get_current_user)):
    memberships = await db.group_members.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    ids = [m["group_id"] for m in memberships]
    if not ids:
        return []
    groups = await db.groups.find({"group_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    return [await _group_to_out(g) for g in groups]


@api_router.get("/groups/{group_id}", response_model=GroupOut)
async def get_group(group_id: str, user=Depends(get_current_user)):
    g = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return await _group_to_out(g)


@api_router.get("/groups/{group_id}/members")
async def group_members(group_id: str, user=Depends(get_current_user)):
    mems = await db.group_members.find({"group_id": group_id}, {"_id": 0}).to_list(500)
    ids = [m["user_id"] for m in mems]
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(500)
    return [
        {
            "user_id": u["user_id"],
            "name": u.get("name", ""),
            "email": u.get("email"),
            "picture": u.get("picture"),
            "bike": u.get("bike"),
        }
        for u in users
    ]


@api_router.post("/groups/join", response_model=GroupOut)
async def join_group(body: JoinGroupIn, user=Depends(get_current_user)):
    g = await db.groups.find_one({"invite_code": body.invite_code.upper()}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    existing = await db.group_members.find_one({"group_id": g["group_id"], "user_id": user["user_id"]})
    if not existing:
        await db.group_members.insert_one({
            "group_id": g["group_id"],
            "user_id": user["user_id"],
            "joined_at": now_utc(),
        })
    return await _group_to_out(g)


@api_router.delete("/groups/{group_id}/leave")
async def leave_group(group_id: str, user=Depends(get_current_user)):
    await db.group_members.delete_one({"group_id": group_id, "user_id": user["user_id"]})
    return {"ok": True}


# ============= Messages =============
@api_router.post("/groups/{group_id}/messages", response_model=MessageOut)
async def send_message(group_id: str, body: MessageIn, user=Depends(get_current_user)):
    m = {
        "message_id": new_id("msg"),
        "group_id": group_id,
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "text": body.text,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(m)
    m.pop("_id", None)
    return MessageOut(**m)


@api_router.get("/groups/{group_id}/messages", response_model=List[MessageOut])
async def list_messages(group_id: str, user=Depends(get_current_user)):
    rows = await db.messages.find({"group_id": group_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return [MessageOut(**r) for r in rows]


# ============= Locations =============
@api_router.post("/groups/{group_id}/location")
async def update_location(group_id: str, body: LocationIn, user=Depends(get_current_user)):
    await db.locations.update_one(
        {"group_id": group_id, "user_id": user["user_id"]},
        {"$set": {
            "group_id": group_id,
            "user_id": user["user_id"],
            "user_name": user.get("name", ""),
            "lat": body.lat,
            "lng": body.lng,
            "speed": body.speed or 0,
            "heading": body.heading or 0,
            "updated_at": now_utc(),
        }},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/groups/{group_id}/locations", response_model=List[LocationOut])
async def get_locations(group_id: str, user=Depends(get_current_user)):
    rows = await db.locations.find({"group_id": group_id}, {"_id": 0}).to_list(200)
    return [LocationOut(**r) for r in rows]


# ============= Devices =============
@api_router.get("/devices", response_model=List[DeviceOut])
async def my_devices(user=Depends(get_current_user)):
    rows = await db.devices.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [DeviceOut(**r) for r in rows]


@api_router.post("/devices", response_model=DeviceOut)
async def add_device(body: DeviceIn, user=Depends(get_current_user)):
    # disconnect others
    await db.devices.update_many({"user_id": user["user_id"]}, {"$set": {"connected": False}})
    d = {
        "id": new_id("dev"),
        "user_id": user["user_id"],
        "device_name": body.device_name,
        "brand": body.brand,
        "device_id": body.device_id,
        "rssi": body.rssi or 0,
        "connected": True,
        "created_at": now_utc(),
    }
    await db.devices.insert_one(d)
    d.pop("_id", None)
    return DeviceOut(**d)


@api_router.post("/devices/{device_id}/toggle", response_model=DeviceOut)
async def toggle_device(device_id: str, user=Depends(get_current_user)):
    dev = await db.devices.find_one({"id": device_id, "user_id": user["user_id"]}, {"_id": 0})
    if not dev:
        raise HTTPException(404, "Device not found")
    new_state = not dev.get("connected", False)
    if new_state:
        await db.devices.update_many({"user_id": user["user_id"]}, {"$set": {"connected": False}})
    await db.devices.update_one({"id": device_id}, {"$set": {"connected": new_state}})
    dev["connected"] = new_state
    return DeviceOut(**dev)


@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user=Depends(get_current_user)):
    await db.devices.delete_one({"id": device_id, "user_id": user["user_id"]})
    return {"ok": True}


# ============= Rides =============
@api_router.post("/rides", response_model=RideOut)
async def create_ride(body: RideIn, user=Depends(get_current_user)):
    r = {
        "ride_id": new_id("rid"),
        "user_id": user["user_id"],
        "name": body.name,
        "distance_km": body.distance_km,
        "duration_min": body.duration_min,
        "group_id": body.group_id,
        "top_speed": body.top_speed or 0,
        "created_at": now_utc(),
    }
    await db.rides.insert_one(r)
    r.pop("_id", None)
    return RideOut(**r)


@api_router.get("/rides", response_model=List[RideOut])
async def my_rides(user=Depends(get_current_user)):
    rows = await db.rides.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [RideOut(**r) for r in rows]


@api_router.post("/rides/track")
async def track_ride(body: TrackBatch, user=Depends(get_current_user)):
    """Upload a batch of GPS points from background tracking. Optionally attach to a ride."""
    ride_id = body.ride_id
    if not ride_id:
        # Auto-create a ride from the first point
        ride = {
            "ride_id": new_id("rid"),
            "user_id": user["user_id"],
            "name": body.name or f"Ride {now_utc().strftime('%b %d, %H:%M')}",
            "distance_km": 0.0,
            "duration_min": 0,
            "group_id": body.group_id,
            "top_speed": 0.0,
            "created_at": now_utc(),
        }
        await db.rides.insert_one(ride)
        ride_id = ride["ride_id"]

    if body.points:
        docs = [{
            "ride_id": ride_id,
            "user_id": user["user_id"],
            "lat": p.lat,
            "lng": p.lng,
            "speed": p.speed or 0,
            "heading": p.heading or 0,
            "ts": p.timestamp or now_utc().timestamp(),
        } for p in body.points]
        await db.ride_points.insert_many(docs)

    # Recompute simple stats
    points = await db.ride_points.find({"ride_id": ride_id}, {"_id": 0}).sort("ts", 1).to_list(10000)
    total_km = 0.0
    top_speed = 0.0
    for i in range(1, len(points)):
        a, b = points[i - 1], points[i]
        total_km += _haversine_km(a["lat"], a["lng"], b["lat"], b["lng"])
        top_speed = max(top_speed, b.get("speed", 0))
    if points:
        dur = max(1, int((points[-1]["ts"] - points[0]["ts"]) / 60))
        await db.rides.update_one(
            {"ride_id": ride_id},
            {"$set": {"distance_km": round(total_km, 2), "duration_min": dur, "top_speed": round(top_speed, 1)}},
        )
    return {"ride_id": ride_id, "points": len(points), "distance_km": round(total_km, 2)}


@api_router.get("/rides/{ride_id}/points")
async def get_ride_points(ride_id: str, user=Depends(get_current_user)):
    rows = await db.ride_points.find({"ride_id": ride_id, "user_id": user["user_id"]}, {"_id": 0}).sort("ts", 1).to_list(10000)
    return rows


# ============= Billing (Stripe) =============
def _allowed_return_url(value: str) -> str:
    if not value:
        raise HTTPException(400, "Missing return_url")
    if value.startswith(f"{APP_SCHEME}://") or value.startswith("http://localhost") or value.endswith("/stripe-return") or "preview.emergentagent.com" in value:
        return value
    raise HTTPException(400, "Invalid return URL")


@api_router.get("/billing/status", response_model=BillingStatus)
async def billing_status(user=Depends(get_current_user)):
    rec = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not rec:
        return BillingStatus(is_pro=False)
    return BillingStatus(
        is_pro=bool(rec.get("is_pro")),
        status=rec.get("status"),
        cancel_at_period_end=bool(rec.get("cancel_at_period_end")),
        current_period_end=rec.get("current_period_end"),
    )


@api_router.post("/billing/checkout-session")
async def create_checkout_session(body: CheckoutInput, request: Request, user=Depends(get_current_user)):
    placeholder_key = STRIPE_SECRET_KEY in (None, "", "sk_test_emergent")
    placeholder_price = STRIPE_RIDER_PRO_PRICE_ID in (None, "", "price_placeholder")
    if placeholder_key or placeholder_price:
        raise HTTPException(503, "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_RIDER_PRO_PRICE_ID.")

    existing = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if existing and existing.get("is_pro"):
        raise HTTPException(409, "Already subscribed")

    return_url = _allowed_return_url(body.return_url)
    base = STRIPE_PUBLIC_API_URL or str(request.base_url).rstrip("/")
    success = f"{base}/api/billing/success?session_id={{CHECKOUT_SESSION_ID}}&return_url={quote(return_url, safe='')}"
    cancel = f"{base}/api/billing/cancel-page?return_url={quote(return_url, safe='')}"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_RIDER_PRO_PRICE_ID, "quantity": 1}],
            success_url=success,
            cancel_url=cancel,
            customer_email=user.get("email"),
            payment_method_collection="always",
            subscription_data={
                "trial_period_days": 7,
                "trial_settings": {"end_behavior": {"missing_payment_method": "cancel"}},
                "metadata": {"user_id": user["user_id"], "plan": "rider_pro"},
            },
            metadata={"user_id": user["user_id"], "plan": "rider_pro"},
        )
    except stripe.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(503, f"Stripe error: {msg}")
    return {"url": session.url}


@api_router.post("/billing/cancel")
async def cancel_subscription(user=Depends(get_current_user)):
    rec = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not rec or not rec.get("stripe_subscription_id"):
        raise HTTPException(404, "No subscription")
    try:
        sub = stripe.Subscription.modify(rec["stripe_subscription_id"], cancel_at_period_end=True)
    except stripe.StripeError as e:
        raise HTTPException(503, f"Stripe error: {getattr(e, 'user_message', None) or str(e)}")
    await db.subscriptions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"cancel_at_period_end": True}},
    )
    return {"cancel_at_period_end": sub.cancel_at_period_end, "current_period_end": sub.current_period_end}


@api_router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Invalid Stripe webhook signature")

    event_id = event["id"]
    try:
        await db.stripe_events.insert_one({"event_id": event_id, "type": event["type"], "created_at": now_utc()})
    except Exception:
        return {"received": True, "duplicate": True}

    obj = event["data"]["object"]
    et = event["type"]

    if et == "checkout.session.completed":
        user_id = (obj.get("metadata") or {}).get("user_id")
        subscription_id = obj.get("subscription")
        if user_id and subscription_id:
            await db.subscriptions.update_one(
                {"user_id": user_id},
                {"$set": {
                    "user_id": user_id,
                    "stripe_customer_id": obj.get("customer"),
                    "stripe_subscription_id": subscription_id,
                }},
                upsert=True,
            )
    elif et.startswith("customer.subscription."):
        subscription_id = obj["id"]
        user_id = (obj.get("metadata") or {}).get("user_id")
        if not user_id:
            prior = await db.subscriptions.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0})
            user_id = prior and prior.get("user_id")
        status = obj.get("status")
        is_pro = status in ("trialing", "active")
        if user_id:
            await db.subscriptions.update_one(
                {"user_id": user_id},
                {"$set": {
                    "stripe_subscription_id": subscription_id,
                    "status": status,
                    "is_pro": is_pro,
                    "cancel_at_period_end": obj.get("cancel_at_period_end", False),
                    "current_period_end": obj.get("current_period_end"),
                    "updated_at": now_utc(),
                }},
                upsert=True,
            )
            await db.users.update_one({"user_id": user_id}, {"$set": {"is_pro": is_pro}})

    return {"received": True}


@app.get("/api/billing/success", response_class=HTMLResponse)
async def billing_success(session_id: str, return_url: str):
    return_url = _allowed_return_url(return_url)
    target = f"{return_url}?session_id={quote(session_id, safe='')}&status=success"
    return HTMLResponse(
        f"<!doctype html><html><body style='background:#111;color:#fff;font-family:system-ui;text-align:center;padding:40px'>"
        f"<h2>Rider Pro activated</h2><p>Returning to the app…</p>"
        f"<script>location.replace({target!r})</script>"
        f"<p><a href='{target}' style='color:#FF5E00'>Continue</a></p></body></html>"
    )


@app.get("/api/billing/cancel-page", response_class=HTMLResponse)
async def billing_cancel_page(return_url: str):
    return_url = _allowed_return_url(return_url)
    target = f"{return_url}?status=cancel"
    return HTMLResponse(
        f"<!doctype html><html><body style='background:#111;color:#fff;font-family:system-ui;text-align:center;padding:40px'>"
        f"<h2>Checkout canceled</h2>"
        f"<script>location.replace({target!r})</script>"
        f"<p><a href='{target}' style='color:#FF5E00'>Return</a></p></body></html>"
    )


def _haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@api_router.get("/")
async def root():
    return {"message": "MotoCom API"}


# ============= App setup =============
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.groups.create_index("group_id", unique=True)
    await db.groups.create_index("invite_code")
    await db.group_members.create_index([("group_id", 1), ("user_id", 1)])
    await db.messages.create_index([("group_id", 1), ("created_at", 1)])
    await db.locations.create_index([("group_id", 1), ("user_id", 1)])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
