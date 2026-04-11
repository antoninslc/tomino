import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class LivretsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_livret(self, nom="Livret A", capital=10000, taux=3.0):
        r = self.client.post("/api/livrets", json={
            "nom": nom, "capital": capital, "taux": taux,
            "date_maj": "2026-01-01", "notes": "",
        })
        self.assertEqual(r.status_code, 200)
        return r.get_json()["id"]

    def test_create_livret_returns_id(self):
        livret_id = self._create_livret()
        self.assertIsNotNone(livret_id)
        self.assertGreater(livret_id, 0)

    def test_create_livret_missing_nom_returns_400(self):
        r = self.client.post("/api/livrets", json={"capital": 5000, "taux": 2.0})
        self.assertEqual(r.status_code, 400)
        self.assertIn("nom", r.get_json().get("erreur", "").lower())

    def test_get_livrets_returns_list_and_stats(self):
        self._create_livret("Livret A", 10000, 3.0)
        self._create_livret("LDDS", 5000, 3.0)
        r = self.client.get("/api/livrets")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["livrets"]), 2)
        self.assertAlmostEqual(data["total"], 15000.0)
        self.assertAlmostEqual(data["stats"]["interets_annuels"], 450.0)

    def test_update_livret(self):
        livret_id = self._create_livret("Livret A", 10000, 3.0)
        r = self.client.put(f"/api/livrets/{livret_id}", json={
            "nom": "Livret A modifié", "capital": 12000, "taux": 3.0,
            "date_maj": "2026-02-01", "notes": "update",
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        livrets = self.client.get("/api/livrets").get_json()["livrets"]
        self.assertEqual(livrets[0]["capital"], 12000)

    def test_update_livret_not_found(self):
        r = self.client.put("/api/livrets/9999", json={"nom": "X", "capital": 0, "taux": 0})
        self.assertEqual(r.status_code, 404)

    def test_delete_livret(self):
        livret_id = self._create_livret()
        r = self.client.delete(f"/api/livrets/{livret_id}")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        livrets = self.client.get("/api/livrets").get_json()["livrets"]
        self.assertEqual(len(livrets), 0)

    def test_delete_livret_not_found(self):
        r = self.client.delete("/api/livrets/9999")
        self.assertEqual(r.status_code, 404)

    def test_taux_moyen_pondere(self):
        self._create_livret("A", 10000, 3.0)
        self._create_livret("B", 10000, 5.0)
        data = self.client.get("/api/livrets").get_json()
        # (10000*3 + 10000*5) / 20000 * 100 = 4%
        self.assertAlmostEqual(data["stats"]["taux_moyen_pondere"], 4.0)


class AssuranceVieTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test.db")
        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _create_contrat(self, nom="Linxea Avenir", versements=5000, valeur=5200):
        r = self.client.post("/api/assurance-vie", json={
            "nom": nom, "assureur": "Assureur X", "type_support": "mixte",
            "versements": versements, "valeur_actuelle": valeur,
            "date_maj": "2026-01-01", "notes": "",
        })
        self.assertEqual(r.status_code, 200)
        return r

    def test_create_contrat(self):
        r = self._create_contrat()
        self.assertTrue(r.get_json()["ok"])

    def test_create_contrat_missing_nom_returns_400(self):
        r = self.client.post("/api/assurance-vie", json={"versements": 1000, "valeur_actuelle": 1000})
        self.assertEqual(r.status_code, 400)

    def test_create_contrat_negative_versements_returns_400(self):
        r = self.client.post("/api/assurance-vie", json={
            "nom": "Test", "versements": -100, "valeur_actuelle": 1000,
        })
        self.assertEqual(r.status_code, 400)

    def test_create_contrat_negative_valeur_returns_400(self):
        r = self.client.post("/api/assurance-vie", json={
            "nom": "Test", "versements": 1000, "valeur_actuelle": -100,
        })
        self.assertEqual(r.status_code, 400)

    def test_get_assurance_vie_returns_contrats(self):
        self._create_contrat("Contrat 1", 5000, 5200)
        self._create_contrat("Contrat 2", 3000, 3100)
        r = self.client.get("/api/assurance-vie")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["contrats"]), 2)

    def test_update_contrat(self):
        self._create_contrat("Contrat", 5000, 5200)
        contrats = self.client.get("/api/assurance-vie").get_json()["contrats"]
        contrat_id = contrats[0]["id"]

        r = self.client.put(f"/api/assurance-vie/{contrat_id}", json={
            "nom": "Contrat modifié", "assureur": "Y", "type_support": "fonds_euros",
            "versements": 6000, "valeur_actuelle": 6300,
            "date_maj": "2026-03-01", "notes": "",
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])

    def test_update_contrat_not_found(self):
        r = self.client.put("/api/assurance-vie/9999", json={"nom": "X", "versements": 0, "valeur_actuelle": 0})
        self.assertEqual(r.status_code, 404)

    def test_delete_contrat(self):
        self._create_contrat()
        contrats = self.client.get("/api/assurance-vie").get_json()["contrats"]
        contrat_id = contrats[0]["id"]

        r = self.client.delete(f"/api/assurance-vie/{contrat_id}")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        contrats_after = self.client.get("/api/assurance-vie").get_json()["contrats"]
        self.assertEqual(len(contrats_after), 0)

    def test_delete_contrat_not_found(self):
        r = self.client.delete("/api/assurance-vie/9999")
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
