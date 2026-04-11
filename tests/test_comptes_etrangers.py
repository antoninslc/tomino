import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class ComptesEtrangersTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_compte(self, etablissement="Interactive Brokers", pays="US",
                       type_compte="titres", date_ouverture="2022-01-15",
                       numero_compte="U1234567", actif_numerique=0):
        r = self.client.post("/api/comptes-etrangers", json={
            "etablissement": etablissement,
            "pays": pays,
            "type_compte": type_compte,
            "date_ouverture": date_ouverture,
            "numero_compte": numero_compte,
            "actif_numerique": actif_numerique,
            "notes": "",
        })
        return r

    def test_get_comptes_etrangers_empty(self):
        r = self.client.get("/api/comptes-etrangers")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["comptes"]), 0)
        self.assertEqual(data["stats"]["total"], 0)

    def test_create_compte(self):
        r = self._create_compte()
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertIn("id", data)

    def test_create_compte_missing_etablissement_returns_400(self):
        r = self.client.post("/api/comptes-etrangers", json={"pays": "US", "type_compte": "titres"})
        self.assertEqual(r.status_code, 400)

    def test_create_compte_missing_pays_returns_400(self):
        r = self.client.post("/api/comptes-etrangers", json={"etablissement": "IB", "type_compte": "titres"})
        self.assertEqual(r.status_code, 400)

    def test_get_comptes_after_create(self):
        self._create_compte("IB", "US")
        self._create_compte("Degiro", "NL")
        r = self.client.get("/api/comptes-etrangers")
        data = r.get_json()
        self.assertEqual(data["stats"]["total"], 2)
        self.assertEqual(data["stats"]["actifs"], 2)

    def test_crypto_compte_counted_as_actif_numerique(self):
        self._create_compte("Coinbase", "US", type_compte="crypto", actif_numerique=1)
        data = self.client.get("/api/comptes-etrangers").get_json()
        self.assertEqual(data["stats"]["actifs_numeriques"], 1)

    def test_update_compte(self):
        r = self._create_compte()
        compte_id = r.get_json()["id"]

        r_update = self.client.put(f"/api/comptes-etrangers/{compte_id}", json={
            "etablissement": "IB modifié",
            "pays": "US",
            "type_compte": "titres",
            "date_ouverture": "2022-01-15",
            "numero_compte": "U9999999",
            "notes": "modifié",
        })
        self.assertEqual(r_update.status_code, 200)
        self.assertTrue(r_update.get_json()["ok"])

    def test_update_compte_not_found(self):
        r = self.client.put("/api/comptes-etrangers/9999", json={
            "etablissement": "X", "pays": "US",
        })
        self.assertEqual(r.status_code, 404)

    def test_delete_compte(self):
        r = self._create_compte()
        compte_id = r.get_json()["id"]

        r_del = self.client.delete(f"/api/comptes-etrangers/{compte_id}")
        self.assertEqual(r_del.status_code, 200)
        self.assertTrue(r_del.get_json()["ok"])
        data = self.client.get("/api/comptes-etrangers").get_json()
        self.assertEqual(data["stats"]["total"], 0)

    def test_delete_compte_not_found(self):
        r = self.client.delete("/api/comptes-etrangers/9999")
        self.assertEqual(r.status_code, 404)


class Declaration3916Tests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_compte(self, **kwargs):
        defaults = {
            "etablissement": "IB", "pays": "US", "type_compte": "titres",
            "date_ouverture": "2020-01-01", "numero_compte": "U123",
            "actif_numerique": 0, "notes": "",
        }
        defaults.update(kwargs)
        r = self.client.post("/api/comptes-etrangers", json=defaults)
        self.assertEqual(r.status_code, 200)
        return r.get_json()["id"]

    def test_declaration_empty_returns_ok(self):
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["annee"], 2025)
        self.assertEqual(data["stats"]["total"], 0)

    def test_declaration_invalid_annee_returns_400(self):
        r = self.client.get("/api/comptes-etrangers/declaration?annee=1800")
        self.assertEqual(r.status_code, 400)

    def test_compte_ouvert_avant_annee_est_declarable(self):
        # Compte ouvert en 2020, toujours actif → déclarable pour 2025
        self._create_compte(date_ouverture="2020-01-01")
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertEqual(data["stats"]["total"], 1)
        self.assertEqual(data["stats"]["actifs_sur_annee"], 1)

    def test_compte_clos_avant_annee_non_declarable(self):
        # Compte clôturé fin 2023 → non déclarable pour 2025
        self._create_compte(date_ouverture="2020-01-01", date_cloture="2023-12-31")
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertEqual(data["stats"]["total"], 0)

    def test_compte_ouvert_dans_annee_declarable(self):
        # Compte ouvert en juin 2025 → déclarable pour 2025
        self._create_compte(date_ouverture="2025-06-01")
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertEqual(data["stats"]["total"], 1)
        self.assertGreater(data["stats"]["ouverts_dans_annee"], 0)

    def test_score_confiance_eleve_quand_donnees_completes(self):
        self._create_compte(
            etablissement="IB", pays="US", type_compte="titres",
            date_ouverture="2020-01-01", numero_compte="U1234567",
        )
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertEqual(data["score_confiance"], "eleve")

    def test_crypto_compte_est_3916_bis(self):
        self._create_compte(type_compte="crypto", actif_numerique=1, date_ouverture="2021-01-01")
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertEqual(data["stats"]["comptes_3916_bis"], 1)

    def test_checklist_presente(self):
        r = self.client.get("/api/comptes-etrangers/declaration?annee=2025")
        data = r.get_json()
        self.assertIn("checklist", data)
        self.assertIsInstance(data["checklist"], list)
        self.assertGreater(len(data["checklist"]), 0)

    def test_declaration_no_annee_uses_default(self):
        r = self.client.get("/api/comptes-etrangers/declaration")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])


if __name__ == "__main__":
    unittest.main()
