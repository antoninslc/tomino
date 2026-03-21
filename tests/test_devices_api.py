import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class DevicesApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_devices.db")

        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()

        self.client = app_module.app.test_client()

        self.main_auth = self._register("devices@example.com", "dev-main", "PC principal")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _register(self, email, device_id, device_label):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "Motdepasse123",
                "device_id": device_id,
                "device_label": device_label,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        token = payload.get("token")
        self.assertTrue(token)
        headers = {"Authorization": f"Bearer {token}"}
        upgrade = self.client.post("/api/billing/change-plan", json={"tier": "tomino_plus"}, headers=headers)
        self.assertEqual(upgrade.status_code, 200)
        return headers

    def _login(self, email, device_id, device_label):
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": "Motdepasse123",
                "device_id": device_id,
                "device_label": device_label,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        token = payload.get("token")
        self.assertTrue(token)
        return {"Authorization": f"Bearer {token}"}

    def test_list_devices_returns_current_device(self):
        response = self.client.get("/api/devices", headers=self.main_auth)
        self.assertEqual(response.status_code, 200)
        data = response.get_json() or {}
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("current_device_id"), "dev-main")
        devices = data.get("devices") or []
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0].get("device_id"), "dev-main")

    def test_pause_then_resume_sync_for_current_device(self):
        pause_response = self.client.post("/api/sync/pause", json={}, headers=self.main_auth)
        self.assertEqual(pause_response.status_code, 200)
        self.assertTrue((pause_response.get_json() or {}).get("sync_paused"))

        events_blocked = self.client.get("/api/sync/events?since=0&limit=10", headers=self.main_auth)
        self.assertEqual(events_blocked.status_code, 423)

        resume_response = self.client.post("/api/sync/resume", json={}, headers=self.main_auth)
        self.assertEqual(resume_response.status_code, 200)
        self.assertFalse((resume_response.get_json() or {}).get("sync_paused"))

        events_ok = self.client.get("/api/sync/events?since=0&limit=10", headers=self.main_auth)
        self.assertEqual(events_ok.status_code, 200)

    def test_revoke_other_device_invalidates_its_session(self):
        second_auth = self._login("devices@example.com", "dev-second", "Portable")

        revoke_response = self.client.post(
            "/api/devices/revoke",
            json={"device_id": "dev-second"},
            headers=self.main_auth,
        )
        self.assertEqual(revoke_response.status_code, 200)

        second_me = self.client.get("/api/auth/me", headers=second_auth)
        self.assertEqual(second_me.status_code, 401)


if __name__ == "__main__":
    unittest.main()
