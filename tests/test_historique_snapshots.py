import os
import tempfile
import unittest

import database as db


class HistoriqueSnapshotsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = db.DB_PATH
        db.DB_PATH = os.path.join(self.tmp_dir.name, "test_historique.db")
        db.init_db()

    def tearDown(self):
        db.DB_PATH = self.original_db_path
        self.tmp_dir.cleanup()

    def test_historique_has_assurance_vie_column(self):
        conn = db.get_db()
        rows = conn.execute("PRAGMA table_info(historique)").fetchall()
        conn.close()

        columns = {row[1] for row in rows}
        self.assertIn("valeur_assurance_vie", columns)

    def test_save_snapshot_updates_same_date(self):
        date_value = "2026-03-18"

        db.save_snapshot(
            {
                "totale": 10000,
                "pea": 3000,
                "cto": 2000,
                "or_": 1000,
                "livrets": 2500,
                "assurance_vie": 1500,
            },
            snapshot_date=date_value,
        )

        db.save_snapshot(
            {
                "totale": 12000,
                "pea": 3500,
                "cto": 2100,
                "or_": 900,
                "livrets": 2700,
                "assurance_vie": 2800,
            },
            snapshot_date=date_value,
        )

        historique = db.get_historique(limit=10)
        self.assertEqual(len(historique), 1)
        self.assertEqual(historique[0]["date"], date_value)
        self.assertAlmostEqual(float(historique[0]["valeur_totale"]), 12000.0)
        self.assertAlmostEqual(float(historique[0]["valeur_assurance_vie"]), 2800.0)

    def test_get_historique_returns_latest_points_sorted(self):
        for idx in range(1, 6):
            db.save_snapshot(
                {
                    "totale": idx * 100,
                    "pea": idx * 10,
                    "cto": idx * 20,
                    "or_": idx * 5,
                    "livrets": idx * 15,
                    "assurance_vie": idx * 12,
                },
                snapshot_date=f"2026-03-0{idx}",
            )

        historique = db.get_historique(limit=3)
        self.assertEqual([row["date"] for row in historique], ["2026-03-03", "2026-03-04", "2026-03-05"])
        self.assertEqual([int(row["valeur_totale"]) for row in historique], [300, 400, 500])


if __name__ == "__main__":
    unittest.main()
