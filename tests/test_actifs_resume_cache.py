import os
import tempfile
import unittest

os.environ["TOMINO_DISABLE_STARTUP_TASKS"] = "1"

import database as db
import app as app_module


class ActifsResumeCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_actifs_resume.db")

        db.DB_PATH = self.db_path
        app_module.db.DB_PATH = self.db_path
        db.init_db()
        app_module._invalidate_resume_cache()

        self.client = app_module.app.test_client()

        self._original_enrichir_actifs = app_module.prices.enrichir_actifs
        self.enrich_calls = 0

        def fake_enrichir_actifs(actifs):
            self.enrich_calls += 1
            enriched = []
            for a in actifs:
                entry = dict(a)
                q = float(entry.get("quantite") or 0)
                pru = float(entry.get("pru") or 0)
                invest = round(q * pru, 2)
                entry["cours_actuel"] = pru
                entry["valeur_actuelle"] = invest
                entry["valeur_investie"] = invest
                entry["pv_euros"] = 0.0
                entry["pv_pct"] = 0.0
                entry["cours_date"] = "-"
                entry["cours_ok"] = True
                enriched.append(entry)
            return enriched

        app_module.prices.enrichir_actifs = fake_enrichir_actifs

    def _create_actif_cto(self, quantite=10, pru=100):
        create_payload = {
            "enveloppe": "CTO",
            "nom": "Airbus",
            "ticker": "AIR.PA",
            "quantite": quantite,
            "pru": pru,
            "type": "action",
            "categorie": "coeur",
            "date_achat": "2026-01-01",
            "notes": "",
        }
        r_create = self.client.post("/api/actifs", json=create_payload)
        self.assertEqual(r_create.status_code, 200)
        return r_create.get_json()["id"]

    def _create_vente(self, actif_id, quantite=2, prix_unitaire=120, frais=0, date_operation="2026-02-01"):
        payload = {
            "type_operation": "vente",
            "date_operation": date_operation,
            "quantite": quantite,
            "prix_unitaire": prix_unitaire,
            "frais": frais,
        }
        response = self.client.post(f"/api/actifs/{actif_id}/operation", json=payload)
        self.assertEqual(response.status_code, 200)
        mouvements = db.get_mouvements(actif_id=actif_id, limit=1)
        self.assertEqual(len(mouvements), 1)
        return mouvements[0]["id"]

    def tearDown(self):
        app_module.prices.enrichir_actifs = self._original_enrichir_actifs
        self.tmp_dir.cleanup()

    def test_actif_operation_vente_updates_qty_and_realized_pv(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)

        op_payload = {
            "type_operation": "vente",
            "date_operation": "2026-02-01",
            "quantite": 2,
            "prix_unitaire": 120,
            "frais": 0,
        }
        r_op = self.client.post(f"/api/actifs/{actif_id}/operation", json=op_payload)
        self.assertEqual(r_op.status_code, 200)

        data = r_op.get_json()
        self.assertTrue(data.get("ok"))
        self.assertAlmostEqual(float(data["actif"]["quantite"]), 8.0)
        self.assertAlmostEqual(float(data["actif"]["pru"]), 100.0)
        self.assertAlmostEqual(float(data["mouvement"]["pv_realisee"]), 40.0)

    def test_update_achat_mouvement_recalculates_position_and_pru(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)
        mouvements = db.get_mouvements(actif_id=actif_id, limit=10)
        self.assertEqual(len(mouvements), 1)
        achat_id = mouvements[0]["id"]

        update_payload = {
            "date_operation": "2026-01-02",
            "quantite": 12,
            "prix_unitaire": 90,
            "frais": 2,
        }
        response = self.client.put(f"/api/mouvements/{achat_id}", json=update_payload)
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertTrue(data.get("ok"))
        self.assertAlmostEqual(float(data["actif"]["quantite"]), 12.0)
        self.assertAlmostEqual(float(data["actif"]["pru"]), (12 * 90 + 2) / 12, places=4)
        self.assertAlmostEqual(float(data["mouvement"]["montant_net"]), 1082.0)

    def test_delete_achat_mouvement_fails_when_already_consumed_by_vente(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)
        mouvements = db.get_mouvements(actif_id=actif_id, limit=10)
        achat_id = mouvements[0]["id"]

        self._create_vente(actif_id, quantite=6, prix_unitaire=110, frais=0)

        delete_response = self.client.delete(f"/api/mouvements/{achat_id}")
        self.assertEqual(delete_response.status_code, 400)
        self.assertIn("impossible", delete_response.get_json().get("erreur", "").lower())

    def test_delete_achat_mouvement_success_when_not_consumed(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)
        mouvements = db.get_mouvements(actif_id=actif_id, limit=10)
        achat_id = mouvements[0]["id"]

        delete_response = self.client.delete(f"/api/mouvements/{achat_id}")
        self.assertEqual(delete_response.status_code, 200)

        data = delete_response.get_json()
        self.assertTrue(data.get("ok"))
        self.assertAlmostEqual(float(data["actif"]["quantite"]), 0.0)
        self.assertAlmostEqual(float(data["actif"]["pru"]), 0.0)

    def test_update_vente_mouvement_recalculates_qty_and_realized_pv(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)
        vente_id = self._create_vente(actif_id, quantite=2, prix_unitaire=120, frais=0)

        update_payload = {
            "date_operation": "2026-02-03",
            "quantite": 3,
            "prix_unitaire": 130,
            "frais": 1,
        }
        response = self.client.put(f"/api/mouvements/{vente_id}", json=update_payload)
        self.assertEqual(response.status_code, 200)

        data = response.get_json()
        self.assertTrue(data.get("ok"))
        self.assertAlmostEqual(float(data["actif"]["quantite"]), 7.0)
        self.assertAlmostEqual(float(data["actif"]["pru"]), 100.0)
        self.assertAlmostEqual(float(data["mouvement"]["pv_realisee"]), 89.0)

    def test_update_vente_mouvement_rejects_when_qty_exceeds_position(self):
        actif_id = self._create_actif_cto(quantite=10, pru=100)
        vente_id = self._create_vente(actif_id, quantite=2, prix_unitaire=120, frais=0)

        update_payload = {
            "date_operation": "2026-02-04",
            "quantite": 13,
            "prix_unitaire": 130,
            "frais": 0,
        }
        response = self.client.put(f"/api/mouvements/{vente_id}", json=update_payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("superieure", response.get_json().get("erreur", "").lower())

    def test_resume_cache_hits_and_invalidation_after_mutation(self):
        r1 = self.client.get("/api/resume")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(self.enrich_calls, 1)

        r2 = self.client.get("/api/resume")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(self.enrich_calls, 1)

        r_mut = self.client.post(
            "/api/livrets",
            json={
                "nom": "Livret A",
                "capital": 5000,
                "taux": 3.0,
                "date_maj": "2026-03-01",
                "notes": "",
            },
        )
        self.assertEqual(r_mut.status_code, 200)

        r3 = self.client.get("/api/resume")
        self.assertEqual(r3.status_code, 200)
        self.assertEqual(self.enrich_calls, 2)

    def test_resume_cache_invalidation_after_assurance_vie_mutation(self):
        r1 = self.client.get("/api/resume")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(self.enrich_calls, 1)

        r_mut = self.client.post(
            "/api/assurance-vie",
            json={
                "nom": "Contrat test",
                "assureur": "Assureur X",
                "type_support": "mixte",
                "versements": 2500,
                "valeur_actuelle": 2600,
                "date_maj": "2026-03-10",
                "notes": "",
            },
        )
        self.assertEqual(r_mut.status_code, 200)

        r2 = self.client.get("/api/resume")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(self.enrich_calls, 2)


if __name__ == "__main__":
    unittest.main()
