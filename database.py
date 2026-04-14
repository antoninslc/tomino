import sqlite3
import os
import sys
import json
import datetime
import uuid
import threading

def get_data_dir():
    if getattr(sys, 'frozen', False):
        app_data = os.getenv('APPDATA', os.path.expanduser('~'))
        data_dir = os.path.join(app_data, 'Tomino')
        os.makedirs(data_dir, exist_ok=True)
        return data_dir
    return os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(get_data_dir(), "patrimoine.db")

ENVELOPPES = {
    "PEA":    {"label": "PEA",     "icon": "📈", "color": "#4ade80"},
    "CTO":    {"label": "CTO",     "icon": "💹", "color": "#60a5fa"},
    "OR":     {"label": "Or",      "icon": "🪙", "color": "#fbbf24"},
    "LIVRET": {"label": "Livrets", "icon": "🏦", "color": "#a78bfa"},
}

DEFAULT_PROFIL = {
    "id": 1,
    "horizon": "long",
    "risque": "equilibre",
    "objectif": "croissance",
    "strategie": "mixte",
    "style_ia": "detaille",
    "ton_ia": "informel",
    "secteurs_exclus": [],
    "pays_exclus": [],
    "benchmark": "CW8.PA",
    "tier": "tomino_plus",    # "free" | "tomino_plus" — tomino_plus par défaut (pas de monétisation)
    "is_demo": 0,
}

SCHEMA_VERSION = 10
SCHEMA_MIN_IMPORT_VERSION = 1

_SYNC_ACTOR = threading.local()

SYNC_ALLOWED_ENTITIES = {
    "actifs": {"table": "actifs", "pk": "id"},
    "livrets": {"table": "livrets", "pk": "id"},
    "assurance_vie": {"table": "assurance_vie", "pk": "id"},
    "dividendes": {"table": "dividendes", "pk": "id"},
    "alertes": {"table": "alertes", "pk": "id"},
    "comptes_etrangers": {"table": "comptes_etrangers", "pk": "id"},
    "mouvements": {"table": "mouvements", "pk": "id"},
    "profil": {"table": "profil", "pk": "id"},
}

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _utc_sql_now() -> str:
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")


def _normalize_tier(value: str) -> str:
    tier = str(value or "free").strip().lower()
    if tier in ("tier1", "tier2", "tomino_plus", "tomino+", "plus"):
        return "tomino_plus"
    return "free"


def set_sync_actor(user_id=None, device_id=None):
    _SYNC_ACTOR.user_id = int(user_id) if user_id is not None else None
    _SYNC_ACTOR.device_id = str(device_id or "").strip() or None


def clear_sync_actor():
    _SYNC_ACTOR.user_id = None
    _SYNC_ACTOR.device_id = None


def _get_sync_actor():
    return {
        "user_id": getattr(_SYNC_ACTOR, "user_id", None),
        "device_id": getattr(_SYNC_ACTOR, "device_id", None),
    }


def _ensure_sync_events_table(conn):
    cols = conn.execute("PRAGMA table_info(sync_events)").fetchall()
    col_names = {str(c[1]) for c in cols}

    needs_rebuild = ("user_id" not in col_names) or ("device_id" not in col_names)
    if needs_rebuild and cols:
        conn.execute("ALTER TABLE sync_events RENAME TO sync_events_legacy")

    if needs_rebuild:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sync_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                device_id TEXT,
                event_uid TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT NOT NULL,
                event_at TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'local',
                applied INTEGER NOT NULL DEFAULT 1,
                conflict_reason TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        legacy_exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_events_legacy'"
        ).fetchone()
        if legacy_exists:
            conn.execute(
                """
                INSERT INTO sync_events (
                    id, user_id, device_id, event_uid, entity_type, entity_id,
                    operation, payload, event_at, source, applied, conflict_reason, created_at
                )
                SELECT
                    id, NULL AS user_id, NULL AS device_id, event_uid, entity_type, entity_id,
                    operation, payload, event_at, source, applied, conflict_reason, created_at
                FROM sync_events_legacy
                """
            )
            conn.execute("DROP TABLE sync_events_legacy")
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sync_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                device_id TEXT,
                event_uid TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT NOT NULL,
                event_at TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'local',
                applied INTEGER NOT NULL DEFAULT 1,
                conflict_reason TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_events_id ON sync_events(id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events(user_id, entity_type, entity_id, id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_events_event_at ON sync_events(user_id, event_at)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_user_uid ON sync_events(user_id, event_uid)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_null_user_uid ON sync_events(event_uid) WHERE user_id IS NULL")


def _ensure_meta_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tomino_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)


def get_schema_version(conn=None):
    own_conn = conn is None
    current_conn = conn or get_db()
    try:
        _ensure_meta_table(current_conn)
        row = current_conn.execute("SELECT value FROM tomino_meta WHERE key='schema_version'").fetchone()
        if not row:
            return 0
        try:
            return int(row[0])
        except Exception:
            return 0
    finally:
        if own_conn:
            current_conn.close()


def set_schema_version(version, conn=None):
    own_conn = conn is None
    current_conn = conn or get_db()
    try:
        _ensure_meta_table(current_conn)
        current_conn.execute(
            """
            INSERT INTO tomino_meta (key, value, updated_at)
            VALUES ('schema_version', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
            """,
            (str(int(version)),),
        )
        if own_conn:
            current_conn.commit()
    finally:
        if own_conn:
            current_conn.close()


def get_meta(key: str) -> str | None:
    conn = get_db()
    try:
        _ensure_meta_table(conn)
        row = conn.execute("SELECT value FROM tomino_meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def set_meta(key: str, value: str) -> None:
    conn = get_db()
    try:
        _ensure_meta_table(conn)
        conn.execute(
            """
            INSERT INTO tomino_meta (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
            """,
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


def _sync_iso_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_sync_event_at(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return _sync_iso_now()
    try:
        if raw.endswith("Z"):
            dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:
            dt = datetime.datetime.fromisoformat(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:
        return _sync_iso_now()


def _sync_event_to_epoch(value) -> float:
    try:
        norm = _normalize_sync_event_at(value)
        return datetime.datetime.fromisoformat(norm.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def _sync_table_columns(conn, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(r[1]) for r in rows}


def _sync_get_entity_spec(entity_type: str):
    return SYNC_ALLOWED_ENTITIES.get(str(entity_type or "").strip())


def _sync_fetch_row_by_id(conn, entity_type: str, entity_id):
    spec = _sync_get_entity_spec(entity_type)
    if not spec:
        return None
    table_name = spec["table"]
    pk_name = spec["pk"]
    row = conn.execute(
        f"SELECT * FROM {table_name} WHERE {pk_name}=?",
        (entity_id,),
    ).fetchone()
    return dict(row) if row else None


def _insert_sync_event(
    conn,
    *,
    user_id=None,
    device_id: str | None = None,
    entity_type: str,
    entity_id,
    operation: str,
    payload: dict | None,
    source: str = "local",
    event_at: str | None = None,
    event_uid: str | None = None,
    applied: int = 1,
    conflict_reason: str | None = None,
):
    uid = str(event_uid or uuid.uuid4().hex).strip() or uuid.uuid4().hex
    op = str(operation or "").strip().lower()
    if op not in ("upsert", "delete"):
        raise ValueError("operation sync invalide")

    spec = _sync_get_entity_spec(entity_type)
    if not spec:
        raise ValueError("entity_type sync invalide")

    safe_payload = payload if isinstance(payload, dict) else {}
    payload_json = json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":"))
    ts = _normalize_sync_event_at(event_at)
    actor_user_id = int(user_id) if user_id is not None else None
    actor_device_id = str(device_id or "").strip() or None

    if actor_user_id is not None:
        already = conn.execute(
            "SELECT id FROM sync_events WHERE user_id=? AND event_uid=? LIMIT 1",
            (actor_user_id, uid),
        ).fetchone()
    else:
        already = conn.execute(
            "SELECT id FROM sync_events WHERE user_id IS NULL AND event_uid=? LIMIT 1",
            (uid,),
        ).fetchone()
    if already:
        return {"inserted": False, "event_uid": uid, "event_id": int(already[0])}

    try:
        cur = conn.execute(
            """
            INSERT INTO sync_events (
                user_id, device_id, event_uid, entity_type, entity_id, operation,
                payload, event_at, source, applied, conflict_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                actor_user_id,
                actor_device_id,
                uid,
                str(entity_type),
                str(entity_id),
                op,
                payload_json,
                ts,
                str(source or "local"),
                1 if int(applied or 0) else 0,
                str(conflict_reason or "").strip() or None,
            ),
        )
        return {"inserted": True, "event_uid": uid, "event_id": int(cur.lastrowid)}
    except sqlite3.IntegrityError:
        if actor_user_id is not None:
            row = conn.execute("SELECT id FROM sync_events WHERE user_id=? AND event_uid=?", (actor_user_id, uid)).fetchone()
        else:
            row = conn.execute("SELECT id FROM sync_events WHERE user_id IS NULL AND event_uid=?", (uid,)).fetchone()
        return {"inserted": False, "event_uid": uid, "event_id": int(row[0]) if row else None}


def _record_sync_upsert(conn, entity_type: str, entity_id, source: str = "local", user_id=None, device_id: str | None = None):
    snapshot = _sync_fetch_row_by_id(conn, entity_type, entity_id)
    if snapshot is None:
        return None
    actor = _get_sync_actor()
    return _insert_sync_event(
        conn,
        user_id=user_id if user_id is not None else actor["user_id"],
        device_id=device_id if device_id is not None else actor["device_id"],
        entity_type=entity_type,
        entity_id=entity_id,
        operation="upsert",
        payload=snapshot,
        source=source,
    )


def _record_sync_delete(conn, entity_type: str, entity_id, source: str = "local", user_id=None, device_id: str | None = None):
    actor = _get_sync_actor()
    return _insert_sync_event(
        conn,
        user_id=user_id if user_id is not None else actor["user_id"],
        device_id=device_id if device_id is not None else actor["device_id"],
        entity_type=entity_type,
        entity_id=entity_id,
        operation="delete",
        payload={"id": entity_id},
        source=source,
    )


def _latest_applied_event_at(conn, entity_type: str, entity_id, user_id=None):
    if user_id is None:
        row = conn.execute(
            """
            SELECT event_at
            FROM sync_events
            WHERE user_id IS NULL AND entity_type=? AND entity_id=? AND applied=1
            ORDER BY id DESC
            LIMIT 1
            """,
            (str(entity_type), str(entity_id)),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT event_at
            FROM sync_events
            WHERE user_id=? AND entity_type=? AND entity_id=? AND applied=1
            ORDER BY id DESC
            LIMIT 1
            """,
            (int(user_id), str(entity_type), str(entity_id)),
        ).fetchone()
    return str(row[0]) if row and row[0] else ""


def _upsert_row_from_payload(conn, entity_type: str, entity_id, payload: dict):
    spec = _sync_get_entity_spec(entity_type)
    if not spec:
        raise ValueError("entity_type sync invalide")
    table_name = spec["table"]
    pk_name = spec["pk"]

    incoming = payload if isinstance(payload, dict) else {}
    columns = _sync_table_columns(conn, table_name)

    try:
        entity_id_int = int(entity_id)
        row_pk = entity_id_int
    except Exception:
        row_pk = entity_id

    record = {k: v for k, v in incoming.items() if k in columns}
    record[pk_name] = record.get(pk_name, row_pk)

    ordered_cols = [c for c in record.keys() if c in columns]
    if not ordered_cols:
        return

    placeholders = ",".join([f":{col}" for col in ordered_cols])
    updates = [f"{col}=excluded.{col}" for col in ordered_cols if col != pk_name]
    update_sql = ", ".join(updates) if updates else f"{pk_name}=excluded.{pk_name}"

    conn.execute(
        f"""
        INSERT INTO {table_name} ({','.join(ordered_cols)})
        VALUES ({placeholders})
        ON CONFLICT({pk_name}) DO UPDATE SET {update_sql}
        """,
        {col: record[col] for col in ordered_cols},
    )


def _delete_row_from_entity(conn, entity_type: str, entity_id):
    spec = _sync_get_entity_spec(entity_type)
    if not spec:
        raise ValueError("entity_type sync invalide")
    table_name = spec["table"]
    pk_name = spec["pk"]
    conn.execute(f"DELETE FROM {table_name} WHERE {pk_name}=?", (entity_id,))

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS actifs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enveloppe TEXT NOT NULL,
            nom TEXT NOT NULL,
            ticker TEXT,
            quantite REAL NOT NULL DEFAULT 0,
            pru REAL NOT NULL DEFAULT 0,
            type TEXT DEFAULT 'action',
            categorie TEXT DEFAULT 'coeur',
            date_achat TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS livrets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            capital REAL NOT NULL DEFAULT 0,
            taux REAL NOT NULL DEFAULT 0,
            date_maj TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS assurance_vie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            assureur TEXT,
            type_support TEXT DEFAULT 'mixte',
            versements REAL NOT NULL DEFAULT 0,
            valeur_actuelle REAL NOT NULL DEFAULT 0,
            date_maj TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS historique (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            valeur_totale REAL,
            valeur_pea REAL,
            valeur_cto REAL,
            valeur_or REAL,
            valeur_livrets REAL,
            valeur_assurance_vie REAL,
            valeur_investie REAL
        )
    """)

    try:
        c.execute("ALTER TABLE historique ADD COLUMN valeur_assurance_vie REAL")
    except Exception:
        pass
    try:
        c.execute("ALTER TABLE historique ADD COLUMN valeur_investie REAL")
    except Exception:
        pass
    for col in ("valeur_pea_investie", "valeur_cto_investie", "valeur_or_investie"):
        try:
            c.execute(f"ALTER TABLE historique ADD COLUMN {col} REAL")
        except Exception:
            pass

    c.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT DEFAULT (datetime('now')),
            type_analyse TEXT,
            contexte TEXT,
            reponse TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS profil (
            id INTEGER PRIMARY KEY DEFAULT 1,
            horizon TEXT DEFAULT 'long',
            risque TEXT DEFAULT 'equilibre',
            objectif TEXT DEFAULT 'croissance',
            strategie TEXT DEFAULT 'mixte',
            style_ia TEXT DEFAULT 'detaille',
            ton_ia TEXT DEFAULT 'informel',
            secteurs_exclus TEXT DEFAULT '[]',
            pays_exclus TEXT DEFAULT '[]',
            benchmark TEXT DEFAULT 'CW8.PA',
            tier TEXT DEFAULT 'tomino_plus',
            is_demo INTEGER DEFAULT 0
        )
    """)

    # Migration : ajout colonne tier si absente (bases existantes)
    try:
        c.execute("ALTER TABLE profil ADD COLUMN tier TEXT DEFAULT 'tomino_plus'")
    except Exception:
        pass

    # Migration : passer tous les profils free → tomino_plus (pas de monétisation)
    try:
        c.execute("UPDATE profil SET tier = 'tomino_plus' WHERE tier = 'free' OR tier IS NULL")
    except Exception:
        pass

    # Migration : ajout colonne is_demo si absente
    try:
        c.execute("ALTER TABLE profil ADD COLUMN is_demo INTEGER DEFAULT 0")
    except Exception:
        pass


    c.execute("""
        CREATE TABLE IF NOT EXISTS dividendes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            nom TEXT NOT NULL,
            montant REAL NOT NULL,
            montant_brut REAL,
            retenue_source REAL,
            montant_net REAL,
            pays_source TEXT,
            devise_source TEXT,
            date_versement TEXT NOT NULL,
            enveloppe TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS alertes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            nom TEXT,
            type_alerte TEXT NOT NULL,
            seuil REAL NOT NULL,
            active INTEGER DEFAULT 1,
            declenchee_le TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS comptes_etrangers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            etablissement TEXT NOT NULL,
            pays TEXT NOT NULL,
            adresse TEXT,
            etablissement_ville TEXT,
            etablissement_code_postal TEXT,
            etablissement_identifiant TEXT,
            numero_compte TEXT,
            date_ouverture TEXT,
            date_cloture TEXT,
            type_compte TEXT DEFAULT 'titres',
            type_compte_detail TEXT,
            titulaire TEXT DEFAULT 'titulaire',
            titulaire_nom TEXT,
            co_titulaire_nom TEXT,
            detention_mode TEXT DEFAULT 'directe',
            actif_numerique INTEGER DEFAULT 0,
            plateforme_actifs_numeriques TEXT,
            wallet_adresse TEXT,
            commentaire TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Migration rétrocompatible comptes_etrangers
    for ddl in [
        "ALTER TABLE comptes_etrangers ADD COLUMN etablissement_ville TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN etablissement_code_postal TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN etablissement_identifiant TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN type_compte_detail TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN titulaire_nom TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN co_titulaire_nom TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN detention_mode TEXT DEFAULT 'directe'",
        "ALTER TABLE comptes_etrangers ADD COLUMN actif_numerique INTEGER DEFAULT 0",
        "ALTER TABLE comptes_etrangers ADD COLUMN plateforme_actifs_numeriques TEXT",
        "ALTER TABLE comptes_etrangers ADD COLUMN wallet_adresse TEXT",
    ]:
        try:
            c.execute(ddl)
        except Exception:
            pass

    # Migration rétrocompatible dividendes
    for ddl in [
        "ALTER TABLE dividendes ADD COLUMN montant_brut REAL",
        "ALTER TABLE dividendes ADD COLUMN retenue_source REAL",
        "ALTER TABLE dividendes ADD COLUMN montant_net REAL",
        "ALTER TABLE dividendes ADD COLUMN pays_source TEXT",
        "ALTER TABLE dividendes ADD COLUMN devise_source TEXT",
    ]:
        try:
            c.execute(ddl)
        except Exception:
            pass

    c.execute("""
        CREATE TABLE IF NOT EXISTS mouvements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actif_id INTEGER NOT NULL,
            enveloppe TEXT NOT NULL,
            type_operation TEXT NOT NULL,
            date_operation TEXT,
            quantite REAL NOT NULL,
            prix_unitaire REAL NOT NULL,
            frais REAL NOT NULL DEFAULT 0,
            montant_brut REAL NOT NULL,
            montant_net REAL NOT NULL,
            pv_realisee REAL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS ia_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            tier TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_eur REAL NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    _ensure_sync_events_table(conn)

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            auth_provider TEXT NOT NULL DEFAULT 'local',
            provider_user_id TEXT,
            tier TEXT NOT NULL DEFAULT 'free',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Migration: colonnes provider auth pour transition progressive vers un provider tiers.
    for ddl in [
        "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'",
        "ALTER TABLE users ADD COLUMN provider_user_id TEXT",
    ]:
        try:
            c.execute(ddl)
        except Exception:
            pass
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider)")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity ON users(auth_provider, provider_user_id)")

    c.execute("""
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            tier TEXT NOT NULL DEFAULT 'free',
            status TEXT NOT NULL DEFAULT 'active',
            current_period_end TEXT,
            metadata_json TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(provider, provider_subscription_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id, updated_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_subscriptions_customer ON user_subscriptions(provider, provider_customer_id)")

    c.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            device_id TEXT,
            device_label TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            revoked_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    try:
        c.execute("ALTER TABLE user_sessions ADD COLUMN device_id TEXT")
    except Exception:
        pass

    c.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            device_label TEXT,
            sync_paused INTEGER NOT NULL DEFAULT 0,
            last_sync_cursor INTEGER NOT NULL DEFAULT 0,
            last_seen_at TEXT DEFAULT (datetime('now')),
            revoked_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, device_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id, updated_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_devices_revoked ON devices(user_id, revoked_at)")

    c.execute("""
        CREATE TABLE IF NOT EXISTS auth_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            user_id INTEGER,
            email TEXT,
            device_id TEXT,
            ip_address TEXT,
            ok INTEGER NOT NULL DEFAULT 0,
            reason TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_logs(created_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_logs(user_id, created_at DESC)")

    c.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at)")

    c.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)")

    # Métadonnées de schéma pour piloter la compatibilité import/export des backups.
    _ensure_meta_table(conn)
    set_schema_version(SCHEMA_VERSION, conn=conn)

    conn.commit()
    conn.close()


def get_sync_events(since_id=0, limit=200, include_skipped=False, user_id=None):
    conn = get_db()
    try:
        safe_since = max(0, int(since_id or 0))
    except Exception:
        safe_since = 0
    try:
        safe_limit = int(limit or 200)
    except Exception:
        safe_limit = 200
    safe_limit = min(max(safe_limit, 1), 1000)

    sql = """
        SELECT id, user_id, device_id, event_uid, entity_type, entity_id, operation, payload, event_at, source, applied, conflict_reason, created_at
        FROM sync_events
        WHERE id > ?
    """
    params = [safe_since]
    if user_id is None:
        sql += " AND user_id IS NULL"
    else:
        sql += " AND user_id=?"
        params.append(int(user_id))
    if not include_skipped:
        sql += " AND applied=1"
    sql += " ORDER BY id ASC LIMIT ?"
    params.append(safe_limit)

    rows = conn.execute(sql, tuple(params)).fetchall()
    result = []
    for r in rows:
        payload = {}
        try:
            payload = json.loads(r[7]) if r[7] else {}
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}
        result.append({
            "id": int(r[0]),
            "user_id": int(r[1]) if r[1] is not None else None,
            "device_id": str(r[2] or ""),
            "event_uid": str(r[3] or ""),
            "entity_type": str(r[4] or ""),
            "entity_id": str(r[5] or ""),
            "operation": str(r[6] or ""),
            "payload": payload,
            "event_at": str(r[8] or ""),
            "source": str(r[9] or "local"),
            "applied": bool(int(r[10] or 0)),
            "conflict_reason": str(r[11] or ""),
            "created_at": str(r[12] or ""),
        })
    conn.close()
    return result


def get_user_by_email(email: str):
    safe_email = str(email or "").strip().lower()
    if not safe_email:
        return None
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email=?", (safe_email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_user(
    email: str,
    password_hash: str,
    tier: str = "free",
    auth_provider: str = "local",
    provider_user_id: str | None = None,
):
    safe_email = str(email or "").strip().lower()
    safe_hash = str(password_hash or "").strip()
    safe_tier = _normalize_tier(tier)
    safe_provider = str(auth_provider or "local").strip().lower() or "local"
    safe_provider_user_id = str(provider_user_id or "").strip() or None
    if safe_provider not in ("local", "supabase", "oidc"):
        safe_provider = "local"
    if safe_provider == "local":
        safe_provider_user_id = None

    conn = get_db()
    cur = conn.execute(
        """
        INSERT INTO users (email, password_hash, auth_provider, provider_user_id, tier, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """,
        (safe_email, safe_hash, safe_provider, safe_provider_user_id, safe_tier),
    )
    conn.commit()
    user_id = int(cur.lastrowid)
    conn.close()
    return get_user_by_id(user_id)


def get_user_by_provider_identity(auth_provider: str, provider_user_id: str):
    safe_provider = str(auth_provider or "").strip().lower()
    safe_provider_user_id = str(provider_user_id or "").strip()
    if not safe_provider or not safe_provider_user_id:
        return None
    conn = get_db()
    row = conn.execute(
        """
        SELECT *
        FROM users
        WHERE auth_provider=? AND provider_user_id=?
        LIMIT 1
        """,
        (safe_provider, safe_provider_user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def link_user_provider_identity(user_id: int, auth_provider: str, provider_user_id: str):
    safe_provider = str(auth_provider or "").strip().lower()
    safe_provider_user_id = str(provider_user_id or "").strip()
    if safe_provider not in ("supabase", "oidc"):
        raise ValueError("Provider auth invalide pour le lien d'identité.")
    if not safe_provider_user_id:
        raise ValueError("provider_user_id requis.")

    conn = get_db()
    cur = conn.execute(
        """
        UPDATE users
        SET auth_provider=?, provider_user_id=?, updated_at=datetime('now')
        WHERE id=?
        """,
        (safe_provider, safe_provider_user_id, int(user_id)),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    conn.close()
    if not changed:
        return None
    return get_user_by_id(int(user_id))


def update_user_tier(user_id: int, tier: str):
    safe_tier = _normalize_tier(tier)
    conn = get_db()
    cur = conn.execute(
        """
        UPDATE users
        SET tier=?, updated_at=datetime('now')
        WHERE id=?
        """,
        (safe_tier, int(user_id)),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    conn.close()
    if not changed:
        return None
    return get_user_by_id(int(user_id))


def update_user_password_hash(user_id: int, password_hash: str):
    safe_hash = str(password_hash or "").strip()
    if not safe_hash:
        raise ValueError("Mot de passe invalide.")

    conn = get_db()
    cur = conn.execute(
        """
        UPDATE users
        SET password_hash=?, updated_at=datetime('now')
        WHERE id=?
        """,
        (safe_hash, int(user_id)),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    conn.close()
    if not changed:
        return None
    return get_user_by_id(int(user_id))


def create_password_reset_token(user_id: int, token_hash: str, expires_at: str):
    safe_hash = str(token_hash or "").strip()
    safe_expires = str(expires_at or "").strip()
    if not safe_hash or not safe_expires:
        raise ValueError("Token de réinitialisation invalide.")

    conn = get_db()
    conn.execute(
        """
        UPDATE password_reset_tokens
        SET used_at=datetime('now')
        WHERE user_id=? AND used_at IS NULL
        """,
        (int(user_id),),
    )
    conn.execute(
        """
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at, created_at)
        VALUES (?, ?, ?, NULL, datetime('now'))
        """,
        (int(user_id), safe_hash, safe_expires),
    )
    conn.commit()
    conn.close()


def get_password_reset_token(token_hash: str):
    safe_hash = str(token_hash or "").strip()
    if not safe_hash:
        return None
    conn = get_db()
    row = conn.execute(
        """
        SELECT *
        FROM password_reset_tokens
        WHERE token_hash=?
        LIMIT 1
        """,
        (safe_hash,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def mark_password_reset_token_used(token_hash: str):
    safe_hash = str(token_hash or "").strip()
    if not safe_hash:
        return False
    conn = get_db()
    cur = conn.execute(
        """
        UPDATE password_reset_tokens
        SET used_at=datetime('now')
        WHERE token_hash=? AND used_at IS NULL
        """,
        (safe_hash,),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    conn.close()
    return changed


def get_user_subscription(user_id: int):
    conn = get_db()
    row = conn.execute(
        """
        SELECT *
        FROM user_subscriptions
        WHERE user_id=?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """,
        (int(user_id),),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_subscription_by_provider_customer(provider: str, customer_id: str):
    safe_provider = str(provider or "").strip().lower()
    safe_customer_id = str(customer_id or "").strip()
    if not safe_provider or not safe_customer_id:
        return None
    conn = get_db()
    row = conn.execute(
        """
        SELECT *
        FROM user_subscriptions
        WHERE provider=? AND provider_customer_id=?
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        (safe_provider, safe_customer_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_subscription_by_provider_subscription(provider: str, provider_subscription_id: str):
    safe_provider = str(provider or "").strip().lower()
    safe_sub_id = str(provider_subscription_id or "").strip()
    if not safe_provider or not safe_sub_id:
        return None
    conn = get_db()
    row = conn.execute(
        """
        SELECT *
        FROM user_subscriptions
        WHERE provider=? AND provider_subscription_id=?
        LIMIT 1
        """,
        (safe_provider, safe_sub_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_user_subscription(
    user_id: int,
    *,
    provider: str,
    tier: str,
    status: str,
    provider_customer_id: str | None = None,
    provider_subscription_id: str | None = None,
    current_period_end: str | None = None,
    metadata: dict | None = None,
):
    safe_provider = str(provider or "local").strip().lower() or "local"
    safe_tier = _normalize_tier(tier)
    safe_status = str(status or "active").strip().lower() or "active"
    safe_customer_id = str(provider_customer_id or "").strip() or None
    safe_subscription_id = str(provider_subscription_id or "").strip() or None
    safe_period_end = str(current_period_end or "").strip() or None
    metadata_json = json.dumps(metadata if isinstance(metadata, dict) else {}, ensure_ascii=False, separators=(",", ":"))

    conn = get_db()
    if safe_subscription_id:
        conn.execute(
            """
            INSERT INTO user_subscriptions (
                user_id, provider, provider_customer_id, provider_subscription_id,
                tier, status, current_period_end, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
                user_id=excluded.user_id,
                provider_customer_id=excluded.provider_customer_id,
                tier=excluded.tier,
                status=excluded.status,
                current_period_end=excluded.current_period_end,
                metadata_json=excluded.metadata_json,
                updated_at=datetime('now')
            """,
            (
                int(user_id),
                safe_provider,
                safe_customer_id,
                safe_subscription_id,
                safe_tier,
                safe_status,
                safe_period_end,
                metadata_json,
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO user_subscriptions (
                user_id, provider, provider_customer_id, provider_subscription_id,
                tier, status, current_period_end, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                int(user_id),
                safe_provider,
                safe_customer_id,
                safe_tier,
                safe_status,
                safe_period_end,
                metadata_json,
            ),
        )
    conn.commit()
    conn.close()
    return get_user_subscription(int(user_id))


def create_user_session(
    user_id: int,
    token_hash: str,
    expires_at: str,
    device_label: str | None = None,
    device_id: str | None = None,
):
    conn = get_db()
    cur = conn.execute(
        """
        INSERT INTO user_sessions (user_id, token_hash, device_id, device_label, created_at, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, datetime('now'), ?, NULL)
        """,
        (
            int(user_id),
            str(token_hash),
            str(device_id or "").strip() or None,
            str(device_label or "").strip() or None,
            str(expires_at),
        ),
    )
    conn.commit()
    session_id = int(cur.lastrowid)
    row = conn.execute("SELECT * FROM user_sessions WHERE id=?", (session_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_user_session(token_hash: str):
    safe_hash = str(token_hash or "").strip()
    if not safe_hash:
        return None
    conn = get_db()
    row = conn.execute(
        """
                SELECT
                        s.*,
                        u.email,
                        u.tier,
                        d.sync_paused AS device_sync_paused,
                        d.revoked_at AS device_revoked_at,
                        d.last_sync_cursor AS device_last_sync_cursor,
                        d.last_seen_at AS device_last_seen_at,
                        COALESCE(d.device_label, s.device_label) AS device_label_effective
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
                LEFT JOIN devices d ON d.user_id = s.user_id AND d.device_id = s.device_id
        WHERE s.token_hash=?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
                    AND (s.device_id IS NULL OR d.revoked_at IS NULL)
        LIMIT 1
        """,
        (safe_hash, _utc_sql_now()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def revoke_user_session(token_hash: str):
    safe_hash = str(token_hash or "").strip()
    if not safe_hash:
        return False
    conn = get_db()
    cur = conn.execute(
        """
        UPDATE user_sessions
        SET revoked_at=datetime('now')
        WHERE token_hash=? AND revoked_at IS NULL
        """,
        (safe_hash,),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    conn.close()
    return changed


def revoke_all_user_sessions(user_id: int, except_token_hash: str | None = None):
    conn = get_db()
    if str(except_token_hash or "").strip():
        cur = conn.execute(
            """
            UPDATE user_sessions
            SET revoked_at=datetime('now')
            WHERE user_id=?
              AND revoked_at IS NULL
              AND token_hash != ?
            """,
            (int(user_id), str(except_token_hash).strip()),
        )
    else:
        cur = conn.execute(
            """
            UPDATE user_sessions
            SET revoked_at=datetime('now')
            WHERE user_id=?
              AND revoked_at IS NULL
            """,
            (int(user_id),),
        )
    conn.commit()
    changed = int(cur.rowcount or 0)
    conn.close()
    return changed


def rotate_user_sessions(user_id: int, keep_latest: int = 8):
    safe_keep = max(1, int(keep_latest or 8))
    conn = get_db()
    active_rows = conn.execute(
        """
        SELECT id
        FROM user_sessions
        WHERE user_id=?
          AND revoked_at IS NULL
          AND expires_at > ?
        ORDER BY created_at DESC, id DESC
        """,
        (int(user_id), _utc_sql_now()),
    ).fetchall()

    if len(active_rows) <= safe_keep:
        conn.close()
        return 0

    stale_ids = [int(r[0]) for r in active_rows[safe_keep:]]
    placeholders = ",".join(["?" for _ in stale_ids])
    conn.execute(
        f"UPDATE user_sessions SET revoked_at=datetime('now') WHERE id IN ({placeholders})",
        tuple(stale_ids),
    )
    conn.commit()
    conn.close()
    return len(stale_ids)


def add_auth_audit_log(event_type: str, user_id=None, email: str | None = None, device_id: str | None = None, ip_address: str | None = None, ok: bool = False, reason: str | None = None):
    conn = get_db()
    conn.execute(
        """
        INSERT INTO auth_audit_logs (event_type, user_id, email, device_id, ip_address, ok, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            str(event_type or "unknown"),
            int(user_id) if user_id is not None else None,
            str(email or "").strip().lower() or None,
            str(device_id or "").strip() or None,
            str(ip_address or "").strip() or None,
            1 if bool(ok) else 0,
            str(reason or "").strip() or None,
        ),
    )
    conn.commit()
    conn.close()


def get_auth_audit_logs(limit: int = 100):
    safe_limit = min(max(int(limit or 100), 1), 1000)
    conn = get_db()
    rows = conn.execute(
        """
        SELECT *
        FROM auth_audit_logs
        ORDER BY id DESC
        LIMIT ?
        """,
        (safe_limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def upsert_user_device(user_id: int, device_id: str, device_label: str | None = None):
    safe_device_id = str(device_id or "").strip()
    if not safe_device_id:
        raise ValueError("device_id requis")

    conn = get_db()
    conn.execute(
        """
        INSERT INTO devices (
            user_id, device_id, device_label, sync_paused,
            last_sync_cursor, last_seen_at, revoked_at, created_at, updated_at
        )
        VALUES (?, ?, ?, 0, 0, datetime('now'), NULL, datetime('now'), datetime('now'))
        ON CONFLICT(user_id, device_id) DO UPDATE SET
            device_label=COALESCE(excluded.device_label, devices.device_label),
            last_seen_at=datetime('now'),
            updated_at=datetime('now')
        """,
        (int(user_id), safe_device_id, str(device_label or "").strip() or None),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT * FROM devices WHERE user_id=? AND device_id=? LIMIT 1
        """,
        (int(user_id), safe_device_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_device(user_id: int, device_id: str):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM devices WHERE user_id=? AND device_id=? LIMIT 1",
        (int(user_id), str(device_id or "").strip()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_user_devices(user_id: int):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT *
        FROM devices
        WHERE user_id=?
        ORDER BY (revoked_at IS NOT NULL) ASC, updated_at DESC, id DESC
        """,
        (int(user_id),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_device_sync_paused(user_id: int, device_id: str, paused: bool):
    conn = get_db()
    cur = conn.execute(
        """
        UPDATE devices
        SET sync_paused=?, updated_at=datetime('now'), last_seen_at=datetime('now')
        WHERE user_id=? AND device_id=? AND revoked_at IS NULL
        """,
        (1 if paused else 0, int(user_id), str(device_id or "").strip()),
    )
    conn.commit()
    changed = int(cur.rowcount or 0) > 0
    row = conn.execute(
        "SELECT * FROM devices WHERE user_id=? AND device_id=? LIMIT 1",
        (int(user_id), str(device_id or "").strip()),
    ).fetchone()
    conn.close()
    return changed, (dict(row) if row else None)


def update_device_sync_cursor(user_id: int, device_id: str, cursor: int):
    conn = get_db()
    conn.execute(
        """
        UPDATE devices
        SET last_sync_cursor=?, updated_at=datetime('now'), last_seen_at=datetime('now')
        WHERE user_id=? AND device_id=? AND revoked_at IS NULL
        """,
        (max(0, int(cursor or 0)), int(user_id), str(device_id or "").strip()),
    )
    conn.commit()
    conn.close()


def revoke_user_device(user_id: int, device_id: str):
    safe_device_id = str(device_id or "").strip()
    if not safe_device_id:
        return False

    conn = get_db()
    cur_device = conn.execute(
        """
        UPDATE devices
        SET revoked_at=datetime('now'), sync_paused=1, updated_at=datetime('now')
        WHERE user_id=? AND device_id=? AND revoked_at IS NULL
        """,
        (int(user_id), safe_device_id),
    )
    conn.execute(
        """
        UPDATE user_sessions
        SET revoked_at=datetime('now')
        WHERE user_id=? AND device_id=? AND revoked_at IS NULL
        """,
        (int(user_id), safe_device_id),
    )
    conn.commit()
    changed = int(cur_device.rowcount or 0) > 0
    conn.close()
    return changed


def get_sync_cursor():
    conn = get_db()
    row = conn.execute("SELECT COALESCE(MAX(id), 0) FROM sync_events").fetchone()
    conn.close()
    return int(row[0] or 0)


def apply_sync_events(events, source="remote", user_id=None, device_id: str | None = None):
    if not isinstance(events, list):
        raise ValueError("La charge utile sync doit contenir une liste d'evenements.")

    conn = get_db()
    summary = {
        "total": len(events),
        "applied": 0,
        "duplicates": 0,
        "stale": 0,
        "invalid": 0,
    }
    details = []
    actor_user_id = int(user_id) if user_id is not None else None
    actor_device_id = str(device_id or "").strip() or None

    try:
        for evt in events:
            if not isinstance(evt, dict):
                summary["invalid"] += 1
                details.append({"ok": False, "reason": "invalid_event"})
                continue

            event_uid = str(evt.get("event_uid") or "").strip() or uuid.uuid4().hex
            entity_type = str(evt.get("entity_type") or "").strip()
            entity_id = str(evt.get("entity_id") or "").strip()
            operation = str(evt.get("operation") or "").strip().lower()
            payload = evt.get("payload") if isinstance(evt.get("payload"), dict) else {}
            event_at = _normalize_sync_event_at(evt.get("event_at"))

            if not entity_type or not entity_id or operation not in ("upsert", "delete") or not _sync_get_entity_spec(entity_type):
                summary["invalid"] += 1
                details.append({"ok": False, "event_uid": event_uid, "reason": "invalid_payload"})
                continue

            if actor_user_id is not None:
                already = conn.execute(
                    "SELECT id FROM sync_events WHERE user_id=? AND event_uid=?",
                    (actor_user_id, event_uid),
                ).fetchone()
            else:
                already = conn.execute(
                    "SELECT id FROM sync_events WHERE user_id IS NULL AND event_uid=?",
                    (event_uid,),
                ).fetchone()
            if already:
                summary["duplicates"] += 1
                details.append({"ok": True, "event_uid": event_uid, "status": "duplicate"})
                continue

            latest_local = _latest_applied_event_at(conn, entity_type, entity_id, user_id=actor_user_id)
            if latest_local and _sync_event_to_epoch(event_at) < _sync_event_to_epoch(latest_local):
                _insert_sync_event(
                    conn,
                    user_id=actor_user_id,
                    device_id=actor_device_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    operation=operation,
                    payload=payload,
                    source=source,
                    event_at=event_at,
                    event_uid=event_uid,
                    applied=0,
                    conflict_reason="stale_event",
                )
                summary["stale"] += 1
                details.append({"ok": True, "event_uid": event_uid, "status": "stale"})
                continue

            if operation == "upsert":
                _upsert_row_from_payload(conn, entity_type, entity_id, payload)
            else:
                _delete_row_from_entity(conn, entity_type, entity_id)

            _insert_sync_event(
                conn,
                user_id=actor_user_id,
                device_id=actor_device_id,
                entity_type=entity_type,
                entity_id=entity_id,
                operation=operation,
                payload=payload,
                source=source,
                event_at=event_at,
                event_uid=event_uid,
                applied=1,
                conflict_reason=None,
            )
            summary["applied"] += 1
            details.append({"ok": True, "event_uid": event_uid, "status": "applied"})

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    summary["details"] = details
    summary["cursor"] = get_sync_cursor()
    return summary

# ── ACTIFS ────────────────────────────────────────────────
def get_actifs(enveloppe=None):
    conn = get_db()
    if enveloppe:
        rows = conn.execute("SELECT * FROM actifs WHERE enveloppe=? ORDER BY nom", (enveloppe,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM actifs ORDER BY enveloppe, nom").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_actif(id):
    conn = get_db()
    row = conn.execute("SELECT * FROM actifs WHERE id=?", (id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def fusionner_doublons():
    """Regroupe toutes les lignes ayant le même ticker+enveloppe en une seule,
    en calculant le PRU moyen pondéré et la quantité cumulée.
    Retourne le nombre de groupes fusionnés."""
    conn = get_db()
    # Trouver les groupes avec plus d'une ligne
    groupes = conn.execute("""
        SELECT enveloppe, UPPER(ticker) as ticker
        FROM actifs
        WHERE ticker IS NOT NULL AND ticker != ''
        GROUP BY enveloppe, UPPER(ticker)
        HAVING COUNT(*) > 1
    """).fetchall()

    count = 0
    for g in groupes:
        rows = conn.execute(
            "SELECT * FROM actifs WHERE enveloppe=? AND UPPER(ticker)=? ORDER BY id",
            (g["enveloppe"], g["ticker"])
        ).fetchall()
        rows = [dict(r) for r in rows]

        total_qty = sum(r["quantite"] for r in rows)
        pru_moyen = sum(r["pru"] * r["quantite"] for r in rows) / total_qty if total_qty > 0 else 0
        # Garder la première ligne, supprimer les autres
        keeper = rows[0]
        conn.execute("""
            UPDATE actifs SET quantite=?, pru=?, updated_at=datetime('now') WHERE id=?
        """, (round(total_qty, 6), round(pru_moyen, 4), keeper["id"]))
        for r in rows[1:]:
            conn.execute("DELETE FROM actifs WHERE id=?", (r["id"],))
        count += 1

    conn.commit()
    conn.close()
    return count

def get_actif_by_ticker(ticker, enveloppe):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM actifs WHERE UPPER(ticker)=? AND enveloppe=?",
        (ticker.upper(), enveloppe)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def add_actif(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO actifs (enveloppe, nom, ticker, quantite, pru, type, categorie, date_achat, notes)
        VALUES (:enveloppe, :nom, :ticker, :quantite, :pru, :type, :categorie, :date_achat, :notes)
    """, data)
    _record_sync_upsert(conn, "actifs", int(cur.lastrowid))
    conn.commit()
    conn.close()

def update_actif(id, data):
    conn = get_db()
    conn.execute("""
        UPDATE actifs SET nom=:nom, ticker=:ticker, quantite=:quantite, pru=:pru,
        type=:type, categorie=:categorie, date_achat=:date_achat, notes=:notes,
        updated_at=datetime('now') WHERE id=:id
    """, {**data, "id": id})
    _record_sync_upsert(conn, "actifs", int(id))
    conn.commit()
    conn.close()

def delete_actif(id):
    conn = get_db()
    conn.execute("DELETE FROM actifs WHERE id=?", (id,))
    _record_sync_delete(conn, "actifs", int(id))
    conn.commit()
    conn.close()


# ── COMPTES ÉTRANGERS (3916) ─────────────────────────────
def get_comptes_etrangers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM comptes_etrangers ORDER BY etablissement, id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_compte_etranger(compte_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM comptes_etrangers WHERE id=?", (compte_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def add_compte_etranger(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO comptes_etrangers (
            etablissement, pays, adresse, etablissement_ville, etablissement_code_postal,
            etablissement_identifiant, numero_compte, date_ouverture, date_cloture,
            type_compte, type_compte_detail, titulaire, titulaire_nom, co_titulaire_nom,
            detention_mode, actif_numerique, plateforme_actifs_numeriques, wallet_adresse,
            commentaire
        ) VALUES (
            :etablissement, :pays, :adresse, :etablissement_ville, :etablissement_code_postal,
            :etablissement_identifiant, :numero_compte, :date_ouverture, :date_cloture,
            :type_compte, :type_compte_detail, :titulaire, :titulaire_nom, :co_titulaire_nom,
            :detention_mode, :actif_numerique, :plateforme_actifs_numeriques, :wallet_adresse,
            :commentaire
        )
    """, data)
    _record_sync_upsert(conn, "comptes_etrangers", int(cur.lastrowid))
    conn.commit()
    conn.close()


def update_compte_etranger(compte_id, data):
    conn = get_db()
    conn.execute("""
        UPDATE comptes_etrangers
        SET etablissement=:etablissement,
            pays=:pays,
            adresse=:adresse,
            etablissement_ville=:etablissement_ville,
            etablissement_code_postal=:etablissement_code_postal,
            etablissement_identifiant=:etablissement_identifiant,
            numero_compte=:numero_compte,
            date_ouverture=:date_ouverture,
            date_cloture=:date_cloture,
            type_compte=:type_compte,
            type_compte_detail=:type_compte_detail,
            titulaire=:titulaire,
            titulaire_nom=:titulaire_nom,
            co_titulaire_nom=:co_titulaire_nom,
            detention_mode=:detention_mode,
            actif_numerique=:actif_numerique,
            plateforme_actifs_numeriques=:plateforme_actifs_numeriques,
            wallet_adresse=:wallet_adresse,
            commentaire=:commentaire,
            updated_at=datetime('now')
        WHERE id=:id
    """, {**data, "id": compte_id})
    _record_sync_upsert(conn, "comptes_etrangers", int(compte_id))
    conn.commit()
    conn.close()


def delete_compte_etranger(compte_id):
    conn = get_db()
    conn.execute("DELETE FROM comptes_etrangers WHERE id=?", (compte_id,))
    _record_sync_delete(conn, "comptes_etrangers", int(compte_id))
    conn.commit()
    conn.close()


def add_mouvement(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO mouvements (
            actif_id, enveloppe, type_operation, date_operation, quantite,
            prix_unitaire, frais, montant_brut, montant_net, pv_realisee
        )
        VALUES (
            :actif_id, :enveloppe, :type_operation, :date_operation, :quantite,
            :prix_unitaire, :frais, :montant_brut, :montant_net, :pv_realisee
        )
    """, data)
    _record_sync_upsert(conn, "mouvements", int(cur.lastrowid))
    conn.commit()
    conn.close()


def get_mouvement(mouvement_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM mouvements WHERE id=?", (mouvement_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_mouvement(mouvement_id, data):
    conn = get_db()
    conn.execute("""
        UPDATE mouvements
        SET date_operation=:date_operation,
            quantite=:quantite,
            prix_unitaire=:prix_unitaire,
            frais=:frais,
            montant_brut=:montant_brut,
            montant_net=:montant_net,
            pv_realisee=:pv_realisee
        WHERE id=:id
    """, {**data, "id": mouvement_id})
    _record_sync_upsert(conn, "mouvements", int(mouvement_id))
    conn.commit()
    conn.close()


def delete_mouvement(mouvement_id):
    conn = get_db()
    conn.execute("DELETE FROM mouvements WHERE id=?", (mouvement_id,))
    _record_sync_delete(conn, "mouvements", int(mouvement_id))
    conn.commit()
    conn.close()


def get_mouvements(actif_id=None, enveloppe=None, limit=200):
    conn = get_db()
    if actif_id is not None:
        rows = conn.execute(
            "SELECT * FROM mouvements WHERE actif_id=? ORDER BY date_operation DESC, id DESC LIMIT ?",
            (actif_id, limit),
        ).fetchall()
    elif enveloppe:
        rows = conn.execute(
            "SELECT * FROM mouvements WHERE enveloppe=? ORDER BY date_operation DESC, id DESC LIMIT ?",
            (enveloppe, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM mouvements ORDER BY date_operation DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── LIVRETS ───────────────────────────────────────────────
def get_livrets():
    conn = get_db()
    rows = conn.execute("SELECT * FROM livrets ORDER BY nom").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_assurance_vie():
    conn = get_db()
    rows = conn.execute("SELECT * FROM assurance_vie ORDER BY nom, id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_assurance_vie_contrat(id):
    conn = get_db()
    row = conn.execute("SELECT * FROM assurance_vie WHERE id=?", (id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def add_assurance_vie(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO assurance_vie (nom, assureur, type_support, versements, valeur_actuelle, date_maj, notes)
        VALUES (:nom, :assureur, :type_support, :versements, :valeur_actuelle, :date_maj, :notes)
    """, data)
    _record_sync_upsert(conn, "assurance_vie", int(cur.lastrowid))
    conn.commit()
    conn.close()


def update_assurance_vie(id, data):
    conn = get_db()
    conn.execute("""
        UPDATE assurance_vie SET
            nom=:nom,
            assureur=:assureur,
            type_support=:type_support,
            versements=:versements,
            valeur_actuelle=:valeur_actuelle,
            date_maj=:date_maj,
            notes=:notes,
            updated_at=datetime('now')
        WHERE id=:id
    """, {**data, "id": id})
    _record_sync_upsert(conn, "assurance_vie", int(id))
    conn.commit()
    conn.close()


def delete_assurance_vie(id):
    conn = get_db()
    conn.execute("DELETE FROM assurance_vie WHERE id=?", (id,))
    _record_sync_delete(conn, "assurance_vie", int(id))
    conn.commit()
    conn.close()


def get_assurance_vie_stats():
    conn = get_db()
    row = conn.execute("""
        SELECT
            COUNT(*) AS nb,
            COALESCE(SUM(versements), 0) AS total_versements,
            COALESCE(SUM(valeur_actuelle), 0) AS total_valeur
        FROM assurance_vie
    """).fetchone()

    supports = conn.execute("""
        SELECT type_support, COALESCE(SUM(valeur_actuelle), 0) AS total
        FROM assurance_vie
        GROUP BY type_support
    """).fetchall()
    conn.close()

    total_valeur = float(row["total_valeur"] or 0)
    total_versements = float(row["total_versements"] or 0)
    by_support = {
        str(s["type_support"] or "mixte"): round(float(s["total"] or 0), 2)
        for s in supports
    }

    return {
        "nb": int(row["nb"] or 0),
        "total_versements": round(total_versements, 2),
        "total_valeur": round(total_valeur, 2),
        "pv_latente": round(total_valeur - total_versements, 2),
        "by_support": by_support,
    }

def get_livret(id):
    conn = get_db()
    row = conn.execute("SELECT * FROM livrets WHERE id=?", (id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def add_livret(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO livrets (nom, capital, taux, date_maj, notes)
        VALUES (:nom, :capital, :taux, :date_maj, :notes)
    """, data)
    _record_sync_upsert(conn, "livrets", int(cur.lastrowid))
    conn.commit()
    conn.close()

def update_livret(id, data):
    conn = get_db()
    conn.execute("""
        UPDATE livrets SET nom=:nom, capital=:capital, taux=:taux,
        date_maj=:date_maj, notes=:notes, updated_at=datetime('now') WHERE id=:id
    """, {**data, "id": id})
    _record_sync_upsert(conn, "livrets", int(id))
    conn.commit()
    conn.close()

def delete_livret(id):
    conn = get_db()
    conn.execute("DELETE FROM livrets WHERE id=?", (id,))
    _record_sync_delete(conn, "livrets", int(id))
    conn.commit()
    conn.close()

# ── HISTORIQUE ────────────────────────────────────────────
def save_snapshot(valeurs: dict, snapshot_date=None):
    conn = get_db()
    date_value = str(snapshot_date or datetime.datetime.now().date().isoformat())
    payload = {
        "date": date_value,
        "totale": float(valeurs.get("totale") or 0),
        "pea": float(valeurs.get("pea") or 0),
        "cto": float(valeurs.get("cto") or 0),
        "or_": float(valeurs.get("or_") or 0),
        "livrets": float(valeurs.get("livrets") or 0),
        "assurance_vie": float(valeurs.get("assurance_vie") or 0),
        "investie": float(valeurs.get("investie") or 0),
    }
    existing = conn.execute("SELECT id FROM historique WHERE date = ?", (date_value,)).fetchone()
    if existing:
        conn.execute("""
            UPDATE historique SET valeur_totale=:totale, valeur_pea=:pea, valeur_cto=:cto,
            valeur_or=:or_, valeur_livrets=:livrets, valeur_assurance_vie=:assurance_vie,
            valeur_investie=:investie
            WHERE date=:date
        """, payload)
    else:
        conn.execute("""
            INSERT INTO historique (
                date, valeur_totale, valeur_pea, valeur_cto, valeur_or,
                valeur_livrets, valeur_assurance_vie, valeur_investie
            )
            VALUES (:date, :totale, :pea, :cto, :or_, :livrets, :assurance_vie, :investie)
        """, payload)
    conn.commit()
    conn.close()

def get_historique(limit=500):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM (
            SELECT * FROM historique ORDER BY date DESC LIMIT ?
        ) h ORDER BY date ASC
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def has_historique():
    conn = get_db()
    row = conn.execute("SELECT COUNT(*) FROM historique").fetchone()
    conn.close()
    return row[0] > 0

def get_last_snapshot_date() -> str | None:
    conn = get_db()
    row = conn.execute("SELECT MAX(date) FROM historique").fetchone()
    conn.close()
    return row[0] if row else None


def get_mouvements_pour_historique() -> dict:
    """
    Retourne les mouvements groupés par ticker pour la reconstruction rétroactive.
    Seuls les actifs encore présents en DB avec un ticker connu sont inclus.
    Format: {
        "AIR.PA": {"enveloppe": "PEA", "mouvements": [{"type_operation", "date_operation", "quantite", "prix_unitaire"}, ...]},
        ...
    }
    """
    conn = get_db()
    rows = conn.execute("""
        SELECT m.type_operation, m.date_operation, m.quantite, m.prix_unitaire,
               m.enveloppe, a.ticker
        FROM mouvements m
        JOIN actifs a ON m.actif_id = a.id
        WHERE a.ticker IS NOT NULL AND a.ticker != ''
          AND m.date_operation IS NOT NULL
          AND m.type_operation IN ('achat', 'vente', 'snapshot')
        ORDER BY m.date_operation ASC
    """).fetchall()
    conn.close()

    result = {}
    for row in rows:
        ticker = str(row["ticker"]).strip().upper()
        if not ticker:
            continue
        if ticker not in result:
            result[ticker] = {"enveloppe": row["enveloppe"], "mouvements": []}
        result[ticker]["mouvements"].append({
            "type_operation": row["type_operation"],
            "date_operation": row["date_operation"],
            "quantite": float(row["quantite"] or 0),
            "prix_unitaire": float(row["prix_unitaire"] or 0),
        })
    return result


def upsert_historique_retroactif(snapshots: list) -> int:
    """
    Insère ou met à jour les snapshots reconstruits dans historique.

    Stratégie valeur_totale :
    - Les anciens snapshots du scheduler incluent livrets + AV dans valeur_totale,
      les jours reconstruits n'ont que les stocks → créerait des pics/creux.
    - Pour chaque jour (nouveau ou existant), on forward-fill les livrets/AV depuis
      le snapshot réel le plus récent ≤ date, afin que valeur_totale soit cohérent
      sur toute la courbe.

    Retourne le nombre de lignes traitées.
    """
    conn = get_db()

    # Charger tous les snapshots existants avec livrets/AV, triés par date
    known = conn.execute("""
        SELECT date, valeur_livrets, valeur_assurance_vie
        FROM historique
        WHERE valeur_livrets IS NOT NULL OR valeur_assurance_vie IS NOT NULL
        ORDER BY date ASC
    """).fetchall()
    # Index {date_str: (livrets, av)} pour lookup rapide
    known_map = {
        row["date"]: (float(row["valeur_livrets"] or 0), float(row["valeur_assurance_vie"] or 0))
        for row in known
    }
    known_dates = sorted(known_map)

    def _get_livrets_av(date: str):
        """
        Forward-fill + backward-fill.
        - Si des snapshots connus existent avant la date → dernier connu (forward-fill).
        - Si la date est antérieure à tout snapshot connu → utilise le plus ancien (backward-fill).
        Les livrets/AV évoluent très lentement, cette approximation est acceptable.
        """
        if not known_dates:
            return (0.0, 0.0)
        best = None
        for d in known_dates:
            if d <= date:
                best = known_map[d]
            else:
                break
        # Backward-fill : date antérieure à tous les snapshots connus
        if best is None:
            best = known_map[known_dates[0]]
        return best

    count = 0
    for snap in snapshots:
        date = snap["date"]
        pea = float(snap.get("valeur_pea") or 0)
        cto = float(snap.get("valeur_cto") or 0)
        or_ = float(snap.get("valeur_or") or 0)
        investie = float(snap.get("valeur_investie") or 0)

        livrets, av = _get_livrets_av(date)
        totale = round(pea + cto + or_ + livrets + av, 2)
        # valeur_investie (total) inclut livrets+AV pour que le gain sur valeur_totale soit juste
        investie_totale = round(investie + livrets + av, 2)
        investie_pea = round(snap.get("investie_pea") or 0, 2)
        investie_cto = round(snap.get("investie_cto") or 0, 2)
        investie_or  = round(snap.get("investie_or")  or 0, 2)

        existing = conn.execute(
            "SELECT id FROM historique WHERE date = ?", (date,)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE historique
                SET valeur_totale = ?, valeur_pea = ?, valeur_cto = ?,
                    valeur_or = ?, valeur_investie = ?,
                    valeur_pea_investie = ?, valeur_cto_investie = ?, valeur_or_investie = ?
                WHERE date = ?
            """, (totale, round(pea, 2), round(cto, 2), round(or_, 2), investie_totale,
                  investie_pea, investie_cto, investie_or, date))
        else:
            conn.execute("""
                INSERT INTO historique (date, valeur_totale, valeur_pea, valeur_cto,
                    valeur_or, valeur_livrets, valeur_assurance_vie, valeur_investie,
                    valeur_pea_investie, valeur_cto_investie, valeur_or_investie)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (date, totale, round(pea, 2), round(cto, 2), round(or_, 2),
                  round(livrets, 2) if livrets else None,
                  round(av, 2) if av else None,
                  investie_totale, investie_pea, investie_cto, investie_or))
        count += 1

    conn.commit()
    conn.close()
    return count

# ── ANALYSES ──────────────────────────────────────────────
def save_analyse(type_analyse, contexte, reponse):
    conn = get_db()
    conn.execute("INSERT INTO analyses (type_analyse, contexte, reponse) VALUES (?,?,?)",
                 (type_analyse, contexte, reponse))
    conn.commit()
    conn.close()


# ── FISCAL ────────────────────────────────────────────────
def _confidence_from_ratio(ratio: float) -> str:
    if ratio >= 0.85:
        return "eleve"
    if ratio >= 0.55:
        return "moyen"
    return "faible"


def get_fiscal_summary(annee: int) -> dict:
    conn = get_db()
    year_start = f"{annee}-01-01"
    year_end = f"{annee}-12-31"

    div_rows = conn.execute("""
        SELECT
            enveloppe,
            COALESCE(pays_source, '') AS pays_source,
            SUM(COALESCE(montant_brut, montant, 0)) AS brut,
            SUM(COALESCE(retenue_source, 0)) AS retenue,
            SUM(COALESCE(montant_net, montant, 0)) AS net,
            SUM(CASE WHEN montant_brut IS NOT NULL OR montant_net IS NOT NULL OR retenue_source IS NOT NULL THEN 1 ELSE 0 END) AS nb_complets,
            SUM(CASE WHEN COALESCE(TRIM(pays_source), '') != '' THEN 1 ELSE 0 END) AS nb_avec_pays,
            COUNT(*) AS nb
        FROM dividendes
        WHERE date_versement >= ? AND date_versement <= ?
        GROUP BY enveloppe, COALESCE(pays_source, '')
    """, (year_start, year_end)).fetchall()

    div_missing_row = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN montant_brut IS NULL AND montant_net IS NULL AND retenue_source IS NULL THEN 1 ELSE 0 END) AS sans_detail,
            SUM(CASE WHEN COALESCE(TRIM(pays_source), '') = '' THEN 1 ELSE 0 END) AS sans_pays,
            SUM(CASE WHEN COALESCE(TRIM(enveloppe), '') = '' THEN 1 ELSE 0 END) AS sans_enveloppe
        FROM dividendes
        WHERE date_versement >= ? AND date_versement <= ?
    """, (year_start, year_end)).fetchone()

    pv_rows = conn.execute("""
        SELECT
               m.enveloppe,
               SUM(CASE WHEN m.pv_realisee >= 0 THEN m.pv_realisee ELSE 0 END) AS pv,
               SUM(CASE WHEN m.pv_realisee <  0 THEN m.pv_realisee ELSE 0 END) AS mv,
               SUM(m.montant_net) AS produit_net,
               SUM(m.montant_brut) AS produit_brut,
               SUM(CASE WHEN m.pv_realisee IS NULL THEN 1 ELSE 0 END) AS nb_pv_null,
               SUM(CASE WHEN m.date_operation IS NULL OR TRIM(m.date_operation) = '' THEN 1 ELSE 0 END) AS nb_sans_date,
               SUM(CASE WHEN m.actif_id IS NULL THEN 1 ELSE 0 END) AS nb_sans_actif,
               COUNT(*) AS nb_cessions
                FROM mouvements m
        WHERE m.type_operation = 'vente'
          AND m.date_operation >= ? AND m.date_operation <= ?
        GROUP BY m.enveloppe
    """, (year_start, year_end)).fetchall()

    pv_missing_row = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN pv_realisee IS NULL THEN 1 ELSE 0 END) AS sans_pv,
            SUM(CASE WHEN date_operation IS NULL OR TRIM(date_operation) = '' THEN 1 ELSE 0 END) AS sans_date,
            SUM(CASE WHEN COALESCE(TRIM(enveloppe), '') = '' THEN 1 ELSE 0 END) AS sans_enveloppe
        FROM mouvements
        WHERE type_operation = 'vente'
          AND date_operation >= ? AND date_operation <= ?
    """, (year_start, year_end)).fetchone()

    conn.close()

    div_brut_total = 0.0
    div_retenue_total = 0.0
    div_net_total = 0.0
    div_nb = 0
    div_par_env: dict = {}
    div_par_source: dict = {}
    div_rows_total = 0
    div_rows_complete = 0
    for row in div_rows:
        env = str(row["enveloppe"] or "").upper()
        pays = str(row["pays_source"] or "").strip() or "Non renseigné"
        brut = float(row["brut"] or 0)
        retenue = float(row["retenue"] or 0)
        net = float(row["net"] or 0)
        nb = int(row["nb"] or 0)
        nb_complets = int(row["nb_complets"] or 0)
        nb_avec_pays = int(row["nb_avec_pays"] or 0)
        div_brut_total += brut
        div_retenue_total += retenue
        div_net_total += net
        div_nb += nb
        div_rows_total += nb
        div_rows_complete += nb_complets
        env_bucket = div_par_env.setdefault(env, {"brut": 0.0, "retenue": 0.0, "net": 0.0, "nb": 0, "nb_avec_pays": 0})
        env_bucket["brut"] += brut
        env_bucket["retenue"] += retenue
        env_bucket["net"] += net
        env_bucket["nb"] += nb
        env_bucket["nb_avec_pays"] += nb_avec_pays
        source_key = f"{env or 'INCONNU'}::{pays}"
        div_par_source[source_key] = {
            "enveloppe": env or "INCONNU",
            "pays_source": pays,
            "brut": round(brut, 2),
            "retenue": round(retenue, 2),
            "net": round(net, 2),
            "nb": nb,
        }

    for env, values in div_par_env.items():
        values["brut"] = round(values["brut"], 2)
        values["retenue"] = round(values["retenue"], 2)
        values["net"] = round(values["net"], 2)
        values["taux_completude_pays"] = round((values["nb_avec_pays"] / values["nb"]) if values["nb"] else 1.0, 3)

    pv_total = 0.0
    mv_total = 0.0
    nb_cessions = 0
    pv_par_env: dict = {}
    pv_rows_total = 0
    pv_rows_complete = 0
    for row in pv_rows:
        env = str(row["enveloppe"] or "").upper()
        pv = float(row["pv"] or 0)
        mv = float(row["mv"] or 0)
        produit_net = float(row["produit_net"] or 0)
        produit_brut = float(row["produit_brut"] or 0)
        nb = int(row["nb_cessions"] or 0)
        nb_pv_null = int(row["nb_pv_null"] or 0)
        nb_sans_date = int(row["nb_sans_date"] or 0)
        nb_sans_actif = int(row["nb_sans_actif"] or 0)
        pv_total += pv
        mv_total += mv
        nb_cessions += nb
        pv_rows_total += nb
        pv_rows_complete += (nb - nb_pv_null)
        pv_par_env[env] = {
            "pv": round(pv, 2),
            "mv": round(mv, 2),
            "solde": round(pv + mv, 2),
            "nb_cessions": nb,
            "produit_brut": round(produit_brut, 2),
            "produit_net": round(produit_net, 2),
            "nb_pv_non_renseignee": nb_pv_null,
            "nb_sans_date": nb_sans_date,
            "nb_sans_actif": nb_sans_actif,
        }

    div_total_rows = int(div_missing_row["total"] or 0)
    div_sans_detail = int(div_missing_row["sans_detail"] or 0)
    div_sans_pays = int(div_missing_row["sans_pays"] or 0)
    div_sans_env = int(div_missing_row["sans_enveloppe"] or 0)

    pv_total_rows = int(pv_missing_row["total"] or 0)
    pv_sans_pv = int(pv_missing_row["sans_pv"] or 0)
    pv_sans_date = int(pv_missing_row["sans_date"] or 0)
    pv_sans_env = int(pv_missing_row["sans_enveloppe"] or 0)

    div_ratio = (div_rows_complete / div_rows_total) if div_rows_total else 1.0
    pv_ratio = (pv_rows_complete / pv_rows_total) if pv_rows_total else 1.0

    vigilances = []
    if div_sans_detail > 0:
        vigilances.append({
            "section": "dividendes",
            "niveau": "attention",
            "code": "dividendes_detail_manquant",
            "message": f"{div_sans_detail} dividende(s) sans détail brut/retenue/net.",
            "action": "Renseignez montant brut, retenue à la source et net perçu pour fiabiliser le report.",
        })
    if div_sans_pays > 0:
        vigilances.append({
            "section": "dividendes",
            "niveau": "attention",
            "code": "dividendes_pays_manquant",
            "message": f"{div_sans_pays} dividende(s) sans pays/source.",
            "action": "Ajoutez le pays de source pour faciliter le contrôle IFU et la retenue étrangère.",
        })
    if div_sans_env > 0:
        vigilances.append({
            "section": "dividendes",
            "niveau": "attention",
            "code": "dividendes_enveloppe_manquante",
            "message": f"{div_sans_env} dividende(s) sans enveloppe fiscale.",
            "action": "Complétez l'enveloppe (PEA, CTO, OR, etc.) dans la saisie des dividendes.",
        })
    if pv_sans_pv > 0:
        vigilances.append({
            "section": "cessions",
            "niveau": "critique",
            "code": "cessions_pv_manquante",
            "message": f"{pv_sans_pv} cession(s) sans PV/MV réalisée.",
            "action": "Complétez la PV/MV des ventes concernées pour obtenir un solde exploitable.",
        })
    if pv_sans_env > 0:
        vigilances.append({
            "section": "cessions",
            "niveau": "attention",
            "code": "cessions_enveloppe_manquante",
            "message": f"{pv_sans_env} cession(s) sans enveloppe.",
            "action": "Renseignez l'enveloppe des cessions pour une ventilation fiscale correcte.",
        })
    if pv_sans_date > 0:
        vigilances.append({
            "section": "cessions",
            "niveau": "attention",
            "code": "cessions_date_manquante",
            "message": f"{pv_sans_date} cession(s) sans date opération.",
            "action": "Complétez les dates de cession pour sécuriser l'année fiscale de rattachement.",
        })

    return {
        "annee": annee,
        "dividendes": {
            "total": round(div_brut_total, 2),
            "total_brut": round(div_brut_total, 2),
            "total_retenue_source": round(div_retenue_total, 2),
            "total_net": round(div_net_total, 2),
            "nb": div_nb,
            "par_enveloppe": div_par_env,
            "par_source": div_par_source,
        },
        "cessions": {
            "total_pv": round(pv_total, 2),
            "total_mv": round(mv_total, 2),
            "solde": round(pv_total + mv_total, 2),
            "nb_cessions": nb_cessions,
            "par_enveloppe": pv_par_env,
        },
        "scores_confiance": {
            "dividendes": _confidence_from_ratio(div_ratio),
            "cessions": _confidence_from_ratio(pv_ratio),
            "global": _confidence_from_ratio((div_ratio + pv_ratio) / 2),
        },
        "vigilances": vigilances,
        "hypotheses": [
            "Les dividendes historiques sans détail utilisent le champ montant comme référence brute et nette.",
            "Les ventes sans PV/MV restent comptées mais exclues du solde net PV/MV.",
            "Les calculs sont basés sur vos saisies Tomino et doivent être réconciliés avec l'IFU du courtier.",
        ],
        "reconciliation_ifu": {
            "dividendes": {
                "montant_brut_theorique": round(div_brut_total, 2),
                "retenue_source_theorique": round(div_retenue_total, 2),
                "montant_net_theorique": round(div_net_total, 2),
                "lignes": div_total_rows,
            },
            "cessions": {
                "pv_theorique": round(pv_total, 2),
                "mv_theorique": round(mv_total, 2),
                "solde_theorique": round(pv_total + mv_total, 2),
                "lignes": pv_total_rows,
            },
        },
        "manquants": {
            "dividendes": {
                "sans_detail": div_sans_detail,
                "sans_pays": div_sans_pays,
                "sans_enveloppe": div_sans_env,
            },
            "cessions": {
                "sans_pv": pv_sans_pv,
                "sans_date": pv_sans_date,
                "sans_enveloppe": pv_sans_env,
            },
        },
    }

def get_analyses(limit=20):
    conn = get_db()
    rows = conn.execute("SELECT * FROM analyses ORDER BY date DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_ia_usage(data):
    conn = get_db()
    conn.execute(
        """
        INSERT INTO ia_usage (
            endpoint, tier, input_tokens, output_tokens, total_tokens, cost_eur
        ) VALUES (
            :endpoint, :tier, :input_tokens, :output_tokens, :total_tokens, :cost_eur
        )
        """,
        {
            "endpoint": str(data.get("endpoint") or "").strip() or "unknown",
            "tier": str(data.get("tier") or "free").strip() or "free",
            "input_tokens": int(data.get("input_tokens") or 0),
            "output_tokens": int(data.get("output_tokens") or 0),
            "total_tokens": int(data.get("total_tokens") or 0),
            "cost_eur": float(data.get("cost_eur") or 0.0),
        },
    )
    conn.commit()
    conn.close()


def get_ia_usage_summary(period_start: str, period_end: str):
    conn = get_db()
    row = conn.execute(
        """
        SELECT
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost_eur), 0) AS cost_eur,
            COUNT(*) AS calls
        FROM ia_usage
        WHERE created_at >= ? AND created_at < ?
        """,
        (period_start, period_end),
    ).fetchone()

    rows_by_endpoint = conn.execute(
        """
        SELECT
            endpoint,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost_eur), 0) AS cost_eur,
            COUNT(*) AS calls
        FROM ia_usage
        WHERE created_at >= ? AND created_at < ?
        GROUP BY endpoint
        ORDER BY cost_eur DESC
        """,
        (period_start, period_end),
    ).fetchall()
    conn.close()

    return {
        "input_tokens": int(row["input_tokens"] or 0),
        "output_tokens": int(row["output_tokens"] or 0),
        "total_tokens": int(row["total_tokens"] or 0),
        "cost_eur": float(row["cost_eur"] or 0.0),
        "calls": int(row["calls"] or 0),
        "by_endpoint": [
            {
                "endpoint": str(r["endpoint"] or "unknown"),
                "total_tokens": int(r["total_tokens"] or 0),
                "cost_eur": float(r["cost_eur"] or 0.0),
                "calls": int(r["calls"] or 0),
            }
            for r in rows_by_endpoint
        ],
    }


# ── PROFIL INVESTISSEUR ──────────────────────────────────
def _safe_list_json(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def profil_exists():
    conn = get_db()
    row = conn.execute("SELECT 1 FROM profil WHERE id=1").fetchone()
    conn.close()
    return row is not None


def get_is_demo():
    conn = get_db()
    row = conn.execute("SELECT is_demo FROM profil WHERE id=1").fetchone()
    conn.close()
    return 1 if (row and row["is_demo"]) else 0


def get_profil():
    conn = get_db()
    row = conn.execute("SELECT * FROM profil WHERE id=1").fetchone()
    conn.close()

    if not row:
        return DEFAULT_PROFIL.copy()

    data = dict(row)
    return {
        "id": 1,
        "horizon": str(data.get("horizon") or DEFAULT_PROFIL["horizon"]),
        "risque": str(data.get("risque") or DEFAULT_PROFIL["risque"]),
        "objectif": str(data.get("objectif") or DEFAULT_PROFIL["objectif"]),
        "strategie": str(data.get("strategie") or DEFAULT_PROFIL["strategie"]),
        "style_ia": str(data.get("style_ia") or DEFAULT_PROFIL["style_ia"]),
        "ton_ia": str(data.get("ton_ia") or DEFAULT_PROFIL["ton_ia"]),
        "secteurs_exclus": _safe_list_json(data.get("secteurs_exclus")),
        "pays_exclus": _safe_list_json(data.get("pays_exclus")),
        "benchmark": str(data.get("benchmark") or DEFAULT_PROFIL["benchmark"]),
        "tier": _normalize_tier(str(data.get("tier") or DEFAULT_PROFIL["tier"])),
    }


def save_profil(data):
    payload = data or {}
    base = get_profil()

    secteurs = payload.get("secteurs_exclus", base["secteurs_exclus"])
    pays = payload.get("pays_exclus", base["pays_exclus"])

    if isinstance(secteurs, str):
        secteurs = _safe_list_json(secteurs)
    if isinstance(pays, str):
        pays = _safe_list_json(pays)

    record = {
        "id": 1,
        "horizon": str(payload.get("horizon", base["horizon"]) or base["horizon"]),
        "risque": str(payload.get("risque", base["risque"]) or base["risque"]),
        "objectif": str(payload.get("objectif", base["objectif"]) or base["objectif"]),
        "strategie": str(payload.get("strategie", base["strategie"]) or base["strategie"]),
        "style_ia": str(payload.get("style_ia", base["style_ia"]) or base["style_ia"]),
        "ton_ia": str(payload.get("ton_ia", base["ton_ia"]) or base["ton_ia"]),
        "secteurs_exclus": json.dumps(secteurs if isinstance(secteurs, list) else [], ensure_ascii=False),
        "pays_exclus": json.dumps(pays if isinstance(pays, list) else [], ensure_ascii=False),
        "benchmark": str(payload.get("benchmark", base["benchmark"]) or base["benchmark"]),
        "tier": _normalize_tier(str(payload.get("tier", base["tier"]) or base["tier"])),
    }

    # Valider le tier (sécurité serveur — ne jamais faire confiance au client)
    record["tier"] = _normalize_tier(record["tier"])

    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO profil (
            id, horizon, risque, objectif, strategie, style_ia, ton_ia,
            secteurs_exclus, pays_exclus, benchmark, tier
        ) VALUES (
            :id, :horizon, :risque, :objectif, :strategie, :style_ia, :ton_ia,
            :secteurs_exclus, :pays_exclus, :benchmark, :tier
        )
    """, record)
    _record_sync_upsert(conn, "profil", 1)
    conn.commit()
    conn.close()


# ── DIVIDENDES ───────────────────────────────────────────
def get_dividendes(limit=100):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM dividendes ORDER BY date_versement DESC, id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_dividende(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO dividendes (
            ticker, nom, montant, montant_brut, retenue_source, montant_net,
            pays_source, devise_source, date_versement, enveloppe, notes
        )
        VALUES (
            :ticker, :nom, :montant, :montant_brut, :retenue_source, :montant_net,
            :pays_source, :devise_source, :date_versement, :enveloppe, :notes
        )
    """, data)
    _record_sync_upsert(conn, "dividendes", int(cur.lastrowid))
    conn.commit()
    conn.close()


def get_dividende(id):
    conn = get_db()
    row = conn.execute("SELECT * FROM dividendes WHERE id=?", (id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_dividende(id, data):
    conn = get_db()
    conn.execute("""
        UPDATE dividendes SET
            ticker=:ticker,
            nom=:nom,
            montant=:montant,
            montant_brut=:montant_brut,
            retenue_source=:retenue_source,
            montant_net=:montant_net,
            pays_source=:pays_source,
            devise_source=:devise_source,
            date_versement=:date_versement,
            enveloppe=:enveloppe,
            notes=:notes
        WHERE id=:id
    """, {**data, "id": id})
    _record_sync_upsert(conn, "dividendes", int(id))
    conn.commit()
    conn.close()


def get_dividende_by_ticker_date(ticker, date_versement):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM dividendes WHERE UPPER(ticker)=? AND date_versement=? LIMIT 1",
        (str(ticker or "").upper(), str(date_versement or "").strip()),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_dividende(id):
    conn = get_db()
    conn.execute("DELETE FROM dividendes WHERE id=?", (id,))
    _record_sync_delete(conn, "dividendes", int(id))
    conn.commit()
    conn.close()


def get_dividendes_stats():
    conn = get_db()
    current_year = datetime.datetime.now().year

    row = conn.execute(
        "SELECT COALESCE(SUM(COALESCE(montant_brut, montant)), 0) AS total_all, COUNT(*) AS nb FROM dividendes"
    ).fetchone()

    row_year = conn.execute(
        "SELECT COALESCE(SUM(COALESCE(montant_brut, montant)), 0) AS total_annee FROM dividendes WHERE substr(date_versement, 1, 4)=?",
        (str(current_year),),
    ).fetchone()

    now = datetime.datetime.now()
    mois = []
    year = now.year
    month = now.month
    for _ in range(12):
        mois.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    mois.reverse()

    rows = conn.execute(
        """
        SELECT substr(date_versement, 1, 7) AS mois, ROUND(SUM(COALESCE(montant_brut, montant)), 2) AS total
        FROM dividendes
        WHERE substr(date_versement, 1, 7) >= ?
        GROUP BY substr(date_versement, 1, 7)
        ORDER BY mois ASC
        """,
        (mois[0],),
    ).fetchall()
    conn.close()

    par_mois = {m: 0.0 for m in mois}
    for item in rows:
        par_mois[item["mois"]] = float(item["total"] or 0)

    return {
        "total_annee": round(float(row_year["total_annee"] or 0), 2),
        "total_all": round(float(row["total_all"] or 0), 2),
        "nb": int(row["nb"] or 0),
        "par_mois": par_mois,
    }


# ── ALERTES ──────────────────────────────────────────────
def get_alertes(actives_only=False):
    conn = get_db()
    if actives_only:
        rows = conn.execute(
            "SELECT * FROM alertes WHERE active=1 ORDER BY created_at DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM alertes ORDER BY active DESC, created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_alerte(data):
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO alertes (ticker, nom, type_alerte, seuil)
        VALUES (:ticker, :nom, :type_alerte, :seuil)
    """, data)
    _record_sync_upsert(conn, "alertes", int(cur.lastrowid))
    conn.commit()
    conn.close()


def delete_alerte(id):
    conn = get_db()
    conn.execute("DELETE FROM alertes WHERE id=?", (id,))
    _record_sync_delete(conn, "alertes", int(id))
    conn.commit()
    conn.close()


def desactiver_alerte(id):
    conn = get_db()
    conn.execute(
        "UPDATE alertes SET active=0, declenchee_le=datetime('now') WHERE id=?",
        (id,),
    )
    _record_sync_upsert(conn, "alertes", int(id))
    conn.commit()
    conn.close()


def reactiver_alerte(id):
    conn = get_db()
    conn.execute(
        "UPDATE alertes SET active=1, declenchee_le=NULL WHERE id=?",
        (id,),
    )
    _record_sync_upsert(conn, "alertes", int(id))
    conn.commit()
    conn.close()


def reset_all_data():
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM actifs')
    try:
        c.execute('DELETE FROM mouvements')
    except Exception:
        pass
    c.execute('DELETE FROM historique')
    c.execute('DELETE FROM livrets')
    c.execute('DELETE FROM assurance_vie')
    c.execute('DELETE FROM comptes_etrangers')
    c.execute('DELETE FROM dividendes')
    c.execute('DELETE FROM alertes')
    c.execute('DELETE FROM profil WHERE id=1')
    conn.commit()
    conn.close()

def inject_demo_data():
    reset_all_data()
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE profil SET is_demo=1 WHERE id=1')
    if c.rowcount == 0:
        c.execute('INSERT INTO profil (id, is_demo) VALUES (1, 1)')
    _record_sync_upsert(conn, 'profil', 1)
    
    c.execute('''INSERT INTO actifs (enveloppe, nom, ticker, quantite, pru, type, date_achat) VALUES ('PEA', 'LVMH', 'MC.PA', 10, 600.0, 'action', '2023-01-10')''')
    _record_sync_upsert(conn, 'actifs', c.lastrowid)
    c.execute('''INSERT INTO actifs (enveloppe, nom, ticker, quantite, pru, type, date_achat) VALUES ('PEA', 'Air Liquide', 'AI.PA', 25, 140.0, 'action', '2023-05-20')''')
    _record_sync_upsert(conn, 'actifs', c.lastrowid)
    c.execute('''INSERT INTO actifs (enveloppe, nom, ticker, quantite, pru, type, date_achat) VALUES ('PEA', 'Amundi MSCI World', 'CW8.PA', 50, 400.0, 'etf', '2022-11-05')''')
    _record_sync_upsert(conn, 'actifs', c.lastrowid)
    
    c.execute('''INSERT INTO livrets (nom, capital, taux) VALUES ('Livret A', 22950.0, 3.0)''')
    _record_sync_upsert(conn, 'livrets', c.lastrowid)
    c.execute('''INSERT INTO livrets (nom, capital, taux) VALUES ('LDDS', 12000.0, 3.0)''')
    _record_sync_upsert(conn, 'livrets', c.lastrowid)

    # Dividendes historiques démo (LVMH + Air Liquide)
    demo_dividendes = [
        # LVMH MC.PA — 10 actions
        ('MC.PA', 'LVMH', 35.00, 35.00, 0.0, 35.00, 'France', 'EUR', '2024-05-31', 'PEA', 'Import automatique'),
        ('MC.PA', 'LVMH', 15.00, 15.00, 0.0, 15.00, 'France', 'EUR', '2023-12-08', 'PEA', 'Import automatique'),
        ('MC.PA', 'LVMH', 33.00, 33.00, 0.0, 33.00, 'France', 'EUR', '2023-05-31', 'PEA', 'Import automatique'),
        ('MC.PA', 'LVMH', 13.50, 13.50, 0.0, 13.50, 'France', 'EUR', '2022-12-09', 'PEA', 'Import automatique'),
        # Air Liquide AI.PA — 25 actions
        ('AI.PA', 'Air Liquide', 87.50, 87.50, 0.0, 87.50, 'France', 'EUR', '2024-05-17', 'PEA', 'Import automatique'),
        ('AI.PA', 'Air Liquide', 80.00, 80.00, 0.0, 80.00, 'France', 'EUR', '2023-05-12', 'PEA', 'Import automatique'),
    ]
    for d in demo_dividendes:
        c.execute('''INSERT INTO dividendes
            (ticker, nom, montant, montant_brut, retenue_source, montant_net, pays_source, devise_source, date_versement, enveloppe, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', d)
        _record_sync_upsert(conn, 'dividendes', c.lastrowid)
    
    # Capital investi démo constant : MC.PA 10×600 + AI.PA 25×140 + CW8.PA 50×400 + livrets
    _DEMO_PEA_INVESTIE = 29_500.0   # 6000 + 3500 + 20000
    _DEMO_LIVRETS = 34_950.0        # Livret A + LDDS
    _DEMO_INVESTIE_TOTAL = _DEMO_PEA_INVESTIE + _DEMO_LIVRETS  # 64 450

    date_base = datetime.datetime.now() - datetime.timedelta(days=30)
    for i in range(31):
        d = (date_base + datetime.timedelta(days=i)).strftime('%Y-%m-%d')
        val_pea = 25000 + (100 * i) + (i % 3) * 50
        val_livrets = _DEMO_LIVRETS
        c.execute(
            '''INSERT INTO historique
               (date, valeur_totale, valeur_pea, valeur_cto, valeur_or, valeur_livrets,
                valeur_investie, valeur_pea_investie, valeur_cto_investie, valeur_or_investie)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (d, val_pea + val_livrets, val_pea, 0, 0, val_livrets,
             _DEMO_INVESTIE_TOTAL, _DEMO_PEA_INVESTIE, 0.0, 0.0),
        )
                  
    conn.commit()
    conn.close()

