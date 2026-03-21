import os
import tempfile
import unittest

import database as db


class DatabaseFiscalSummaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp_dir.name, "test_fiscal.db")
        db.DB_PATH = self.db_path
        db.init_db()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_fiscal_summary_returns_expected_totals_and_missing(self):
        db.add_dividende({
            "ticker": "AIR.PA",
            "nom": "Airbus",
            "montant": 100.0,
            "montant_brut": 100.0,
            "retenue_source": 15.0,
            "montant_net": 85.0,
            "pays_source": "France",
            "devise_source": "EUR",
            "date_versement": "2026-03-01",
            "enveloppe": "CTO",
            "notes": "",
        })

        db.add_dividende({
            "ticker": "CW8.PA",
            "nom": "ETF World",
            "montant": 50.0,
            "montant_brut": 50.0,
            "retenue_source": 0.0,
            "montant_net": 50.0,
            "pays_source": "",
            "devise_source": "EUR",
            "date_versement": "2026-03-10",
            "enveloppe": "",
            "notes": "",
        })

        db.add_actif({
            "enveloppe": "CTO",
            "nom": "Airbus",
            "ticker": "AIR.PA",
            "quantite": 2.0,
            "pru": 80.0,
            "type": "action",
            "categorie": "coeur",
            "date_achat": "2026-01-01",
            "notes": "",
        })
        actif_id = db.get_actifs("CTO")[0]["id"]

        db.add_mouvement({
            "actif_id": actif_id,
            "enveloppe": "CTO",
            "type_operation": "vente",
            "date_operation": "2026-04-01",
            "quantite": 1.0,
            "prix_unitaire": 100.0,
            "frais": 0.0,
            "montant_brut": 100.0,
            "montant_net": 100.0,
            "pv_realisee": 20.0,
        })

        summary = db.get_fiscal_summary(2026)

        self.assertEqual(summary["annee"], 2026)
        self.assertAlmostEqual(summary["dividendes"]["total_brut"], 150.0)
        self.assertAlmostEqual(summary["dividendes"]["total_retenue_source"], 15.0)
        self.assertAlmostEqual(summary["dividendes"]["total_net"], 135.0)
        self.assertEqual(summary["dividendes"]["nb"], 2)

        self.assertEqual(summary["manquants"]["dividendes"]["sans_pays"], 1)
        self.assertEqual(summary["manquants"]["dividendes"]["sans_enveloppe"], 1)

        ifu_div = summary["reconciliation_ifu"]["dividendes"]
        self.assertAlmostEqual(ifu_div["montant_brut_theorique"], 150.0)
        self.assertAlmostEqual(ifu_div["retenue_source_theorique"], 15.0)
        self.assertAlmostEqual(ifu_div["montant_net_theorique"], 135.0)

        ifu_cessions = summary["reconciliation_ifu"]["cessions"]
        self.assertAlmostEqual(ifu_cessions["pv_theorique"], 20.0)
        self.assertAlmostEqual(ifu_cessions["mv_theorique"], 0.0)
        self.assertAlmostEqual(ifu_cessions["solde_theorique"], 20.0)


if __name__ == "__main__":
    unittest.main()
