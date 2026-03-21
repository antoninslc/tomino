import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class SyncEventsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_sync.db")

        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()

        self.client = app_module.app.test_client()
        self.auth_headers = self._register_and_login()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _register_and_login(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "email": "sync-tests@example.com",
                "password": "Motdepasse123",
                "device_label": "tests",
            },
        )
        self.assertEqual(response.status_code, 200)
        token = (response.get_json() or {}).get("token")
        self.assertTrue(token)
        headers = {"Authorization": f"Bearer {token}"}
        upgrade = self.client.post("/api/billing/change-plan", json={"tier": "tomino_plus"}, headers=headers)
        self.assertEqual(upgrade.status_code, 200)
        return headers

    def test_sync_events_polling_returns_local_mutations(self):
        create_payload = {
            "nom": "Livret A",
            "capital": 1000,
            "taux": 3.0,
            "date_maj": "2026-03-18",
            "notes": "Initial",
        }
        r_create = self.client.post("/api/livrets", json=create_payload, headers=self.auth_headers)
        self.assertEqual(r_create.status_code, 200)

        r_events = self.client.get("/api/sync/events?since=0&limit=50", headers=self.auth_headers)
        self.assertEqual(r_events.status_code, 200)
        data = r_events.get_json() or {}
        self.assertTrue(data.get("ok"))
        self.assertGreaterEqual(int(data.get("count") or 0), 1)

        events = data.get("events") or []
        livret_events = [e for e in events if e.get("entity_type") == "livrets"]
        self.assertTrue(livret_events)
        self.assertEqual(livret_events[-1].get("operation"), "upsert")
        self.assertEqual((livret_events[-1].get("payload") or {}).get("nom"), "Livret A")

    def test_sync_apply_resolves_conflict_by_timestamp(self):
        r_create = self.client.post(
            "/api/livrets",
            json={
                "nom": "Livret Test",
                "capital": 100,
                "taux": 2.0,
                "date_maj": "2026-03-18",
                "notes": "Base locale",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(r_create.status_code, 200)
        livret_id = int((r_create.get_json() or {}).get("id"))

        stale_event = {
            "event_uid": "remote-stale-001",
            "entity_type": "livrets",
            "entity_id": str(livret_id),
            "operation": "upsert",
            "event_at": "2000-01-01T00:00:00Z",
            "payload": {
                "id": livret_id,
                "nom": "Livret Test",
                "capital": 999,
                "taux": 2.0,
                "date_maj": "2026-03-18",
                "notes": "Doit etre ignore",
            },
        }

        fresh_event = {
            "event_uid": "remote-fresh-001",
            "entity_type": "livrets",
            "entity_id": str(livret_id),
            "operation": "upsert",
            "event_at": "2099-01-01T00:00:00Z",
            "payload": {
                "id": livret_id,
                "nom": "Livret Test",
                "capital": 321,
                "taux": 2.0,
                "date_maj": "2026-03-18",
                "notes": "Doit etre applique",
            },
        }

        r_apply = self.client.post(
            "/api/sync/events/apply",
            json={"source": "remote-device-test", "events": [stale_event, fresh_event]},
            headers=self.auth_headers,
        )
        self.assertEqual(r_apply.status_code, 200)
        result = r_apply.get_json() or {}
        self.assertTrue(result.get("ok"))
        self.assertEqual(int(result.get("stale") or 0), 1)
        self.assertEqual(int(result.get("applied") or 0), 1)

        livret = db.get_livret(livret_id)
        self.assertIsNotNone(livret)
        self.assertAlmostEqual(float(livret.get("capital") or 0), 321.0)

    def test_sync_events_are_scoped_by_user_and_event_uid(self):
        second = self.client.post(
            "/api/auth/register",
            json={
                "email": "sync-tests-2@example.com",
                "password": "Motdepasse123",
                "device_id": "dev-second",
                "device_label": "second",
            },
        )
        self.assertEqual(second.status_code, 200)
        token2 = (second.get_json() or {}).get("token")
        headers2 = {"Authorization": f"Bearer {token2}"}
        upgrade2 = self.client.post("/api/billing/change-plan", json={"tier": "tomino_plus"}, headers=headers2)
        self.assertEqual(upgrade2.status_code, 200)

        evt_same_uid_user1 = {
            "event_uid": "shared-uid-001",
            "entity_type": "livrets",
            "entity_id": "9001",
            "operation": "upsert",
            "event_at": "2099-01-01T00:00:00Z",
            "payload": {
                "id": 9001,
                "nom": "Livret U1",
                "capital": 111,
                "taux": 2.0,
                "date_maj": "2026-03-18",
                "notes": "user1",
            },
        }
        evt_same_uid_user2 = {
            "event_uid": "shared-uid-001",
            "entity_type": "livrets",
            "entity_id": "9002",
            "operation": "upsert",
            "event_at": "2099-01-01T00:00:00Z",
            "payload": {
                "id": 9002,
                "nom": "Livret U2",
                "capital": 222,
                "taux": 2.0,
                "date_maj": "2026-03-18",
                "notes": "user2",
            },
        }

        r_apply_u1 = self.client.post(
            "/api/sync/events/apply",
            json={"source": "remote-u1", "events": [evt_same_uid_user1]},
            headers=self.auth_headers,
        )
        self.assertEqual(r_apply_u1.status_code, 200)
        self.assertEqual(int((r_apply_u1.get_json() or {}).get("applied") or 0), 1)

        r_apply_u2 = self.client.post(
            "/api/sync/events/apply",
            json={"source": "remote-u2", "events": [evt_same_uid_user2]},
            headers=headers2,
        )
        self.assertEqual(r_apply_u2.status_code, 200)
        self.assertEqual(int((r_apply_u2.get_json() or {}).get("applied") or 0), 1)

        poll_u1 = self.client.get("/api/sync/events?since=0&limit=200", headers=self.auth_headers)
        poll_u2 = self.client.get("/api/sync/events?since=0&limit=200", headers=headers2)
        self.assertEqual(poll_u1.status_code, 200)
        self.assertEqual(poll_u2.status_code, 200)

        events_u1 = poll_u1.get_json().get("events") or []
        events_u2 = poll_u2.get_json().get("events") or []
        names_u1 = {((e.get("payload") or {}).get("nom")) for e in events_u1}
        names_u2 = {((e.get("payload") or {}).get("nom")) for e in events_u2}
        self.assertIn("Livret U1", names_u1)
        self.assertNotIn("Livret U2", names_u1)
        self.assertIn("Livret U2", names_u2)
        self.assertNotIn("Livret U1", names_u2)


if __name__ == "__main__":
    unittest.main()
