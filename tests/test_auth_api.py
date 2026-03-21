import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"
os.environ["TOMINO_AUTH_PASSWORD_RESET_EXPOSE_TOKEN"] = "1"

import database as db
import app as app_module


class AuthApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_auth.db")

        os.environ["TOMINO_BILLING_PROVIDER"] = "local"
        os.environ["TOMINO_AUTH_PASSWORD_RESET_EXPOSE_TOKEN"] = "1"
        app_module.BILLING_PROVIDER = "local"
        app_module.AUTH_PASSWORD_RESET_EXPOSE_TOKEN = True

        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()
        with app_module._AUTH_LOGIN_LOCK:
            app_module._AUTH_LOGIN_ATTEMPTS.clear()

        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_register_login_me_and_logout_flow(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "phasea@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        register_data = register_response.get_json() or {}
        self.assertTrue(register_data.get("ok"))
        self.assertEqual((register_data.get("user") or {}).get("auth_provider"), "local")
        token = register_data.get("token")
        self.assertTrue(token)

        me_response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_response.status_code, 200)
        me_data = me_response.get_json() or {}
        self.assertEqual((me_data.get("user") or {}).get("email"), "phasea@example.com")
        self.assertEqual((me_data.get("user") or {}).get("auth_provider"), "local")

        logout_response = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout_response.status_code, 200)
        self.assertTrue((logout_response.get_json() or {}).get("ok"))

        me_after_logout = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_after_logout.status_code, 401)

    def test_register_rejects_invalid_email_and_short_password(self):
        bad_email = self.client.post(
            "/api/auth/register",
            json={"email": "not-an-email", "password": "Motdepasse123"},
        )
        self.assertEqual(bad_email.status_code, 400)

        short_password = self.client.post(
            "/api/auth/register",
            json={"email": "valid@example.com", "password": "1234567"},
        )
        self.assertEqual(short_password.status_code, 400)

    def test_sync_routes_require_authentication(self):
        events_response = self.client.get("/api/sync/events?since=0&limit=10")
        self.assertEqual(events_response.status_code, 401)

        apply_response = self.client.post("/api/sync/events/apply", json={"events": []})
        self.assertEqual(apply_response.status_code, 401)

    def test_sync_routes_are_blocked_for_free_plan(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "free-sync-block@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        self.assertTrue(token)

        events_response = self.client.get("/api/sync/events?since=0&limit=10", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(events_response.status_code, 403)

    def test_plan_change_unlocks_sync_routes(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "upgrade-sync@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        self.assertTrue(token)
        headers = {"Authorization": f"Bearer {token}"}

        upgrade_response = self.client.post("/api/billing/change-plan", json={"tier": "tomino_plus"}, headers=headers)
        self.assertEqual(upgrade_response.status_code, 200)
        self.assertTrue((upgrade_response.get_json() or {}).get("ok"))

        events_response = self.client.get("/api/sync/events?since=0&limit=10", headers=headers)
        self.assertEqual(events_response.status_code, 200)

    def test_plans_and_subscription_endpoints(self):
        plans_response = self.client.get("/api/plans")
        self.assertEqual(plans_response.status_code, 200)
        plans_payload = plans_response.get_json() or {}
        plans = plans_payload.get("plans") or []
        tiers = {str(item.get("tier") or "") for item in plans}
        self.assertIn("free", tiers)
        self.assertIn("tier1", tiers)
        self.assertIn("tomino_plus", tiers)
        self.assertIn(plans_payload.get("provider"), ("local", "stripe"))

        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "subscription@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        headers = {"Authorization": f"Bearer {token}"}

        sub_response = self.client.get("/api/billing/subscription", headers=headers)
        self.assertEqual(sub_response.status_code, 200)
        subscription = (sub_response.get_json() or {}).get("subscription") or {}
        self.assertEqual(subscription.get("tier"), "free")

    def test_checkout_session_is_rejected_in_local_mode(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "checkout-local@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        headers = {"Authorization": f"Bearer {token}"}

        checkout_response = self.client.post(
            "/api/billing/checkout-session",
            json={"tier": "tomino_plus"},
            headers=headers,
        )

        if app_module.BILLING_PROVIDER == "stripe":
            self.assertIn(checkout_response.status_code, (200, 500))
        else:
            self.assertEqual(checkout_response.status_code, 400)

    def test_billing_portal_requires_authentication(self):
        response = self.client.post("/api/billing/portal-session", json={})
        self.assertEqual(response.status_code, 401)

    def test_billing_portal_is_rejected_in_local_mode(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "portal-local@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        headers = {"Authorization": f"Bearer {token}"}

        portal_response = self.client.post(
            "/api/billing/portal-session",
            json={},
            headers=headers,
        )

        if app_module.BILLING_PROVIDER == "stripe":
            self.assertIn(portal_response.status_code, (200, 400, 500))
        else:
            self.assertEqual(portal_response.status_code, 400)

    def test_password_reset_request_and_confirm_flow(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "reset-flow@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)

        reset_request = self.client.post(
            "/api/auth/password-reset/request",
            json={"email": "reset-flow@example.com"},
        )
        self.assertEqual(reset_request.status_code, 200)
        request_payload = reset_request.get_json() or {}
        self.assertTrue(request_payload.get("ok"))
        reset_token = str(request_payload.get("reset_token") or "")
        self.assertTrue(reset_token)

        reset_confirm = self.client.post(
            "/api/auth/password-reset/confirm",
            json={"token": reset_token, "password": "NouveauMotdepasse123"},
        )
        self.assertEqual(reset_confirm.status_code, 200)
        self.assertTrue((reset_confirm.get_json() or {}).get("ok"))

        old_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset-flow@example.com", "password": "Motdepasse123", "device_id": "dev-old"},
        )
        self.assertEqual(old_login.status_code, 401)

        new_login = self.client.post(
            "/api/auth/login",
            json={"email": "reset-flow@example.com", "password": "NouveauMotdepasse123", "device_id": "dev-new"},
        )
        self.assertEqual(new_login.status_code, 200)

    def test_password_reset_confirm_rejects_invalid_token(self):
        response = self.client.post(
            "/api/auth/password-reset/confirm",
            json={"token": "invalid-token", "password": "NouveauMotdepasse123"},
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_request_is_generic_for_unknown_email(self):
        response = self.client.post(
            "/api/auth/password-reset/request",
            json={"email": "unknown@example.com"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertNotIn("reset_token", payload)

    def test_provider_link_requires_auth(self):
        response = self.client.post(
            "/api/auth/provider/link",
            json={"provider": "supabase", "provider_user_id": "spb_user_1"},
        )
        self.assertEqual(response.status_code, 401)

    def test_provider_link_success(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "provider-link@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        headers = {"Authorization": f"Bearer {token}"}

        link_response = self.client.post(
            "/api/auth/provider/link",
            json={"provider": "supabase", "provider_user_id": "spb_user_1"},
            headers=headers,
        )
        self.assertEqual(link_response.status_code, 200)
        payload = link_response.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual((payload.get("user") or {}).get("auth_provider"), "supabase")
        self.assertEqual((payload.get("user") or {}).get("provider_user_id"), "spb_user_1")

    def test_provider_link_conflict(self):
        register_a = self.client.post(
            "/api/auth/register",
            json={
                "email": "provider-a@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-a",
            },
        )
        self.assertEqual(register_a.status_code, 200)
        token_a = (register_a.get_json() or {}).get("token")
        headers_a = {"Authorization": f"Bearer {token_a}"}

        register_b = self.client.post(
            "/api/auth/register",
            json={
                "email": "provider-b@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-b",
            },
        )
        self.assertEqual(register_b.status_code, 200)
        token_b = (register_b.get_json() or {}).get("token")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        link_a = self.client.post(
            "/api/auth/provider/link",
            json={"provider": "supabase", "provider_user_id": "spb_conflict_user"},
            headers=headers_a,
        )
        self.assertEqual(link_a.status_code, 200)

        link_b = self.client.post(
            "/api/auth/provider/link",
            json={"provider": "supabase", "provider_user_id": "spb_conflict_user"},
            headers=headers_b,
        )
        self.assertEqual(link_b.status_code, 409)

    def test_local_data_is_preserved_across_auth_session_flow(self):
        create_livret = self.client.post(
            "/api/livrets",
            json={
                "nom": "Livret Local",
                "capital": 1234,
                "taux": 3.0,
                "date_maj": "2026-03-18",
                "notes": "donnee-locale",
            },
        )
        self.assertEqual(create_livret.status_code, 200)

        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "phasea-local@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token = (register_response.get_json() or {}).get("token")
        self.assertTrue(token)

        me_response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_response.status_code, 200)

        logout_response = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout_response.status_code, 200)

        livrets_after = self.client.get("/api/livrets")
        self.assertEqual(livrets_after.status_code, 200)
        data = livrets_after.get_json() or {}
        livrets = data.get("livrets") or []
        noms = {str(item.get("nom") or "") for item in livrets}
        self.assertIn("Livret Local", noms)

    def test_login_rate_limit_blocks_after_repeated_failures(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "ratelimit@example.com",
                "password": "Motdepasse123",
                "device_label": "pc-main",
            },
        )
        self.assertEqual(register_response.status_code, 200)

        for _ in range(max(1, app_module.AUTH_LOGIN_MAX_ATTEMPTS)):
            login_response = self.client.post(
                "/api/auth/login",
                json={
                    "email": "ratelimit@example.com",
                    "password": "MauvaisMotDePasse",
                    "device_id": "dev-rate-limit",
                },
            )
            self.assertEqual(login_response.status_code, 401)

        blocked_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "ratelimit@example.com",
                "password": "MauvaisMotDePasse",
                "device_id": "dev-rate-limit",
            },
        )
        self.assertEqual(blocked_response.status_code, 429)
        blocked_data = blocked_response.get_json() or {}
        self.assertIn("retry_after", blocked_data)
        self.assertGreater(int(blocked_data.get("retry_after") or 0), 0)

    def test_logout_all_revokes_other_sessions_only(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "logoutall@example.com",
                "password": "Motdepasse123",
                "device_id": "device-a",
                "device_label": "PC A",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        token_a = (register_response.get_json() or {}).get("token")
        self.assertTrue(token_a)

        login_response = self.client.post(
            "/api/auth/login",
            json={
                "email": "logoutall@example.com",
                "password": "Motdepasse123",
                "device_id": "device-b",
                "device_label": "PC B",
            },
        )
        self.assertEqual(login_response.status_code, 200)
        token_b = (login_response.get_json() or {}).get("token")
        self.assertTrue(token_b)

        logout_all_response = self.client.post(
            "/api/auth/logout-all",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(logout_all_response.status_code, 200)
        data = logout_all_response.get_json() or {}
        self.assertTrue(data.get("ok"))
        self.assertGreaterEqual(int(data.get("revoked_sessions") or 0), 1)

        me_a = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_a}"})
        self.assertEqual(me_a.status_code, 200)

        me_b = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_b}"})
        self.assertEqual(me_b.status_code, 401)

    def test_auth_audit_logs_capture_login_fail_and_success(self):
        register_response = self.client.post(
            "/api/auth/register",
            json={
                "email": "audit@example.com",
                "password": "Motdepasse123",
                "device_id": "device-audit",
            },
        )
        self.assertEqual(register_response.status_code, 200)

        bad_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "audit@example.com",
                "password": "MauvaisMotDePasse",
                "device_id": "device-audit",
            },
        )
        self.assertEqual(bad_login.status_code, 401)

        good_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "audit@example.com",
                "password": "Motdepasse123",
                "device_id": "device-audit",
            },
        )
        self.assertEqual(good_login.status_code, 200)

        logs = db.get_auth_audit_logs(limit=50)
        self.assertGreaterEqual(len(logs), 3)

        has_register_ok = any(
            str(item.get("event_type") or "") == "register" and int(item.get("ok") or 0) == 1
            for item in logs
        )
        has_login_fail = any(
            str(item.get("event_type") or "") == "login"
            and int(item.get("ok") or 0) == 0
            and str(item.get("reason") or "") == "invalid_credentials"
            for item in logs
        )
        has_login_ok = any(
            str(item.get("event_type") or "") == "login" and int(item.get("ok") or 0) == 1
            for item in logs
        )

        self.assertTrue(has_register_ok)
        self.assertTrue(has_login_fail)
        self.assertTrue(has_login_ok)

    def test_session_rotation_revokes_oldest_active_session(self):
        previous_max = app_module.AUTH_MAX_ACTIVE_SESSIONS
        app_module.AUTH_MAX_ACTIVE_SESSIONS = 2
        try:
            register_response = self.client.post(
                "/api/auth/register",
                json={
                    "email": "rotation@example.com",
                    "password": "Motdepasse123",
                    "device_id": "device-1",
                    "device_label": "Device 1",
                },
            )
            self.assertEqual(register_response.status_code, 200)
            token_1 = (register_response.get_json() or {}).get("token")
            self.assertTrue(token_1)

            login_2 = self.client.post(
                "/api/auth/login",
                json={
                    "email": "rotation@example.com",
                    "password": "Motdepasse123",
                    "device_id": "device-2",
                    "device_label": "Device 2",
                },
            )
            self.assertEqual(login_2.status_code, 200)
            token_2 = (login_2.get_json() or {}).get("token")
            self.assertTrue(token_2)

            login_3 = self.client.post(
                "/api/auth/login",
                json={
                    "email": "rotation@example.com",
                    "password": "Motdepasse123",
                    "device_id": "device-3",
                    "device_label": "Device 3",
                },
            )
            self.assertEqual(login_3.status_code, 200)
            token_3 = (login_3.get_json() or {}).get("token")
            self.assertTrue(token_3)

            me_1 = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_1}"})
            me_2 = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_2}"})
            me_3 = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_3}"})

            self.assertEqual(me_1.status_code, 401)
            self.assertEqual(me_2.status_code, 200)
            self.assertEqual(me_3.status_code, 200)
        finally:
            app_module.AUTH_MAX_ACTIVE_SESSIONS = previous_max


if __name__ == "__main__":
    unittest.main()
