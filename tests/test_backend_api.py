import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class BackendApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_api.db")

        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()

        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_create_dividend_rejects_net_over_brut(self):
        payload = {
            "ticker": "AIR.PA",
            "nom": "Airbus",
            "montant_brut": 10,
            "retenue_source": 1,
            "montant_net": 12,
            "date_versement": "2026-01-10",
            "enveloppe": "CTO",
        }

        response = self.client.post("/api/dividendes", json=payload)

        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data.get("ok"))
        self.assertIn("montant net", data.get("erreur", "").lower())

    def test_update_dividend_success(self):
        create_payload = {
            "ticker": "AIR.PA",
            "nom": "Airbus",
            "montant_brut": 15,
            "retenue_source": 2,
            "montant_net": 13,
            "pays_source": "France",
            "devise_source": "EUR",
            "date_versement": "2026-02-15",
            "enveloppe": "CTO",
            "notes": "Initial",
        }
        response_create = self.client.post("/api/dividendes", json=create_payload)
        self.assertEqual(response_create.status_code, 200)

        dividends = db.get_dividendes(10)
        self.assertEqual(len(dividends), 1)
        dividend_id = dividends[0]["id"]

        update_payload = {
            "ticker": "AIR.PA",
            "nom": "Airbus SE",
            "montant_brut": 20,
            "retenue_source": 3,
            "montant_net": 17,
            "pays_source": "France",
            "devise_source": "EUR",
            "date_versement": "2026-02-15",
            "enveloppe": "CTO",
            "notes": "Mis a jour",
        }
        response_update = self.client.put(f"/api/dividendes/{dividend_id}", json=update_payload)

        self.assertEqual(response_update.status_code, 200)
        updated = db.get_dividende(dividend_id)
        self.assertEqual(updated["nom"], "Airbus SE")
        self.assertEqual(float(updated["montant_brut"]), 20.0)
        self.assertEqual(float(updated["retenue_source"]), 3.0)
        self.assertEqual(float(updated["montant_net"]), 17.0)

    def test_update_dividend_not_found(self):
        update_payload = {
            "ticker": "AIR.PA",
            "nom": "Airbus",
            "montant_brut": 20,
            "retenue_source": 3,
            "montant_net": 17,
            "date_versement": "2026-02-15",
            "enveloppe": "CTO",
        }
        response = self.client.put("/api/dividendes/99999", json=update_payload)
        self.assertEqual(response.status_code, 404)
        data = response.get_json()
        self.assertFalse(data.get("ok"))
        self.assertIn("introuvable", data.get("erreur", "").lower())

    def test_create_dividend_rejects_invalid_date(self):
        payload = {
            "ticker": "AIR.PA",
            "nom": "Airbus",
            "montant_brut": 10,
            "retenue_source": 1,
            "montant_net": 9,
            "date_versement": "15/02/2026",
            "enveloppe": "CTO",
        }

        response = self.client.post("/api/dividendes", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data.get("ok"))
        self.assertIn("date de versement invalide", data.get("erreur", "").lower())

    def test_free_alert_limit_is_enforced(self):
        for idx in range(3):
            response = self.client.post(
                "/api/alertes",
                json={
                    "ticker": f"AIR{idx}.PA",
                    "nom": "Airbus",
                    "type_alerte": "baisse",
                    "seuil": 100 + idx,
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertTrue((response.get_json() or {}).get("ok"))

        blocked = self.client.post(
            "/api/alertes",
            json={
                "ticker": "MC.PA",
                "nom": "LVMH",
                "type_alerte": "hausse",
                "seuil": 900,
            },
        )
        self.assertEqual(blocked.status_code, 403)
        payload = blocked.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("limit"), 3)
        self.assertEqual(payload.get("active_count"), 3)


if __name__ == "__main__":
    unittest.main()
