import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class AlertesTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_alerte(self, ticker="AAPL", seuil=200.0, direction="hausse"):
        r = self.client.post("/api/alertes", json={
            "ticker": ticker, "seuil": seuil, "direction": direction, "notes": "",
        })
        return r

    def test_get_alertes_empty(self):
        r = self.client.get("/api/alertes")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["alertes"], [])

    def test_create_alerte(self):
        r = self._create_alerte()
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_create_alerte_missing_ticker_returns_400(self):
        r = self.client.post("/api/alertes", json={"seuil": 100.0})
        self.assertEqual(r.status_code, 400)
        self.assertIn("ticker", r.get_json().get("erreur", "").lower())

    def test_create_alerte_seuil_zero_returns_400(self):
        r = self.client.post("/api/alertes", json={"ticker": "AAPL", "seuil": 0})
        self.assertEqual(r.status_code, 400)
        self.assertIn("seuil", r.get_json().get("erreur", "").lower())

    def test_create_alerte_seuil_negatif_returns_400(self):
        r = self.client.post("/api/alertes", json={"ticker": "AAPL", "seuil": -50})
        self.assertEqual(r.status_code, 400)

    def test_get_alertes_after_create(self):
        self._create_alerte("AAPL", 200.0)
        self._create_alerte("MSFT", 400.0)
        r = self.client.get("/api/alertes")
        alertes = r.get_json()["alertes"]
        self.assertEqual(len(alertes), 2)

    def test_delete_alerte(self):
        self._create_alerte("AAPL", 200.0)
        alertes = self.client.get("/api/alertes").get_json()["alertes"]
        alerte_id = alertes[0]["id"]

        r = self.client.delete(f"/api/alertes/{alerte_id}")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        alertes_after = self.client.get("/api/alertes").get_json()["alertes"]
        self.assertEqual(len(alertes_after), 0)

    def test_reactiver_alerte(self):
        self._create_alerte("AAPL", 200.0)
        alertes = self.client.get("/api/alertes").get_json()["alertes"]
        alerte_id = alertes[0]["id"]

        r = self.client.post(f"/api/alertes/{alerte_id}/reactiver")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_free_tier_limit_enforced(self):
        # Le tier free est limité à 3 alertes actives (valeur par défaut)
        free_limit = app_module._alerts_limit_for_tier("free")
        if free_limit is None:
            self.skipTest("Pas de limite free configurée")
        for i in range(free_limit):
            r = self._create_alerte(f"TICK{i}", float(100 + i))
            self.assertEqual(r.status_code, 200)
        r_over = self._create_alerte("OVER", 999.0)
        self.assertEqual(r_over.status_code, 403)
        self.assertIn("limit", r_over.get_json())


class DividendesTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_dividende(self, ticker="AAPL", montant=100.0, date="2026-03-15"):
        r = self.client.post("/api/dividendes", json={
            "ticker": ticker, "nom": "Apple Inc.", "montant_brut": montant,
            "montant_net": montant, "date_versement": date,
            "devise_source": "USD", "notes": "",
        })
        return r

    def test_get_dividendes_empty(self):
        r = self.client.get("/api/dividendes")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("dividendes", data)
        self.assertEqual(len(data["dividendes"]), 0)

    def test_create_dividende(self):
        r = self._create_dividende()
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_create_dividende_missing_nom_returns_400(self):
        r = self.client.post("/api/dividendes", json={"montant_brut": 50.0, "date_versement": "2026-01-01"})
        self.assertEqual(r.status_code, 400)

    def test_create_dividende_missing_date_returns_400(self):
        r = self.client.post("/api/dividendes", json={"nom": "Apple Inc.", "montant_brut": 50.0})
        self.assertEqual(r.status_code, 400)

    def test_get_dividendes_after_create(self):
        self._create_dividende("AAPL", 100.0, "2026-03-01")
        self._create_dividende("MSFT", 80.0, "2026-03-15")
        data = self.client.get("/api/dividendes").get_json()
        self.assertEqual(len(data["dividendes"]), 2)

    def test_update_dividende(self):
        self._create_dividende("AAPL", 100.0, "2026-03-01")
        divs = self.client.get("/api/dividendes").get_json()["dividendes"]
        div_id = divs[0]["id"]

        r = self.client.put(f"/api/dividendes/{div_id}", json={
            "ticker": "AAPL", "nom": "Apple Inc.", "montant_brut": 150.0,
            "montant_net": 150.0, "date_versement": "2026-03-02",
            "devise_source": "USD", "notes": "modifié",
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_update_dividende_not_found(self):
        r = self.client.put("/api/dividendes/9999", json={
            "ticker": "AAPL", "montant_brut": 50.0, "date_versement": "2026-01-01",
        })
        self.assertEqual(r.status_code, 404)

    def test_delete_dividende(self):
        self._create_dividende()
        divs = self.client.get("/api/dividendes").get_json()["dividendes"]
        div_id = divs[0]["id"]

        r = self.client.delete(f"/api/dividendes/{div_id}")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        divs_after = self.client.get("/api/dividendes").get_json()["dividendes"]
        self.assertEqual(len(divs_after), 0)


class FiscalProfilQuotaTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_fiscal_returns_ok(self):
        r = self.client.get("/api/fiscal?annee=2025")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_fiscal_invalid_annee_returns_400(self):
        r = self.client.get("/api/fiscal?annee=1800")
        self.assertEqual(r.status_code, 400)

    def test_fiscal_no_annee_uses_default(self):
        r = self.client.get("/api/fiscal")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_profil_get(self):
        r = self.client.get("/api/profil")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("profil_exists", data)

    def test_profil_save_and_get(self):
        payload = {
            "prenom": "Test",
            "horizon": "long",
            "objectif": "croissance",
            "risque": "modere",
        }
        r = self.client.post("/api/profil", json=payload)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

        r_get = self.client.get("/api/profil")
        self.assertEqual(r_get.status_code, 200)
        data = r_get.get_json()
        self.assertTrue(data["profil_exists"])

    def test_ia_quota_returns_ok(self):
        r = self.client.get("/api/ia/quota")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertIn("total_tokens", data)


if __name__ == "__main__":
    unittest.main()
