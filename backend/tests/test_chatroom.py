"""
CS Chatroom - end-to-end backend tests
- REST endpoints (health, rooms, messages)
- Socket.IO flows via python-socketio async client
- Public room join / message:send / presence / bump / mark read / load older
- Random stranger matchmaking / message ephemerality / skip / report / disconnect
"""
import os
import time
import uuid
import asyncio
import pytest
import requests
import socketio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"

SOCKET_PATH = "/api/socket.io/"


# ---------------- REST TESTS ----------------
class TestRestEndpoints:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("service") == "cs-chatroom"

    def test_rooms(self):
        r = requests.get(f"{BASE_URL}/api/rooms", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("general") == "general"
        sections = data.get("sections", [])
        assert isinstance(sections, list) and len(sections) == 18
        ids = [s["id"] for s in sections]
        expected_ids = [f"section-{c}" for c in "abcdefghijklmnopqr"]
        assert ids == expected_ids

    def test_messages_general(self):
        r = requests.get(f"{BASE_URL}/api/messages/general", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("room") == "general"
        assert isinstance(data.get("messages"), list)

    def test_messages_unknown_room_404(self):
        r = requests.get(f"{BASE_URL}/api/messages/bogus-room", timeout=10)
        assert r.status_code == 404

    def test_messages_stranger_room_404(self):
        r = requests.get(f"{BASE_URL}/api/messages/stranger-abc-123", timeout=10)
        assert r.status_code == 404


# ---------------- SOCKET HELPERS ----------------
async def _new_client(nickname=None, device_id=None, wait=True):
    sio = socketio.AsyncClient(reconnection=False, logger=False, engineio_logger=False)
    device_id = device_id or f"TEST-{uuid.uuid4()}"
    nickname = nickname or f"tester-{device_id[:6]}"
    await sio.connect(
        BASE_URL,
        socketio_path=SOCKET_PATH,
        transports=["websocket"],
        auth={"deviceId": device_id, "nickname": nickname},
        wait=wait,
        wait_timeout=10,
    )
    sio._test_device_id = device_id
    sio._test_nickname = nickname
    return sio


async def _call(sio, event, payload):
    """Emit with ack, return response."""
    fut = asyncio.get_event_loop().create_future()

    def _cb(*args):
        if not fut.done():
            fut.set_result(args[0] if args else None)

    await sio.emit(event, payload, callback=_cb)
    return await asyncio.wait_for(fut, timeout=8)


# ---------------- SOCKET TESTS ----------------
@pytest.mark.asyncio
class TestSocketIO:
    async def test_connect_and_snapshots(self):
        c = await _new_client()
        try:
            assert c.connected
            pres = await _call(c, "presence:snapshot", {})
            assert pres and pres.get("ok") is True
            assert "general" in pres["online"]
            unread = await _call(c, "unread:snapshot", {})
            assert unread and unread.get("ok") is True
            assert isinstance(unread["unread"], dict)
            assert "general" in unread["unread"]
        finally:
            await c.disconnect()

    async def test_join_general_and_receive_messages(self):
        c = await _new_client()
        try:
            res = await _call(c, "room:join", {"room": "general"})
            assert res and res.get("ok") is True
            assert res["room"] == "general"
            assert isinstance(res["messages"], list)
            assert res["online"] >= 1
        finally:
            await c.disconnect()

    async def test_join_unknown_room(self):
        c = await _new_client()
        try:
            res = await _call(c, "room:join", {"room": "nope"})
            assert res.get("ok") is False
            assert "error" in res
        finally:
            await c.disconnect()

    async def test_message_send_persists_and_broadcasts(self):
        a = await _new_client(nickname="alice-test")
        b = await _new_client(nickname="bob-test")
        received = []
        b.on("message:new", lambda m: received.append(m))
        try:
            await _call(a, "room:join", {"room": "general"})
            await _call(b, "room:join", {"room": "general"})
            content = f"hello TEST_{uuid.uuid4()}"
            res = await _call(a, "message:send", {"room": "general", "content": content})
            assert res.get("ok") is True
            assert res["message"]["content"] == content
            # b should receive
            for _ in range(20):
                if any(m.get("content") == content for m in received):
                    break
                await asyncio.sleep(0.1)
            assert any(m.get("content") == content for m in received), "recipient did not receive"

            # verify persistence via REST
            r = requests.get(f"{BASE_URL}/api/messages/general", timeout=10)
            assert r.status_code == 200
            contents = [m["content"] for m in r.json().get("messages", [])]
            assert content in contents
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_presence_updates_on_second_join(self):
        a = await _new_client()
        b = await _new_client()
        presence_updates = []
        a.on("presence:update", lambda p: presence_updates.append(p))
        try:
            room = "section-a"
            await _call(a, "room:join", {"room": room})
            await _call(b, "room:join", {"room": room})
            # Wait for presence broadcast
            for _ in range(20):
                if any(p.get("room") == room and p.get("online") >= 2 for p in presence_updates):
                    break
                await asyncio.sleep(0.1)
            snap = await _call(a, "presence:snapshot", {})
            assert snap["online"][room] >= 2
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_unread_bump_and_markread(self):
        # a will be in general; b will post in section-b, a should get message:bump
        # Per spec: server-side unread is 0 for first-time devices; the live badge is
        # driven by the socket message:bump event. So we verify the bump AND the
        # server-side count after a has marked section-b read once.
        device_a = f"TEST-{uuid.uuid4()}"
        a = await _new_client(device_id=device_a)
        b = await _new_client()
        bumps = []
        a.on("message:bump", lambda p: bumps.append(p))
        try:
            # Establish last_seen for section-b so server-side unread starts tracking
            await _call(a, "room:join", {"room": "section-b"})
            await _call(a, "room:markRead", {"room": "section-b"})
            await _call(a, "room:join", {"room": "general"})  # move away
            await _call(b, "room:join", {"room": "section-b"})
            content = f"bump TEST_{uuid.uuid4()}"
            await _call(b, "message:send", {"room": "section-b", "content": content})
            for _ in range(20):
                if any(p.get("room") == "section-b" for p in bumps):
                    break
                await asyncio.sleep(0.1)
            assert any(p.get("room") == "section-b" for p in bumps), "did not receive message:bump"
            # Now unread snapshot should show >=1 for section-b for device_a
            snap = await _call(a, "unread:snapshot", {})
            assert snap["unread"].get("section-b", 0) >= 1, (
                f"expected >=1 unread for section-b, got {snap['unread']}"
            )
            # Mark read clears it
            mr = await _call(a, "room:markRead", {"room": "section-b"})
            assert mr.get("ok") is True
            snap2 = await _call(a, "unread:snapshot", {})
            assert snap2["unread"].get("section-b", 0) == 0
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_first_time_visit_unread_zero(self):
        # A fresh device should get 0 unread for all rooms, even if messages exist
        fresh_device = f"TEST-FRESH-{uuid.uuid4()}"
        c = await _new_client(device_id=fresh_device)
        try:
            snap = await _call(c, "unread:snapshot", {})
            assert snap.get("ok") is True
            # All values should be 0 for a first-time device
            for room, count in snap["unread"].items():
                assert count == 0, f"expected 0 for {room}, got {count}"
        finally:
            await c.disconnect()

    async def test_load_older_messages(self):
        # Insert >50 messages, then load older
        a = await _new_client(nickname="loader-test")
        try:
            room = "section-c"
            await _call(a, "room:join", {"room": room})
            # Send 55 messages
            for i in range(55):
                await _call(a, "message:send", {"room": room, "content": f"TEST_load_{i}_{uuid.uuid4()}"})
            # Re-join to get last 50
            res = await _call(a, "room:join", {"room": room})
            msgs = res["messages"]
            assert len(msgs) == 50
            first = msgs[0]
            older = await _call(
                a,
                "messages:loadOlder",
                {"room": room, "beforeCreatedAt": first["created_at"], "beforeId": first["id"]},
            )
            assert older.get("ok") is True
            assert isinstance(older["messages"], list)
            assert len(older["messages"]) >= 1
        finally:
            await a.disconnect()


@pytest.mark.asyncio
class TestStranger:
    async def test_match_two_clients(self):
        a = await _new_client(nickname="stranger-a")
        b = await _new_client(nickname="stranger-b")
        matched_a = []
        matched_b = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        b.on("stranger:matched", lambda p: matched_b.append(p))
        try:
            await _call(a, "stranger:find", {"nickname": "stranger-a"})
            await _call(b, "stranger:find", {"nickname": "stranger-b"})
            for _ in range(30):
                if matched_a and matched_b:
                    break
                await asyncio.sleep(0.1)
            assert matched_a and matched_b, "did not match within timeout"
            assert matched_a[0]["room"] == matched_b[0]["room"]
            assert matched_a[0]["room"].startswith("stranger-")
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_stranger_message_not_persisted(self):
        a = await _new_client(nickname="s-a")
        b = await _new_client(nickname="s-b")
        matched_a = []
        matched_b = []
        received_b = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        b.on("stranger:matched", lambda p: matched_b.append(p))
        b.on("message:new", lambda m: received_b.append(m))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched_a and matched_b:
                    break
                await asyncio.sleep(0.1)
            assert matched_a and matched_b
            room = matched_a[0]["room"]

            content = f"secret TEST_{uuid.uuid4()}"
            res = await _call(a, "message:send", {"room": room, "content": content})
            assert res.get("ok") is True

            for _ in range(20):
                if any(m.get("content") == content for m in received_b):
                    break
                await asyncio.sleep(0.1)
            assert any(m.get("content") == content for m in received_b)

            # Should NOT be retrievable via REST (stranger rooms are not public)
            r = requests.get(f"{BASE_URL}/api/messages/{room}", timeout=10)
            assert r.status_code == 404
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_stranger_skip(self):
        a = await _new_client(nickname="skip-a")
        b = await _new_client(nickname="skip-b")
        matched_a = []
        matched_b = []
        left_b = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        b.on("stranger:matched", lambda p: matched_b.append(p))
        b.on("stranger:left", lambda p: left_b.append(p))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched_a and matched_b:
                    break
                await asyncio.sleep(0.1)
            assert matched_a and matched_b
            await _call(a, "stranger:skip", {})
            for _ in range(20):
                if left_b:
                    break
                await asyncio.sleep(0.1)
            assert left_b, "B did not receive stranger:left"
            assert left_b[0].get("reason") == "skipped"
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_stranger_report(self):
        a = await _new_client(nickname="rep-a")
        b = await _new_client(nickname="rep-b")
        matched_a = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched_a:
                    break
                await asyncio.sleep(0.1)
            assert matched_a
            res = await _call(a, "stranger:report", {"room": matched_a[0]["room"]})
            assert res.get("ok") is True
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_stranger_disconnect(self):
        a = await _new_client(nickname="disc-a")
        b = await _new_client(nickname="disc-b")
        matched_a = []
        left_b = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        b.on("stranger:left", lambda p: left_b.append(p))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched_a:
                    break
                await asyncio.sleep(0.1)
            assert matched_a
            await a.disconnect()
            for _ in range(30):
                if left_b:
                    break
                await asyncio.sleep(0.1)
            assert left_b, "B did not receive stranger:left on A disconnect"
            assert left_b[0].get("reason") == "disconnected"
        finally:
            if a.connected:
                await a.disconnect()
            await b.disconnect()
