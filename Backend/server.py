from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Cookie, Response, Header, UploadFile, File
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
import base64
import json
import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_status: Dict[str, str] = {}  # user_id: online/offline

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_status[user_id] = "online"
        await self.broadcast_status_update(user_id, "online")

    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        self.user_status[user_id] = "offline"
        await self.broadcast_status_update(user_id, "offline")

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except:
                pass

    async def broadcast_to_channel(self, message: dict, channel_id: str):
        for user_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except:
                pass

    async def broadcast_status_update(self, user_id: str, status: str):
        message = {"type": "status_update", "user_id": user_id, "status": status}
        for websocket in self.active_connections.values():
            try:
                await websocket.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    username: str
    user_number: str  # 8-digit unique number
    password_hash: Optional[str] = None
    avatar: Optional[str] = None
    status: str = "offline"  # online/offline/away/dnd
    is_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    google_id: Optional[str] = None

class UserRegister(BaseModel):
    email: str
    username: str
    user_number: str  # Must be 8 digits
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Server(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    owner_id: str
    icon: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Channel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    server_id: str
    name: str
    type: str  # text or voice
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_id: Optional[str] = None
    dm_id: Optional[str] = None
    user_id: str
    content: str
    attachments: Optional[List[str]] = []
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DirectMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    participants: List[str]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServerMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    server_id: str
    user_id: str
    role: str = "member"  # owner, admin, member
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    action: str  # login, logout, message_sent, voice_call, etc
    details: Dict[str, Any]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_jwt_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"user_id": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    token = None
    
    # Check session_token from cookie first
    if session_token:
        session = await db.user_sessions.find_one({"session_token": session_token})
        if session and session["expires_at"] > datetime.now(timezone.utc):
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
            if user:
                return User(**user)
    
    # Fallback to Authorization header
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("user_id")
            if user_id:
                user = await db.users.find_one({"id": user_id}, {"_id": 0})
                if user:
                    return User(**user)
        except jwt.InvalidTokenError:
            pass
    
    raise HTTPException(status_code=401, detail="Not authenticated")

async def get_admin_user(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def log_activity(user_id: str, action: str, details: Dict[str, Any]):
    activity = ActivityLog(user_id=user_id, action=action, details=details)
    doc = activity.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.activity_logs.insert_one(doc)

# Auth endpoints
@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Validate user_number is 8 digits
    if not user_data.user_number.isdigit() or len(user_data.user_number) != 8:
        raise HTTPException(status_code=400, detail="User number must be exactly 8 digits")
    
    # Check if email exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if user_number is unique
    existing_number = await db.users.find_one({"user_number": user_data.user_number})
    if existing_number:
        raise HTTPException(status_code=400, detail="User number already taken")
    
    # Create user
    user = User(
        email=user_data.email,
        username=user_data.username,
        user_number=user_data.user_number,
        password_hash=hash_password(user_data.password)
    )
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    # Create JWT token
    token = create_jwt_token(user.id)
    
    await log_activity(user.id, "register", {"email": user.email, "username": user.username})
    
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "user_number": user.user_number, "is_admin": user.is_admin}}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc or not verify_password(credentials.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = User(**user_doc)
    token = create_jwt_token(user.id)
    
    await log_activity(user.id, "login", {"email": user.email})
    
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "user_number": user.user_number, "is_admin": user.is_admin, "avatar": user.avatar}}

@api_router.get("/auth/google")
async def google_auth(redirect_url: str):
    auth_url = f"https://auth.emergentagent.com/?redirect={redirect_url}"
    return {"auth_url": auth_url}

@api_router.post("/auth/session")
async def create_session(session_id: str = Header(None, alias="X-Session-ID")):
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required")
    
    # Get session data from Emergent Auth
    response = requests.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}
    )
    
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    data = response.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    google_id = data.get("id")
    
    # Check if user exists
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user_doc:
        # Create new user with Google auth (no user_number needed for Google users)
        user = User(
            email=email,
            username=name,
            user_number="00000000",  # Default for Google users
            avatar=picture,
            google_id=google_id
        )
        doc = user.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.users.insert_one(doc)
        user_id = user.id
    else:
        user_id = user_doc["id"]
    
    # Store session
    session = UserSession(
        user_id=user_id,
        session_token=session_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)
    
    await log_activity(user_id, "google_login", {"email": email})
    
    return {"session_token": session_token, "user_id": user_id}

@api_router.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    return {"id": user.id, "email": user.email, "username": user.username, "user_number": user.user_number, "avatar": user.avatar, "status": user.status, "is_admin": user.is_admin}

@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token")
    return {"message": "Logged out"}

# Server endpoints
@api_router.post("/servers")
async def create_server(name: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    server = Server(name=name, owner_id=user.id)
    doc = server.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.servers.insert_one(doc)
    
    # Add creator as member
    member = ServerMember(server_id=server.id, user_id=user.id, role="owner")
    member_doc = member.model_dump()
    member_doc['joined_at'] = member_doc['joined_at'].isoformat()
    await db.server_members.insert_one(member_doc)
    
    # Create default channels
    text_channel = Channel(server_id=server.id, name="general", type="text")
    voice_channel = Channel(server_id=server.id, name="General Voice", type="voice")
    
    text_doc = text_channel.model_dump()
    text_doc['created_at'] = text_doc['created_at'].isoformat()
    await db.channels.insert_one(text_doc)
    
    voice_doc = voice_channel.model_dump()
    voice_doc['created_at'] = voice_doc['created_at'].isoformat()
    await db.channels.insert_one(voice_doc)
    
    await log_activity(user.id, "create_server", {"server_id": server.id, "server_name": name})
    
    return server.model_dump()

@api_router.get("/servers")
async def get_servers(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    # Get servers where user is a member
    memberships = await db.server_members.find({"user_id": user.id}, {"_id": 0}).to_list(1000)
    server_ids = [m["server_id"] for m in memberships]
    
    servers = await db.servers.find({"id": {"$in": server_ids}}, {"_id": 0}).to_list(1000)
    return servers

@api_router.get("/servers/{server_id}/channels")
async def get_channels(server_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    channels = await db.channels.find({"server_id": server_id}, {"_id": 0}).to_list(1000)
    return channels

@api_router.post("/servers/{server_id}/channels")
async def create_channel(server_id: str, name: str, channel_type: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    channel = Channel(server_id=server_id, name=name, type=channel_type)
    doc = channel.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.channels.insert_one(doc)
    
    await log_activity(user.id, "create_channel", {"server_id": server_id, "channel_id": channel.id, "channel_name": name})
    
    return channel.model_dump()

# Message endpoints
@api_router.get("/channels/{channel_id}/messages")
async def get_messages(channel_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    messages = await db.messages.find({"channel_id": channel_id}, {"_id": 0}).sort("timestamp", 1).to_list(1000)
    
    # Populate user info
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"_id": 0, "username": 1, "avatar": 1, "user_number": 1})
        if user:
            msg["user"] = user
    
    return messages

@api_router.post("/channels/{channel_id}/messages")
async def send_message(channel_id: str, content: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    message = Message(channel_id=channel_id, user_id=user.id, content=content)
    doc = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.messages.insert_one(doc)
    
    # Broadcast to WebSocket
    msg_data = message.model_dump()
    msg_data["user"] = {"username": user.username, "avatar": user.avatar, "user_number": user.user_number}
    await manager.broadcast_to_channel({"type": "message", "data": msg_data}, channel_id)
    
    await log_activity(user.id, "send_message", {"channel_id": channel_id, "message_id": message.id})
    
    return message.model_dump()

# Direct messages
@api_router.get("/dms")
async def get_dms(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    dms = await db.direct_messages.find({"participants": user.id}, {"_id": 0}).to_list(1000)
    
    # Populate other user info
    for dm in dms:
        other_user_id = [p for p in dm["participants"] if p != user.id][0]
        other_user = await db.users.find_one({"id": other_user_id}, {"_id": 0, "username": 1, "avatar": 1, "status": 1})
        if other_user:
            dm["other_user"] = other_user
    
    return dms

@api_router.post("/dms")
async def create_dm(other_user_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    
    # Check if DM already exists
    existing = await db.direct_messages.find_one({
        "participants": {"$all": [user.id, other_user_id]}
    }, {"_id": 0})
    
    if existing:
        return existing
    
    dm = DirectMessage(participants=[user.id, other_user_id])
    doc = dm.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.direct_messages.insert_one(doc)
    
    return dm.model_dump()

@api_router.get("/dms/{dm_id}/messages")
async def get_dm_messages(dm_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    messages = await db.messages.find({"dm_id": dm_id}, {"_id": 0}).sort("timestamp", 1).to_list(1000)
    
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"_id": 0, "username": 1, "avatar": 1})
        if user:
            msg["user"] = user
    
    return messages

@api_router.post("/dms/{dm_id}/messages")
async def send_dm_message(dm_id: str, content: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    message = Message(dm_id=dm_id, user_id=user.id, content=content)
    doc = message.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.messages.insert_one(doc)
    
    # Send to recipient via WebSocket
    dm = await db.direct_messages.find_one({"id": dm_id}, {"_id": 0})
    if dm:
        recipient_id = [p for p in dm["participants"] if p != user.id][0]
        msg_data = message.model_dump()
        msg_data["user"] = {"username": user.username, "avatar": user.avatar}
        await manager.send_personal_message({"type": "dm", "data": msg_data}, recipient_id)
    
    await log_activity(user.id, "send_dm", {"dm_id": dm_id, "message_id": message.id})
    
    return message.model_dump()

# User search
@api_router.get("/users/search")
async def search_users(query: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    users = await db.users.find(
        {"$or": [
            {"username": {"$regex": query, "$options": "i"}},
            {"user_number": {"$regex": query}}
        ]},
        {"_id": 0, "id": 1, "username": 1, "avatar": 1, "user_number": 1, "status": 1}
    ).to_list(20)
    return users

# Admin endpoints
@api_router.get("/admin/users")
async def admin_get_users(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_admin_user(authorization, session_token)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(10000)
    return users

@api_router.get("/admin/messages")
async def admin_get_all_messages(limit: int = 100, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_admin_user(authorization, session_token)
    messages = await db.messages.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Populate user info
    for msg in messages:
        user = await db.users.find_one({"id": msg["user_id"]}, {"_id": 0, "username": 1, "email": 1, "user_number": 1})
        if user:
            msg["user"] = user
        
        # Get channel or DM info
        if msg.get("channel_id"):
            channel = await db.channels.find_one({"id": msg["channel_id"]}, {"_id": 0, "name": 1, "server_id": 1})
            if channel:
                server = await db.servers.find_one({"id": channel["server_id"]}, {"_id": 0, "name": 1})
                msg["location"] = f"{server['name']} > #{channel['name']}"
    
    return messages

@api_router.get("/admin/activity")
async def admin_get_activity(limit: int = 100, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_admin_user(authorization, session_token)
    activities = await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Populate user info
    for activity in activities:
        user = await db.users.find_one({"id": activity["user_id"]}, {"_id": 0, "username": 1, "email": 1, "user_number": 1})
        if user:
            activity["user"] = user
    
    return activities

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    admin = await get_admin_user(authorization, session_token)
    await db.users.delete_one({"id": user_id})
    await log_activity(admin.id, "admin_delete_user", {"deleted_user_id": user_id})
    return {"message": "User deleted"}

@api_router.delete("/admin/messages/{message_id}")
async def admin_delete_message(message_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    admin = await get_admin_user(authorization, session_token)
    await db.messages.delete_one({"id": message_id})
    await log_activity(admin.id, "admin_delete_message", {"message_id": message_id})
    return {"message": "Message deleted"}

@api_router.delete("/admin/servers/{server_id}")
async def admin_delete_server(server_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    admin = await get_admin_user(authorization, session_token)
    await db.servers.delete_one({"id": server_id})
    await db.channels.delete_many({"server_id": server_id})
    await db.server_members.delete_many({"server_id": server_id})
    await log_activity(admin.id, "admin_delete_server", {"server_id": server_id})
    return {"message": "Server deleted"}

@api_router.get("/admin/stats")
async def admin_get_stats(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_admin_user(authorization, session_token)
    
    total_users = await db.users.count_documents({})
    total_servers = await db.servers.count_documents({})
    total_messages = await db.messages.count_documents({})
    online_users = len([u for u in manager.user_status.values() if u == "online"])
    
    return {
        "total_users": total_users,
        "total_servers": total_servers,
        "total_messages": total_messages,
        "online_users": online_users
    }

# WebSocket endpoint
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            
            # Handle WebRTC signaling
            if data.get("type") in ["offer", "answer", "ice-candidate"]:
                target_user_id = data.get("target_user_id")
                if target_user_id:
                    await manager.send_personal_message(data, target_user_id)
            
            # Handle typing indicator
            elif data.get("type") == "typing":
                channel_id = data.get("channel_id")
                await manager.broadcast_to_channel({"type": "typing", "user_id": user_id, "channel_id": channel_id}, channel_id)
    
    except WebSocketDisconnect:
        await manager.disconnect(user_id)

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()