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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_DAYS = 30

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
