"""
CS Chatroom - Moderator feature backend tests
- REST endpoints for /api/mod/verify, /api/mod/reports (list/resolve/reopen)
- Auth gating via x-mod-token header
- Full flow: seed a fresh report via stranger socket flow, list open, resolve, reopen
"""
import os
import uuid
import asyncio
import pytest
import requests
import socketio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"

MOD_TOKEN = "cs-mod-2026"
SOCKET_PATH = "/api/socket.io/"


# --- helpers reused from test_chatroom.py ---
async def _new_client(nickname=None, device_id=None):
    sio = socketio.AsyncClient(reconnection=False, logger=False, engineio_logger=False)
    device_id = device_id or f"TEST-{uuid.uuid4()}"
    nickname = nickname or f"tester-{device_id[:6]}"
    await sio.connect(
        BASE_URL,
        socketio_path=SOCKET_PATH,
        transports=["websocket"],
        auth={"deviceId": device_id, "nickname": nickname},
        wait=True,
        wait_timeout=10,
    )
    sio._test_device_id = device_id
    return sio


async def _call(sio, event, payload):
    fut = asyncio.get_event_loop().create_future()

    def _cb(*args):
        if not fut.done():
            fut.set_result(args[0] if args else None)

    await sio.emit(event, payload, callback=_cb)
    return await asyncio.wait_for(fut, timeout=8)


# --- Auth gating tests ---
class TestModAuth:
    def test_list_reports_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/mod/reports", timeout=10)
        assert r.status_code == 401
        data = r.json()
        assert data.get("error") == "unauthorized"

    def test_list_reports_with_wrong_token_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/api/mod/reports",
            headers={"x-mod-token": "wrong-token"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_verify_wrong_token_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/mod/verify",
            json={"token": "wrong-token"},
            timeout=10,
        )
        assert r.status_code == 401
        data = r.json()
        assert data.get("ok") is False

    def test_verify_correct_token_returns_ok(self):
        r = requests.post(
            f"{BASE_URL}/api/mod/verify",
            json={"token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True

    def test_verify_via_header_only(self):
        # Should accept header-based verification too
        r = requests.post(
            f"{BASE_URL}/api/mod/verify",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_resolve_nonexistent_returns_404(self):
        r = requests.post(
            f"{BASE_URL}/api/mod/reports/999999/resolve",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 404
        assert r.json().get("ok") is False

    def test_reopen_nonexistent_returns_404(self):
        r = requests.post(
            f"{BASE_URL}/api/mod/reports/999999/reopen",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 404


# --- List/filter tests ---
class TestModListReports:
    def test_list_open_returns_shape(self):
        r = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "open"
        assert "stats" in data
        assert isinstance(data["stats"].get("total"), int)
        assert isinstance(data["stats"].get("open"), int)
        assert isinstance(data["stats"].get("resolved"), int)
        assert isinstance(data["reports"], list)
        # All returned reports should be unresolved
        for rep in data["reports"]:
            assert rep["resolved"] is False

    def test_list_resolved_only_resolved(self):
        r = requests.get(
            f"{BASE_URL}/api/mod/reports?status=resolved",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 200
        for rep in r.json()["reports"]:
            assert rep["resolved"] is True

    def test_list_all(self):
        r = requests.get(
            f"{BASE_URL}/api/mod/reports?status=all",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "all"
        assert isinstance(data["reports"], list)
        # stats total should be >= len(reports) in this page (default limit=50)
        assert data["stats"]["total"] >= len(data["reports"])

    def test_bearer_token_also_accepted(self):
        r = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open",
            headers={"Authorization": f"Bearer {MOD_TOKEN}"},
            timeout=10,
        )
        assert r.status_code == 200


# --- Full lifecycle: seed report → verify open → resolve → verify resolved → reopen ---
@pytest.mark.asyncio
class TestModFullLifecycle:
    async def test_seed_resolve_reopen(self):
        # Step 1: seed a fresh stranger report via socket flow
        reporter_device = f"TEST-REPORTER-{uuid.uuid4()}"
        reported_device = f"TEST-REPORTED-{uuid.uuid4()}"
        a = await _new_client(nickname="mod-a", device_id=reporter_device)
        b = await _new_client(nickname="mod-b", device_id=reported_device)
        matched_a = []
        a.on("stranger:matched", lambda p: matched_a.append(p))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched_a:
                    break
                await asyncio.sleep(0.1)
            assert matched_a, "did not match"
            room = matched_a[0]["room"]
            res = await _call(a, "stranger:report", {"room": room})
            assert res.get("ok") is True
        finally:
            await a.disconnect()
            await b.disconnect()

        # Step 2: list open reports → find our seeded one
        list_res = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open&limit=200",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert list_res.status_code == 200
        reports = list_res.json()["reports"]
        our = [r for r in reports if r["reporter_device_id"] == reporter_device]
        assert len(our) >= 1, f"seeded report not visible in open list; reporter={reporter_device}"
        report_id = our[0]["id"]
        assert our[0]["reported_device_id"] == reported_device
        assert our[0]["resolved"] is False
        assert our[0]["resolved_at"] is None
        assert isinstance(our[0]["created_at"], int)

        stats_before = list_res.json()["stats"]

        # Step 3: resolve it
        rv = requests.post(
            f"{BASE_URL}/api/mod/reports/{report_id}/resolve",
            headers={"x-mod-token": MOD_TOKEN},
            json={"note": "TEST_resolved"},
            timeout=10,
        )
        assert rv.status_code == 200
        rv_data = rv.json()
        assert rv_data == {"ok": True, "id": report_id}

        # Step 4: verify no longer in open list
        open_list = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open&limit=200",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        ).json()
        assert not any(r["id"] == report_id for r in open_list["reports"]), \
            "resolved report still appears in open list"
        # stats.open should have decremented by at least 1
        assert open_list["stats"]["open"] <= stats_before["open"] - 1 + 0  # allow other concurrent activity

        # Step 5: verify appears in resolved list
        resolved_list = requests.get(
            f"{BASE_URL}/api/mod/reports?status=resolved&limit=200",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        ).json()
        found = [r for r in resolved_list["reports"] if r["id"] == report_id]
        assert len(found) == 1
        assert found[0]["resolved"] is True
        assert isinstance(found[0]["resolved_at"], int)
        assert found[0]["note"] == "TEST_resolved"

        # Step 6: reopen it
        ro = requests.post(
            f"{BASE_URL}/api/mod/reports/{report_id}/reopen",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        )
        assert ro.status_code == 200
        assert ro.json() == {"ok": True, "id": report_id}

        # Step 7: verify back in open list
        open_after = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open&limit=200",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        ).json()
        found_open = [r for r in open_after["reports"] if r["id"] == report_id]
        assert len(found_open) == 1
        assert found_open[0]["resolved"] is False
        assert found_open[0]["resolved_at"] is None

        # Step 8: repeat-offender count (reported_device_report_count) should be >= 1
        assert found_open[0].get("reported_device_report_count", 0) >= 1

    async def test_backward_compat_new_report_defaults_resolved_false(self):
        # Any new stranger:report emitted must land as resolved=false
        rep_dev = f"TEST-COMPAT-REP-{uuid.uuid4()}"
        rpt_dev = f"TEST-COMPAT-RPT-{uuid.uuid4()}"
        a = await _new_client(nickname="c-a", device_id=rep_dev)
        b = await _new_client(nickname="c-b", device_id=rpt_dev)
        matched = []
        a.on("stranger:matched", lambda p: matched.append(p))
        try:
            await _call(a, "stranger:find", {})
            await _call(b, "stranger:find", {})
            for _ in range(30):
                if matched:
                    break
                await asyncio.sleep(0.1)
            assert matched
            r = await _call(a, "stranger:report", {"room": matched[0]["room"]})
            assert r.get("ok") is True
        finally:
            await a.disconnect()
            await b.disconnect()

        open_list = requests.get(
            f"{BASE_URL}/api/mod/reports?status=open&limit=200",
            headers={"x-mod-token": MOD_TOKEN},
            timeout=10,
        ).json()
        assert any(rp["reporter_device_id"] == rep_dev and rp["resolved"] is False
                   for rp in open_list["reports"]), "new report not landing as open/resolved=false"
