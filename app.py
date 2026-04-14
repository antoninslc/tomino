from dotenv import load_dotenv
import sys as _sys, os as _os
if getattr(_sys, 'frozen', False):
    _bundle_dir = getattr(_sys, '_MEIPASS', _os.path.dirname(_os.path.abspath(__file__)))
    load_dotenv(_os.path.join(_bundle_dir, '.env.bundle'))
else:
    load_dotenv()

from flask import Flask, request, jsonify, Response, stream_with_context, g
from flask_cors import CORS
import database as db
import prices
import grok
import calculs
import emails
import csv
import base64
import hashlib
import hmac
import io
import json
import math
import os
import secrets
import subprocess
import shutil
import sqlite3
import sys
import threading
import datetime
import time
import re
import tempfile
import zipfile
import pathlib
from html import escape
from zoneinfo import ZoneInfo

FRONT_DIST = pathlib.Path(__file__).parent / "front" / "dist"
SERVE_FRONTEND = FRONT_DIST.is_dir() and (FRONT_DIST / "index.html").exists()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-this-before-deploying")
CORS(app, origins=[
    "http://localhost:5173", 
    "https://tauri.localhost", 
    "http://tauri.localhost", 
    "tauri://localhost", 
    "asset://localhost"
])

PARIS_TZ = ZoneInfo("Europe/Paris")
_COURS_STATUS_LOCK = threading.Lock()
_COURS_STATUS = {
    "cours_ok": False,
    "derniere_maj_dt": None,
    "prochaine_maj_dt": None,
}
_RESUME_CACHE_LOCK = threading.Lock()
_RESUME_CACHE = {
    "data": None,
    "timestamp": 0.0,
}
_last_dividend_check = None

IA_WEEKLY_BUDGET_EUR_PAR_TIER: dict[str, float] = {
    "free":        0.05,
    "tomino_plus": 0.25,
}
# Tarifs Grok-4-1-fast-reasoning (source : xAI)
# Surchargeable via variables d'environnement si les tarifs changent.
IA_COST_INPUT_EUR_PER_1K        = float(os.getenv("XAI_COST_INPUT_EUR_PER_1K",        "0.0002"))
IA_COST_CACHED_INPUT_EUR_PER_1K = float(os.getenv("XAI_COST_CACHED_INPUT_EUR_PER_1K", "0.00005"))
IA_COST_OUTPUT_EUR_PER_1K       = float(os.getenv("XAI_COST_OUTPUT_EUR_PER_1K",       "0.0005"))
RESUME_CACHE_TTL = 30
DISABLE_STARTUP_TASKS = os.getenv("TOMINO_DISABLE_STARTUP_TASKS", "0") == "1"
AUTH_SESSION_DAYS = int(os.getenv("TOMINO_AUTH_SESSION_DAYS", "30"))
AUTH_PBKDF2_ITERATIONS = int(os.getenv("TOMINO_AUTH_PBKDF2_ITERATIONS", "210000"))
AUTH_LOGIN_MAX_ATTEMPTS = int(os.getenv("TOMINO_AUTH_LOGIN_MAX_ATTEMPTS", "5"))
AUTH_LOGIN_WINDOW_SECONDS = int(os.getenv("TOMINO_AUTH_LOGIN_WINDOW_SECONDS", "300"))
AUTH_LOGIN_BLOCK_SECONDS = int(os.getenv("TOMINO_AUTH_LOGIN_BLOCK_SECONDS", "900"))
AUTH_MAX_ACTIVE_SESSIONS = int(os.getenv("TOMINO_AUTH_MAX_ACTIVE_SESSIONS", "8"))
AUTH_PASSWORD_RESET_TOKEN_MINUTES = int(os.getenv("TOMINO_AUTH_PASSWORD_RESET_TOKEN_MINUTES", "30"))
AUTH_PASSWORD_RESET_EXPOSE_TOKEN = os.getenv("TOMINO_AUTH_PASSWORD_RESET_EXPOSE_TOKEN", "0") == "1"
FREE_ALERTS_MAX = int(os.getenv("TOMINO_FREE_ALERTS_MAX", "3"))
BILLING_PROVIDER = str(os.getenv("TOMINO_BILLING_PROVIDER", "local") or "local").strip().lower()
STRIPE_SECRET_KEY = str(os.getenv("STRIPE_SECRET_KEY", "") or "").strip()
STRIPE_WEBHOOK_SECRET = str(os.getenv("STRIPE_WEBHOOK_SECRET", "") or "").strip()
STRIPE_PRICE_PLUS = str(os.getenv("STRIPE_PRICE_TIER2", "") or os.getenv("STRIPE_PRICE_PLUS", "")).strip()
STRIPE_CHECKOUT_SUCCESS_URL = str(
    os.getenv("STRIPE_CHECKOUT_SUCCESS_URL", "http://localhost:5173/settings/sync?billing=success") or ""
).strip()
STRIPE_CHECKOUT_CANCEL_URL = str(
    os.getenv("STRIPE_CHECKOUT_CANCEL_URL", "http://localhost:5173/settings/sync?billing=cancel") or ""
).strip()
STRIPE_PORTAL_RETURN_URL = str(
    os.getenv("STRIPE_PORTAL_RETURN_URL", "http://localhost:5173/settings/sync") or ""
).strip()
BACKUP_FORMAT = "tomino-backup"
BACKUP_VERSION = 1
BACKUP_MAX_SIZE_BYTES = 200 * 1024 * 1024
BACKUP_ENCRYPTED_FORMAT = "tomino-backup-encrypted"
BACKUP_ENCRYPTED_VERSION = 1
BACKUP_ENCRYPTED_MAGIC = b"TOMINOENC1\n"
BACKUP_ENCRYPTED_KDF_ITERS = 200_000
AUTO_BACKUP_DIR = os.path.join(db.get_data_dir(), "Backups")
AUTO_BACKUP_DAILY_KEEP = 7
AUTO_BACKUP_WEEKLY_KEEP = 4
_AUTH_LOGIN_LOCK = threading.Lock()
_AUTH_LOGIN_ATTEMPTS = {}

TYPE_COMPTE_ALLOWED = (
    "titres",
    "cash",
    "crypto",
    "autre",
    "neobanque",
    "paiement",
    "assurance_vie",
    "derives",
)
TITULAIRE_ALLOWED = ("titulaire", "cotitulaire", "mandataire")
DETENTION_ALLOWED = ("directe", "indirecte", "usufruit", "nue_propriete")

db.init_db()


# -- SNAPSHOT JOURNALIER 17h30 -------------------------------------------------
def _do_snapshot():
    """Calcule et enregistre un snapshot du patrimoine pour aujourd'hui."""
    resume = calcul_resume(force=True)
    db.save_snapshot({
        "totale": resume["total"],
        "pea": resume["pea"]["valeur_actuelle"],
        "cto": resume["cto"]["valeur_actuelle"],
        "or_": resume["or"]["valeur_actuelle"],
        "livrets": resume["livrets"]["valeur_actuelle"],
        "assurance_vie": resume["assurance_vie"]["valeur_actuelle"],
        "investie": resume.get("total_investi", 0),
    }, snapshot_date=_paris_now().date().isoformat())


def _snapshot_scheduler():
    while True:
        now = _paris_now()
        target = now.replace(hour=17, minute=30, second=0, microsecond=0)
        if now >= target:
            target += datetime.timedelta(days=1)
        time.sleep((target - now).total_seconds())
        try:
            _do_snapshot()
        except Exception as e:
            app.logger.warning("snapshot journalier raté: %s", e)
            # Retry dans 1h si échec
            time.sleep(3600)


def _paris_now() -> datetime.datetime:
    return datetime.datetime.now(PARIS_TZ)


def _estimate_tokens_from_text(text: str) -> int:
    raw = str(text or "")
    if not raw.strip():
        return 0
    # Approximation simple et stable: ~1 token pour 4 caractères.
    return max(1, math.ceil(len(raw) / 4))


def _week_window_paris(now: datetime.datetime | None = None) -> tuple[datetime.datetime, datetime.datetime]:
    current = now or _paris_now()
    start = current.replace(hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(days=current.weekday())
    end = start + datetime.timedelta(days=7)
    return start, end


_MAX_ANALYSE_CALLS_PAR_TIER: dict[str, int | None] = {
    "free":        3,
    "tomino_plus": None,
}


def _compute_ia_quota(now: datetime.datetime | None = None, tier: str | None = None) -> dict:
    current = now or _paris_now()
    if tier is None:
        tier = db.get_profil().get("tier", "free")
    budget = IA_WEEKLY_BUDGET_EUR_PAR_TIER.get(str(tier), IA_WEEKLY_BUDGET_EUR_PAR_TIER["free"])

    week_start, week_end = _week_window_paris(current)
    summary = db.get_ia_usage_summary(
        week_start.strftime("%Y-%m-%d %H:%M:%S"),
        week_end.strftime("%Y-%m-%d %H:%M:%S"),
    )
    spent = float(summary.get("cost_eur") or 0.0)
    remaining = max(0.0, budget - spent)
    blocked = spent >= budget

    by_endpoint = summary.get("by_endpoint") or []
    analyse_calls = next(
        (int(e.get("calls") or 0) for e in by_endpoint if e.get("endpoint") == "analyse"),
        0,
    )
    max_analyse_calls = _MAX_ANALYSE_CALLS_PAR_TIER.get(str(tier), None)

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "next_reset": week_end.isoformat(),
        "budget_eur": round(budget, 4),
        "cost_eur": round(spent, 6),
        "remaining_eur": round(remaining, 6),
        "total_tokens": int(summary.get("total_tokens") or 0),
        "input_tokens": int(summary.get("input_tokens") or 0),
        "output_tokens": int(summary.get("output_tokens") or 0),
        "calls": int(summary.get("calls") or 0),
        "by_endpoint": by_endpoint,
        "blocked": blocked,
        "analyse_calls": analyse_calls,
        "max_analyse_calls": max_analyse_calls,
    }


def _quota_error_message(quota: dict) -> str:
    next_reset = quota.get("next_reset")
    budget = quota.get("budget_eur", 0.05)
    try:
        next_dt = datetime.datetime.fromisoformat(str(next_reset)).astimezone(PARIS_TZ)
        when = next_dt.strftime("%d/%m à %H:%M")
    except Exception:
        when = "en début de semaine prochaine"
    budget_str = f"{budget:.2f} €".replace(".", ",")
    return (
        f"Limite hebdomadaire IA atteinte ({budget_str} de crédit utilisé). "
        f"Tomino sera de nouveau disponible {when}."
    )


def _xai_api_key_configured() -> bool:
    return bool(str(os.getenv("XAI_API_KEY", "")).strip())


def _auth_email_is_valid(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(email or "").strip()))


def _auth_extract_token() -> str:
    auth_header = str(request.headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return str(request.headers.get("X-Auth-Token", "")).strip()


def _auth_hash_token(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token or "").encode("utf-8")).hexdigest()


def _auth_client_ip() -> str:
    forwarded_for = str(request.headers.get("X-Forwarded-For", "")).strip()
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:64]
    return str(request.remote_addr or "").strip()[:64]


def _auth_normalize_device_id(raw_device_id: str | None) -> str:
    raw = str(raw_device_id or "").strip()
    if not raw:
        return f"dev_{secrets.token_hex(12)}"
    return re.sub(r"[^a-zA-Z0-9._:-]", "", raw)[:64] or f"dev_{secrets.token_hex(12)}"


def _auth_hash_password(raw_password: str) -> str:
    password = str(raw_password or "")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        AUTH_PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${AUTH_PBKDF2_ITERATIONS}${salt}${digest}"


def _auth_verify_password(raw_password: str, stored_hash: str) -> bool:
    value = str(stored_hash or "")
    parts = value.split("$", 3)
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    try:
        iterations = int(parts[1])
        salt = parts[2]
        expected = parts[3]
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            str(raw_password or "").encode("utf-8"),
            bytes.fromhex(salt),
            iterations,
        ).hex()
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def _auth_issue_session(user_id: int, device_id: str | None = None, device_label: str | None = None) -> dict:
    expires_dt = datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=max(1, AUTH_SESSION_DAYS))
    expires_at = expires_dt.strftime("%Y-%m-%d %H:%M:%S")
    raw_token = secrets.token_urlsafe(48)
    token_hash = _auth_hash_token(raw_token)
    session = db.create_user_session(
        user_id=int(user_id),
        token_hash=token_hash,
        expires_at=expires_at,
        device_label=device_label,
        device_id=device_id,
    )
    return {
        "token": raw_token,
        "expires_at": session.get("expires_at") if isinstance(session, dict) else expires_at,
        "device_id": str((session or {}).get("device_id") or device_id or ""),
    }


def _auth_audit(event_type: str, ok: bool, *, user_id=None, email: str | None = None, device_id: str | None = None, reason: str | None = None):
    try:
        db.add_auth_audit_log(
            event_type=event_type,
            user_id=user_id,
            email=email,
            device_id=device_id,
            ip_address=_auth_client_ip(),
            ok=ok,
            reason=reason,
        )
    except Exception:
        pass


def _auth_login_attempt_key(email: str, ip_address: str) -> str:
    return f"{str(email or '').strip().lower()}|{str(ip_address or '').strip()}"


def _auth_login_check_rate_limit(email: str, ip_address: str) -> tuple[bool, int]:
    now = time.time()
    key = _auth_login_attempt_key(email, ip_address)
    with _AUTH_LOGIN_LOCK:
        stale_keys = []
        for k, st in _AUTH_LOGIN_ATTEMPTS.items():
            blocked_until = float(st.get("blocked_until") or 0.0)
            failures = [t for t in (st.get("failures") or []) if now - float(t) <= AUTH_LOGIN_WINDOW_SECONDS]
            st["failures"] = failures
            if blocked_until <= now and not failures:
                stale_keys.append(k)
        for k in stale_keys:
            _AUTH_LOGIN_ATTEMPTS.pop(k, None)

        state = _AUTH_LOGIN_ATTEMPTS.get(key)
        if not state:
            return False, 0
        blocked_until = float(state.get("blocked_until") or 0.0)
        if blocked_until > now:
            return True, int(max(1, math.ceil(blocked_until - now)))
        state["blocked_until"] = 0.0
        return False, 0


def _auth_login_record_failure(email: str, ip_address: str) -> int:
    now = time.time()
    key = _auth_login_attempt_key(email, ip_address)
    with _AUTH_LOGIN_LOCK:
        state = _AUTH_LOGIN_ATTEMPTS.setdefault(key, {"failures": [], "blocked_until": 0.0})
        failures = [t for t in (state.get("failures") or []) if now - float(t) <= AUTH_LOGIN_WINDOW_SECONDS]
        failures.append(now)
        state["failures"] = failures
        if len(failures) >= max(1, AUTH_LOGIN_MAX_ATTEMPTS):
            state["blocked_until"] = now + max(1, AUTH_LOGIN_BLOCK_SECONDS)
            return int(max(1, AUTH_LOGIN_BLOCK_SECONDS))
        return 0


def _auth_login_record_success(email: str, ip_address: str):
    key = _auth_login_attempt_key(email, ip_address)
    with _AUTH_LOGIN_LOCK:
        _AUTH_LOGIN_ATTEMPTS.pop(key, None)


def _auth_issue_password_reset_token(user_id: int) -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = _auth_hash_token(raw_token)
    expires_dt = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=max(5, AUTH_PASSWORD_RESET_TOKEN_MINUTES))
    expires_at = expires_dt.strftime("%Y-%m-%d %H:%M:%S")
    db.create_password_reset_token(int(user_id), token_hash, expires_at)
    return raw_token, expires_at


def _auth_is_password_reset_token_expired(token_row: dict | None) -> bool:
    if not token_row:
        return True
    expires_raw = str(token_row.get("expires_at") or "").strip()
    if not expires_raw:
        return True
    try:
        expires_dt = datetime.datetime.strptime(expires_raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.UTC)
        return expires_dt <= datetime.datetime.now(datetime.UTC)
    except Exception:
        return True


def _auth_required_user():
    raw_token = _auth_extract_token()
    if not raw_token:
        return None, None, (jsonify({
            "ok": False,
            "erreur": "Authentification requise pour la synchronisation cloud.",
            "action": "Connectez-vous ou créez un compte pour activer la sync Tomino +.",
        }), 401)

    session = db.get_active_user_session(_auth_hash_token(raw_token))
    if not session:
        return None, None, (jsonify({
            "ok": False,
            "erreur": "Session invalide ou expirée.",
            "action": "Reconnectez-vous pour continuer.",
        }), 401)

    user = db.get_user_by_id(int(session.get("user_id") or 0))
    if not user:
        return None, None, (jsonify({"ok": False, "erreur": "Utilisateur introuvable."}), 401)
    return user, session, None


def _auth_optional_user_session():
    raw_token = _auth_extract_token()
    if not raw_token:
        return None, None
    session = db.get_active_user_session(_auth_hash_token(raw_token))
    if not session:
        return None, None
    user = db.get_user_by_id(int(session.get("user_id") or 0))
    if not user:
        return None, None
    return user, session


def _auth_normalize_tier(value: str) -> str:
    tier = str(value or "free").strip().lower()
    if tier in ("tier1", "tier2", "tomino_plus", "tomino+", "plus"):
        return "tomino_plus"
    return "free"


def _auth_tier_label(tier: str) -> str:
    return "Tomino +" if _auth_normalize_tier(tier) == "tomino_plus" else "Gratuit"


def _auth_is_tomino_plus(user) -> bool:
    tier = _auth_normalize_tier((user or {}).get("tier") if isinstance(user, dict) else "free")
    return tier == "tomino_plus"


def _auth_require_tomino_plus(user):
    if _auth_is_tomino_plus(user):
        return None
    return jsonify({
        "ok": False,
        "erreur": "Fonction réservée à Tomino +.",
        "action": "Passez à Tomino + dans Paramètres > Synchronisation cloud.",
        "required_tier": "tomino_plus",
    }), 403


def _billing_provider() -> str:
    return "stripe" if BILLING_PROVIDER == "stripe" else "local"


def _billing_price_id_for_tier(tier: str) -> str:
    return STRIPE_PRICE_PLUS if _auth_normalize_tier(tier) == "tomino_plus" else ""


def _billing_is_stripe_ready() -> bool:
    return (
        _billing_provider() == "stripe"
        and bool(STRIPE_SECRET_KEY)
        and bool(STRIPE_WEBHOOK_SECRET)
        and bool(STRIPE_PRICE_PLUS)
    )


def _stripe_client():
    try:
        import stripe  # type: ignore
    except Exception as e:
        raise RuntimeError(f"Librairie Stripe indisponible: {e}") from e
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def _billing_build_subscription_payload(user: dict, override_tier: str | None = None):
    tier = _auth_normalize_tier(override_tier or user.get("tier"))
    sub = db.get_user_subscription(int(user.get("id") or 0))
    return {
        "tier": tier,
        "label": _auth_tier_label(tier),
        "tomino_plus": tier == "tomino_plus",
        "status": str((sub or {}).get("status") or "active"),
        "provider": str((sub or {}).get("provider") or _billing_provider()),
        "provider_customer_id": str((sub or {}).get("provider_customer_id") or "") or None,
        "provider_subscription_id": str((sub or {}).get("provider_subscription_id") or "") or None,
        "current_period_end": str((sub or {}).get("current_period_end") or "") or None,
    }


def _alerts_limit_for_tier(tier: str) -> int | None:
    safe_tier = _auth_normalize_tier(tier)
    if safe_tier == "free":
        return max(1, int(FREE_ALERTS_MAX))
    return None


def _auth_sync_paused_error():
    return jsonify({
        "ok": False,
        "erreur": "Synchronisation en pause pour cet appareil.",
        "action": "Reprenez la synchronisation dans Paramètres > Sync cloud.",
    }), 423


@app.before_request
def _bind_sync_actor_context():
    user, session = _auth_optional_user_session()
    g.auth_user = user
    g.auth_session = session
    if user and session:
        db.set_sync_actor(user_id=int(user.get("id") or 0), device_id=session.get("device_id"))
    else:
        db.clear_sync_actor()


@app.teardown_request
def _clear_sync_actor_context(_err):
    db.clear_sync_actor()


def _clean_ai_error_text(raw: str) -> str:
    text = str(raw or "").strip()
    if text.startswith("[ERREUR]"):
        text = text.replace("[ERREUR]", "", 1).strip()
    return text or "Erreur IA inconnue."


def _invalidate_resume_cache() -> None:
    with _RESUME_CACHE_LOCK:
        _RESUME_CACHE["data"] = None
        _RESUME_CACHE["timestamp"] = 0.0


def _record_ia_usage(endpoint: str, tier: str, input_tokens: int, output_tokens: int, cached_tokens: int = 0):
    """Enregistre la consommation réelle de tokens retournée par l'API xAI.
    Les tokens cachés (prompt_tokens_details.cached_tokens) sont facturés 4x moins cher."""
    input_tokens   = max(0, int(input_tokens   or 0))
    output_tokens  = max(0, int(output_tokens  or 0))
    cached_tokens  = max(0, int(cached_tokens  or 0))
    non_cached     = max(0, input_tokens - cached_tokens)
    total_tokens   = input_tokens + output_tokens
    cost_eur = (
        (non_cached    / 1000.0) * IA_COST_INPUT_EUR_PER_1K
        + (cached_tokens / 1000.0) * IA_COST_CACHED_INPUT_EUR_PER_1K
        + (output_tokens / 1000.0) * IA_COST_OUTPUT_EUR_PER_1K
    )
    db.add_ia_usage({
        "endpoint": endpoint,
        "tier": tier,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cost_eur": cost_eur,
    })


def _marche_ouvert(now: datetime.datetime | None = None) -> bool:
    current = now or _paris_now()
    if current.weekday() >= 5:
        return False
    opening = current.replace(hour=9, minute=0, second=0, microsecond=0)
    closing = current.replace(hour=17, minute=30, second=0, microsecond=0)
    return opening <= current <= closing


def _next_market_open(now: datetime.datetime | None = None) -> datetime.datetime:
    current = now or _paris_now()
    candidate = current.replace(hour=9, minute=0, second=0, microsecond=0)

    if current.weekday() >= 5:
        days_ahead = 7 - current.weekday()
        return candidate + datetime.timedelta(days=days_ahead)

    if current < candidate:
        return candidate

    candidate += datetime.timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += datetime.timedelta(days=1)
    return candidate


def _format_dt_fr(value: datetime.datetime | None) -> str:
    if not value:
        return "-"
    return value.astimezone(PARIS_TZ).strftime("%d/%m/%Y %H:%M")


def _format_relative_delay(target: datetime.datetime | None, now: datetime.datetime | None = None) -> str:
    if not target:
        return "-"
    current = now or _paris_now()
    seconds = max(0, int((target - current).total_seconds()))
    if seconds < 60:
        return "dans moins d'1 min"
    minutes = (seconds + 59) // 60
    if minutes < 60:
        return f"dans {minutes} min"
    hours = minutes // 60
    rest = minutes % 60
    if rest == 0:
        return f"dans {hours} h"
    return f"dans {hours} h {rest:02d}"


def _fmt_eur(value) -> str:
    try:
        amount = float(value or 0)
    except Exception:
        amount = 0.0
    text = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    return f"{text} EUR"


def _fmt_pct(value) -> str:
    try:
        pct = float(value or 0)
    except Exception:
        pct = 0.0
    sign = "+" if pct > 0 else ""
    return f"{sign}{pct:.2f}%"


def _strip_markdown(text: str) -> str:
    raw = str(text or "")
    cleaned = re.sub(r"`{1,3}.*?`{1,3}", "", raw, flags=re.DOTALL)
    cleaned = re.sub(r"\*\*|__|~~|#+\s*", "", cleaned)
    cleaned = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _build_export_filename(prefix: str = "tomino-patrimoine", ext: str = "pdf") -> str:
    stamp = _paris_now().strftime("%Y-%m-%d")
    safe_ext = str(ext or "txt").strip().lower().lstrip(".") or "txt"
    return f"{prefix}-{stamp}.{safe_ext}"


def _build_csv_bytes(headers: list[str], rows: list[list]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])
    # UTF-8 BOM pour compatibilité Excel (Windows)
    return buffer.getvalue().encode("utf-8-sig")


def _build_mouvements_csv_rows() -> list[list]:
    mouvements = db.get_mouvements(limit=1_000_000)
    actifs = db.get_actifs()
    actifs_index = {
        int(a.get("id")): a
        for a in actifs
        if a.get("id") is not None
    }

    rows: list[list] = []
    for m in mouvements:
        actif_id = m.get("actif_id")
        actif = actifs_index.get(int(actif_id)) if actif_id is not None else None
        rows.append([
            m.get("id"),
            m.get("date_operation"),
            m.get("enveloppe"),
            m.get("type_operation"),
            m.get("actif_id"),
            (actif or {}).get("nom", ""),
            (actif or {}).get("ticker", ""),
            m.get("quantite"),
            m.get("prix_unitaire"),
            m.get("frais"),
            m.get("montant_brut"),
            m.get("montant_net"),
            m.get("pv_realisee"),
            m.get("created_at"),
        ])
    return rows


def _build_dividendes_csv_rows() -> list[list]:
    dividendes = db.get_dividendes(limit=1_000_000)
    rows: list[list] = []
    for d in dividendes:
        rows.append([
            d.get("id"),
            d.get("date_versement"),
            d.get("enveloppe"),
            d.get("nom"),
            d.get("ticker"),
            d.get("montant"),
            d.get("montant_brut"),
            d.get("retenue_source"),
            d.get("montant_net"),
            d.get("pays_source"),
            d.get("devise_source"),
            d.get("notes"),
            d.get("created_at"),
        ])
    return rows


def _build_fiscal_csv_rows(annee: int) -> list[list]:
    summary = db.get_fiscal_summary(annee)
    rows: list[list] = []

    dividendes = summary.get("dividendes", {})
    cessions = summary.get("cessions", {})
    scores = summary.get("scores_confiance", {})
    manquants = summary.get("manquants", {})
    ifu = summary.get("reconciliation_ifu", {})

    rows.extend([
        ["global", "annee", "annee", summary.get("annee"), "", ""],
        ["global", "scores_confiance", "dividendes", scores.get("dividendes"), "", ""],
        ["global", "scores_confiance", "cessions", scores.get("cessions"), "", ""],
        ["global", "scores_confiance", "global", scores.get("global"), "", ""],
        ["dividendes", "totaux", "total_brut", dividendes.get("total_brut"), "EUR", ""],
        ["dividendes", "totaux", "total_retenue_source", dividendes.get("total_retenue_source"), "EUR", ""],
        ["dividendes", "totaux", "total_net", dividendes.get("total_net"), "EUR", ""],
        ["dividendes", "totaux", "nb", dividendes.get("nb"), "", ""],
        ["cessions", "totaux", "total_pv", cessions.get("total_pv"), "EUR", ""],
        ["cessions", "totaux", "total_mv", cessions.get("total_mv"), "EUR", ""],
        ["cessions", "totaux", "solde", cessions.get("solde"), "EUR", ""],
        ["cessions", "totaux", "nb_cessions", cessions.get("nb_cessions"), "", ""],
    ])

    for env, values in (dividendes.get("par_enveloppe", {}) or {}).items():
        rows.extend([
            ["dividendes", f"par_enveloppe:{env}", "brut", values.get("brut"), "EUR", ""],
            ["dividendes", f"par_enveloppe:{env}", "retenue", values.get("retenue"), "EUR", ""],
            ["dividendes", f"par_enveloppe:{env}", "net", values.get("net"), "EUR", ""],
            ["dividendes", f"par_enveloppe:{env}", "nb", values.get("nb"), "", ""],
        ])

    for source_key, values in (dividendes.get("par_source", {}) or {}).items():
        rows.extend([
            ["dividendes", f"par_source:{source_key}", "enveloppe", values.get("enveloppe"), "", ""],
            ["dividendes", f"par_source:{source_key}", "pays_source", values.get("pays_source"), "", ""],
            ["dividendes", f"par_source:{source_key}", "brut", values.get("brut"), "EUR", ""],
            ["dividendes", f"par_source:{source_key}", "retenue", values.get("retenue"), "EUR", ""],
            ["dividendes", f"par_source:{source_key}", "net", values.get("net"), "EUR", ""],
            ["dividendes", f"par_source:{source_key}", "nb", values.get("nb"), "", ""],
        ])

    for env, values in (cessions.get("par_enveloppe", {}) or {}).items():
        rows.extend([
            ["cessions", f"par_enveloppe:{env}", "pv", values.get("pv"), "EUR", ""],
            ["cessions", f"par_enveloppe:{env}", "mv", values.get("mv"), "EUR", ""],
            ["cessions", f"par_enveloppe:{env}", "solde", values.get("solde"), "EUR", ""],
            ["cessions", f"par_enveloppe:{env}", "nb_cessions", values.get("nb_cessions"), "", ""],
        ])

    div_missing = (manquants.get("dividendes") or {})
    ces_missing = (manquants.get("cessions") or {})
    rows.extend([
        ["qualite", "manquants_dividendes", "sans_detail", div_missing.get("sans_detail"), "", ""],
        ["qualite", "manquants_dividendes", "sans_pays", div_missing.get("sans_pays"), "", ""],
        ["qualite", "manquants_dividendes", "sans_enveloppe", div_missing.get("sans_enveloppe"), "", ""],
        ["qualite", "manquants_cessions", "sans_pv", ces_missing.get("sans_pv"), "", ""],
        ["qualite", "manquants_cessions", "sans_date", ces_missing.get("sans_date"), "", ""],
        ["qualite", "manquants_cessions", "sans_enveloppe", ces_missing.get("sans_enveloppe"), "", ""],
    ])

    ifu_div = (ifu.get("dividendes") or {})
    ifu_ces = (ifu.get("cessions") or {})
    rows.extend([
        ["reconciliation_ifu", "dividendes", "montant_brut_theorique", ifu_div.get("montant_brut_theorique"), "EUR", ""],
        ["reconciliation_ifu", "dividendes", "retenue_source_theorique", ifu_div.get("retenue_source_theorique"), "EUR", ""],
        ["reconciliation_ifu", "dividendes", "montant_net_theorique", ifu_div.get("montant_net_theorique"), "EUR", ""],
        ["reconciliation_ifu", "dividendes", "lignes", ifu_div.get("lignes"), "", ""],
        ["reconciliation_ifu", "cessions", "pv_theorique", ifu_ces.get("pv_theorique"), "EUR", ""],
        ["reconciliation_ifu", "cessions", "mv_theorique", ifu_ces.get("mv_theorique"), "EUR", ""],
        ["reconciliation_ifu", "cessions", "solde_theorique", ifu_ces.get("solde_theorique"), "EUR", ""],
        ["reconciliation_ifu", "cessions", "lignes", ifu_ces.get("lignes"), "", ""],
    ])

    for idx, v in enumerate(summary.get("vigilances", []) or [], start=1):
        rows.append([
            "vigilance",
            f"item:{idx}",
            str(v.get("code") or ""),
            str(v.get("message") or ""),
            "",
            str(v.get("action") or ""),
        ])

    for idx, h in enumerate(summary.get("hypotheses", []) or [], start=1):
        rows.append(["hypothese", f"item:{idx}", "texte", str(h or ""), "", ""])

    return rows


def _csv_download_response(filename_prefix: str, headers: list[str], rows: list[list]) -> Response:
    csv_bytes = _build_csv_bytes(headers, rows)
    filename = _build_export_filename(prefix=filename_prefix, ext="csv")
    return Response(
        csv_bytes,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _build_patrimoine_pdf_bytes(include_ia_comment: bool = True) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    except Exception as exc:
        raise RuntimeError("La dépendance 'reportlab' est requise pour l'export PDF.") from exc

    resume = calcul_resume()
    actifs = _enrichir_avec_tri(db.get_actifs())
    actifs = sorted(actifs, key=lambda a: float(a.get("valeur_actuelle") or 0), reverse=True)
    analyse = None
    if include_ia_comment:
        analyses = db.get_analyses(1)
        analyse = analyses[0] if analyses else None

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TominoTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#111111"),
        spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "TominoSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4a4a4a"),
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "TominoHeading",
        parent=styles["Heading2"],
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#1a1a1a"),
        spaceBefore=6,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "TominoBody",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=34,
        rightMargin=34,
        topMargin=30,
        bottomMargin=24,
        title="Export patrimonial Tomino",
        author="Tomino",
    )
    elements = []

    now_label = _paris_now().strftime("%d/%m/%Y %H:%M")
    elements.append(Paragraph("Tomino - Export PDF patrimonial", title_style))
    elements.append(Paragraph(f"Généré le {escape(now_label)} - Données locales Tomino", subtitle_style))

    elements.append(Paragraph("Résumé global", heading_style))
    global_rows = [
        ["Patrimoine total", _fmt_eur(resume.get("total"))],
        ["Capital investi", _fmt_eur(resume.get("total_investi"))],
        ["Plus-value totale", f"{_fmt_eur(resume.get('pv_total'))} ({_fmt_pct(resume.get('pv_pct'))})"],
    ]
    global_table = Table(global_rows, colWidths=[180, 300])
    global_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f7f7")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111111")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9d9d9")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(global_table)

    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Allocation par enveloppe", heading_style))
    alloc_rows = [["Enveloppe", "Valeur actuelle", "Poids"]]
    alloc_rows += [
        ["PEA", _fmt_eur(resume.get("pea", {}).get("valeur_actuelle")), f"{resume.get('pea', {}).get('pct', 0)}%"],
        ["CTO", _fmt_eur(resume.get("cto", {}).get("valeur_actuelle")), f"{resume.get('cto', {}).get('pct', 0)}%"],
        ["Or", _fmt_eur(resume.get("or", {}).get("valeur_actuelle")), f"{resume.get('or', {}).get('pct', 0)}%"],
        ["Livrets", _fmt_eur(resume.get("livrets", {}).get("valeur_actuelle")), f"{resume.get('livrets', {}).get('pct', 0)}%"],
        ["Assurance vie", _fmt_eur(resume.get("assurance_vie", {}).get("valeur_actuelle")), f"{resume.get('assurance_vie', {}).get('pct', 0)}%"],
    ]
    alloc_table = Table(alloc_rows, colWidths=[160, 190, 130])
    alloc_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ececec")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d0d0d0")),
        ("FONTSIZE", (0, 0), (-1, -1), 8.7),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(alloc_table)

    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Performances (PV/MV latentes)", heading_style))
    perf_rows = [["Enveloppe", "PV/MV", "Performance"]]
    perf_rows += [
        ["PEA", _fmt_eur(resume.get("pea", {}).get("pv_euros")), _fmt_pct(resume.get("pea", {}).get("pv_pct"))],
        ["CTO", _fmt_eur(resume.get("cto", {}).get("pv_euros")), _fmt_pct(resume.get("cto", {}).get("pv_pct"))],
        ["Or", _fmt_eur(resume.get("or", {}).get("pv_euros")), _fmt_pct(resume.get("or", {}).get("pv_pct"))],
        [
            "Assurance vie",
            _fmt_eur(resume.get("assurance_vie", {}).get("pv_euros")),
            _fmt_pct(
                (float(resume.get("assurance_vie", {}).get("pv_euros") or 0) / float(resume.get("assurance_vie", {}).get("valeur_investie") or 1) * 100)
                if float(resume.get("assurance_vie", {}).get("valeur_investie") or 0) > 0 else 0
            ),
        ],
    ]
    perf_table = Table(perf_rows, colWidths=[160, 190, 130])
    perf_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ececec")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d0d0d0")),
        ("FONTSIZE", (0, 0), (-1, -1), 8.7),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(perf_table)

    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Positions principales", heading_style))
    if actifs:
        rows = [["Nom", "Env.", "Qté", "Valeur", "PV/MV"]]
        for a in actifs[:35]:
            rows.append([
                str(a.get("nom") or "-")[:40],
                str(a.get("enveloppe") or "-")[:8],
                str(round(float(a.get("quantite") or 0), 4)).replace(".", ","),
                _fmt_eur(a.get("valeur_actuelle")),
                f"{_fmt_eur(a.get('pv_euros'))} ({_fmt_pct(a.get('pv_pct'))})",
            ])
        pos_table = Table(rows, colWidths=[180, 45, 65, 95, 95])
        pos_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ececec")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d0d0d0")),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(pos_table)
    else:
        elements.append(Paragraph("Aucune position enregistrée.", body_style))

    if include_ia_comment:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("Commentaire IA le plus récent", heading_style))
        if analyse:
            type_analyse = str(analyse.get("type_analyse") or "-")
            date_analyse = str(analyse.get("date") or "-")
            commentaire = _strip_markdown(str(analyse.get("reponse") or ""))
            commentaire = commentaire[:2200] + ("..." if len(commentaire) > 2200 else "")
            elements.append(Paragraph(f"Type: {escape(type_analyse)} | Date: {escape(date_analyse)}", body_style))
            elements.append(Spacer(1, 4))
            for line in commentaire.splitlines():
                clean_line = escape(line.strip())
                if clean_line:
                    elements.append(Paragraph(clean_line, body_style))
        else:
            elements.append(Paragraph("Aucune analyse IA disponible.", body_style))

    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Ce document est un support de suivi patrimonial. Il ne constitue pas un conseil financier.", subtitle_style))

    doc.build(elements)
    return buffer.getvalue()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _normalize_backup_password(value: str | None) -> str:
    pwd = str(value or "")
    return pwd.strip()


def _require_fernet():
    try:
        from cryptography.fernet import Fernet, InvalidToken
    except Exception as exc:
        raise RuntimeError(
            "Chiffrement indisponible: installez le package 'cryptography' (pip install cryptography)."
        ) from exc
    return Fernet, InvalidToken


def _derive_fernet_key(password: str, salt: bytes, iterations: int) -> bytes:
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations), dklen=32)
    return base64.urlsafe_b64encode(derived)


def _encrypt_backup_archive_bytes(plain_archive_bytes: bytes, password: str, manifest: dict) -> bytes:
    Fernet, _InvalidToken = _require_fernet()
    salt = os.urandom(16)
    key = _derive_fernet_key(password, salt, BACKUP_ENCRYPTED_KDF_ITERS)
    fernet = Fernet(key)
    token = fernet.encrypt(plain_archive_bytes)

    payload = {
        "format": BACKUP_ENCRYPTED_FORMAT,
        "version": BACKUP_ENCRYPTED_VERSION,
        "kdf": "pbkdf2-sha256",
        "iterations": BACKUP_ENCRYPTED_KDF_ITERS,
        "salt_b64": base64.b64encode(salt).decode("ascii"),
        "token_b64": base64.b64encode(token).decode("ascii"),
        "inner_format": manifest.get("format"),
        "inner_version": manifest.get("version"),
        "inner_schema_version": manifest.get("schema_version"),
        "inner_sha256": _sha256_bytes(plain_archive_bytes),
        "created_at": _paris_now().isoformat(),
    }
    return BACKUP_ENCRYPTED_MAGIC + json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _decrypt_backup_archive_bytes(encrypted_bytes: bytes, password: str) -> bytes:
    Fernet, InvalidToken = _require_fernet()
    if not encrypted_bytes.startswith(BACKUP_ENCRYPTED_MAGIC):
        raise ValueError("Archive invalide: format chiffré non reconnu.")

    try:
        payload = json.loads(encrypted_bytes[len(BACKUP_ENCRYPTED_MAGIC):].decode("utf-8"))
    except Exception as exc:
        raise ValueError("Archive chiffrée invalide: en-tête illisible.") from exc

    if str(payload.get("format") or "") != BACKUP_ENCRYPTED_FORMAT:
        raise ValueError("Archive chiffrée invalide: format inconnu.")
    if int(payload.get("version") or 0) != BACKUP_ENCRYPTED_VERSION:
        raise ValueError("Archive chiffrée invalide: version non supportée.")

    salt_b64 = str(payload.get("salt_b64") or "")
    token_b64 = str(payload.get("token_b64") or "")
    if not salt_b64 or not token_b64:
        raise ValueError("Archive chiffrée invalide: métadonnées incomplètes.")

    if not password:
        raise ValueError("Mot de passe requis pour cette sauvegarde chiffrée.")

    try:
        salt = base64.b64decode(salt_b64)
        token = base64.b64decode(token_b64)
    except Exception as exc:
        raise ValueError("Archive chiffrée invalide: base64 corrompu.") from exc

    key = _derive_fernet_key(password, salt, int(payload.get("iterations") or BACKUP_ENCRYPTED_KDF_ITERS))
    fernet = Fernet(key)
    try:
        plain_archive_bytes = fernet.decrypt(token)
    except InvalidToken as exc:
        raise ValueError("Mot de passe incorrect ou sauvegarde chiffrée corrompue.") from exc

    expected_inner_sha = str(payload.get("inner_sha256") or "").strip().lower()
    actual_inner_sha = _sha256_bytes(plain_archive_bytes)
    if expected_inner_sha and expected_inner_sha != actual_inner_sha:
        raise ValueError("Sauvegarde chiffrée invalide: empreinte interne incohérente.")

    return plain_archive_bytes


def _unwrap_backup_archive_bytes(archive_bytes: bytes, password: str | None = None) -> tuple[bytes, bool]:
    if archive_bytes.startswith(BACKUP_ENCRYPTED_MAGIC):
        pwd = _normalize_backup_password(password)
        return _decrypt_backup_archive_bytes(archive_bytes, pwd), True
    return archive_bytes, False


def _validate_sqlite_bytes(db_bytes: bytes) -> None:
    if not db_bytes or len(db_bytes) < 128:
        raise ValueError("Archive invalide: base SQLite vide ou corrompue.")

    if not db_bytes.startswith(b"SQLite format 3\x00"):
        raise ValueError("Archive invalide: signature SQLite non reconnue.")

    required_tables = {
        "actifs",
        "livrets",
        "assurance_vie",
        "historique",
        "analyses",
        "profil",
        "dividendes",
        "alertes",
        "comptes_etrangers",
        "mouvements",
        "ia_usage",
    }

    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="tomino-import-", suffix=".db", delete=False) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name

        conn = sqlite3.connect(tmp_path)
        try:
            rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            tables = {str(r[0]) for r in rows}
        finally:
            conn.close()

        missing = sorted(required_tables - tables)
        if missing:
            raise ValueError("Archive invalide: tables manquantes ({})".format(", ".join(missing)))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def _schema_version_from_sqlite_bytes(db_bytes: bytes) -> int:
    """Lit schema_version depuis tomino_meta, replie sur 0 si absent."""
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="tomino-schema-", suffix=".db", delete=False) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name

        conn = sqlite3.connect(tmp_path)
        try:
            row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tomino_meta'").fetchone()
            if not row:
                return 0
            version_row = conn.execute("SELECT value FROM tomino_meta WHERE key='schema_version'").fetchone()
            if not version_row:
                return 0
            try:
                return int(version_row[0])
            except Exception:
                return 0
        finally:
            conn.close()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def _db_overview_from_sqlite_bytes(db_bytes: bytes) -> dict:
    """Retourne un aperçu rapide des données contenues dans une base SQLite en bytes."""
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="tomino-overview-", suffix=".db", delete=False) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name
        return _db_overview_from_path(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def _db_overview_from_path(path: str) -> dict:
    if not path or not os.path.exists(path):
        return {
            "exists": False,
            "size": 0,
            "schema_version": 0,
            "counts": {},
        }

    counts: dict[str, int] = {}
    tables = [
        "actifs",
        "mouvements",
        "livrets",
        "assurance_vie",
        "dividendes",
        "alertes",
        "analyses",
    ]

    conn = sqlite3.connect(path)
    try:
        for table in tables:
            try:
                row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                counts[table] = int((row or [0])[0] or 0)
            except Exception:
                counts[table] = 0

        schema_version = 0
        try:
            meta_row = conn.execute("SELECT value FROM tomino_meta WHERE key='schema_version'").fetchone()
            if meta_row and meta_row[0] is not None:
                schema_version = int(meta_row[0])
        except Exception:
            schema_version = 0

        return {
            "exists": True,
            "size": int(os.path.getsize(path)),
            "schema_version": schema_version,
            "counts": counts,
        }
    finally:
        conn.close()


def _build_backup_archive_bytes() -> tuple[bytes, dict]:
    db_path = db.DB_PATH
    if not os.path.exists(db_path):
        raise RuntimeError("Aucune base locale trouvée à exporter.")

    with open(db_path, "rb") as f:
        db_bytes = f.read()

    if len(db_bytes) > BACKUP_MAX_SIZE_BYTES:
        raise RuntimeError("Base trop volumineuse pour l'export.")

    manifest = {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "schema_version": int(db.get_schema_version() or 0),
        "min_reader_schema_version": int(db.SCHEMA_MIN_IMPORT_VERSION),
        "created_at": _paris_now().isoformat(),
        "db_filename": "patrimoine.sqlite3",
        "db_size": len(db_bytes),
        "db_sha256": _sha256_bytes(db_bytes),
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr(manifest["db_filename"], db_bytes)

    return buffer.getvalue(), manifest


def _extract_backup_archive_bytes(archive_bytes: bytes, password: str | None = None) -> tuple[dict, bytes]:
    if not archive_bytes:
        raise ValueError("Fichier de sauvegarde vide.")
    if len(archive_bytes) > BACKUP_MAX_SIZE_BYTES:
        raise ValueError("Fichier de sauvegarde trop volumineux.")

    raw_archive_bytes, encrypted = _unwrap_backup_archive_bytes(archive_bytes, password=password)

    try:
        with zipfile.ZipFile(io.BytesIO(raw_archive_bytes), mode="r") as zf:
            names = set(zf.namelist())
            if "manifest.json" not in names:
                raise ValueError("Archive invalide: manifest.json manquant.")

            try:
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            except Exception as exc:
                raise ValueError("Archive invalide: manifest.json illisible.") from exc

            if str(manifest.get("format") or "") != BACKUP_FORMAT:
                raise ValueError("Archive invalide: format inconnu.")
            if int(manifest.get("version") or 0) != BACKUP_VERSION:
                raise ValueError("Archive invalide: version non supportée.")

            db_filename = str(manifest.get("db_filename") or "").strip()
            if not db_filename or db_filename not in names:
                raise ValueError("Archive invalide: fichier SQLite manquant.")

            db_bytes = zf.read(db_filename)
    except zipfile.BadZipFile as exc:
        raise ValueError("Archive invalide: fichier non ZIP ou corrompu.") from exc

    expected_size = int(manifest.get("db_size") or -1)
    if expected_size != len(db_bytes):
        raise ValueError("Archive invalide: taille SQLite incohérente.")

    expected_sha = str(manifest.get("db_sha256") or "").strip().lower()
    actual_sha = _sha256_bytes(db_bytes)
    if not expected_sha or expected_sha != actual_sha:
        raise ValueError("Archive invalide: empreinte SHA-256 invalide.")

    _validate_sqlite_bytes(db_bytes)

    manifest_schema_version = manifest.get("schema_version")
    try:
        backup_schema_version = int(manifest_schema_version)
    except Exception:
        backup_schema_version = _schema_version_from_sqlite_bytes(db_bytes)

    if backup_schema_version > int(db.SCHEMA_VERSION):
        raise ValueError(
            "Archive non supportée: cette sauvegarde provient d'une version plus récente de Tomino. "
            "Mettez l'application à jour puis réessayez."
        )

    if backup_schema_version < int(db.SCHEMA_MIN_IMPORT_VERSION):
        raise ValueError(
            "Archive trop ancienne pour cette version de Tomino. "
            "Importez d'abord dans une version intermédiaire puis réexportez."
        )

    manifest["schema_version"] = backup_schema_version
    manifest["encrypted"] = bool(encrypted)
    return manifest, db_bytes


def _auto_backup_write(kind: str, now: datetime.datetime | None = None) -> str:
    current = now or _paris_now()
    archive_bytes, _manifest = _build_backup_archive_bytes()
    os.makedirs(AUTO_BACKUP_DIR, exist_ok=True)

    if kind == "weekly":
        year, week, _ = current.isocalendar()
        stamp = f"{year}W{week:02d}"
    else:
        stamp = current.strftime("%Y%m%d")

    filename = f"{kind}-{stamp}-{current.strftime('%H%M%S')}.tomino-backup"
    final_path = os.path.join(AUTO_BACKUP_DIR, filename)
    tmp_path = final_path + ".tmp"

    with open(tmp_path, "wb") as f:
        f.write(archive_bytes)
    os.replace(tmp_path, final_path)
    return final_path


def _auto_backup_list(kind: str) -> list[str]:
    if not os.path.isdir(AUTO_BACKUP_DIR):
        return []
    prefix = f"{kind}-"
    paths = []
    for name in os.listdir(AUTO_BACKUP_DIR):
        if not name.startswith(prefix) or not name.endswith(".tomino-backup"):
            continue
        paths.append(os.path.join(AUTO_BACKUP_DIR, name))
    return sorted(paths, key=lambda p: os.path.basename(p), reverse=True)


def _auto_backup_exists_for_daily(now: datetime.datetime) -> bool:
    stamp = now.strftime("%Y%m%d")
    prefix = f"daily-{stamp}-"
    return any(os.path.basename(p).startswith(prefix) for p in _auto_backup_list("daily"))


def _auto_backup_exists_for_weekly(now: datetime.datetime) -> bool:
    year, week, _ = now.isocalendar()
    prefix = f"weekly-{year}W{week:02d}-"
    return any(os.path.basename(p).startswith(prefix) for p in _auto_backup_list("weekly"))


def _auto_backup_purge() -> None:
    daily = _auto_backup_list("daily")
    weekly = _auto_backup_list("weekly")

    for old_path in daily[AUTO_BACKUP_DAILY_KEEP:]:
        try:
            os.remove(old_path)
        except Exception:
            pass

    for old_path in weekly[AUTO_BACKUP_WEEKLY_KEEP:]:
        try:
            os.remove(old_path)
        except Exception:
            pass


def _run_auto_backup_cycle(now: datetime.datetime | None = None) -> None:
    current = now or _paris_now()
    try:
        created = []
        if not _auto_backup_exists_for_daily(current):
            created.append(os.path.basename(_auto_backup_write("daily", current)))

        if current.weekday() == 0 and not _auto_backup_exists_for_weekly(current):
            created.append(os.path.basename(_auto_backup_write("weekly", current)))

        _auto_backup_purge()
        if created:
            app.logger.info("Auto-backup: %s", ", ".join(created))
    except Exception as exc:
        app.logger.warning("Auto-backup: %s", exc)


def _auto_backup_status_payload() -> dict:
    daily = _auto_backup_list("daily")
    weekly = _auto_backup_list("weekly")

    def _meta(path: str | None) -> dict | None:
        if not path:
            return None
        try:
            stat = os.stat(path)
            return {
                "filename": os.path.basename(path),
                "size": int(stat.st_size),
                "updated_at": datetime.datetime.fromtimestamp(stat.st_mtime, tz=PARIS_TZ).isoformat(),
            }
        except Exception:
            return {"filename": os.path.basename(path), "size": 0, "updated_at": ""}

    return {
        "ok": True,
        "dir": AUTO_BACKUP_DIR,
        "daily_keep": AUTO_BACKUP_DAILY_KEEP,
        "weekly_keep": AUTO_BACKUP_WEEKLY_KEEP,
        "daily_count": len(daily),
        "weekly_count": len(weekly),
        "last_daily": _meta(daily[0] if daily else None),
        "last_weekly": _meta(weekly[0] if weekly else None),
    }


def _open_auto_backup_dir() -> None:
    os.makedirs(AUTO_BACKUP_DIR, exist_ok=True)
    if os.name == "nt":
        os.startfile(AUTO_BACKUP_DIR)  # type: ignore[attr-defined]
        return
    if sys.platform == "darwin":
        subprocess.Popen(["open", AUTO_BACKUP_DIR])
        return
    subprocess.Popen(["xdg-open", AUTO_BACKUP_DIR])


def _backup_scheduler():
    while True:
        now = _paris_now()
        target = now.replace(hour=3, minute=40, second=0, microsecond=0)
        if now >= target:
            target += datetime.timedelta(days=1)
        time.sleep((target - now).total_seconds())
        _run_auto_backup_cycle(_paris_now())


def _set_cours_status(*, cours_ok: bool | None = None, derniere_maj_dt: datetime.datetime | None = None, prochaine_maj_dt: datetime.datetime | None = None):
    with _COURS_STATUS_LOCK:
        if cours_ok is not None:
            _COURS_STATUS["cours_ok"] = cours_ok
        if derniere_maj_dt is not None:
            _COURS_STATUS["derniere_maj_dt"] = derniere_maj_dt
        _COURS_STATUS["prochaine_maj_dt"] = prochaine_maj_dt


def _build_status_payload():
    now = _paris_now()
    market_open = _marche_ouvert(now)
    with _COURS_STATUS_LOCK:
        cours_ok = bool(_COURS_STATUS["cours_ok"])
        last_refresh = _COURS_STATUS["derniere_maj_dt"]
        next_refresh = _COURS_STATUS["prochaine_maj_dt"]

    if not market_open:
      next_refresh = _next_market_open(now)

    return {
        "cours_ok": cours_ok,
        "derniere_maj": _format_dt_fr(last_refresh),
        "marche_ouvert": market_open,
        "prochaine_maj": _format_relative_delay(next_refresh, now),
    }


def _sync_dividendes_quotidien(now: datetime.datetime):
    global _last_dividend_check
    today = now.date().isoformat()
    if now.hour < 18 or _last_dividend_check == today:
        return

    try:
        nouveaux = prices.import_dividendes_auto()
        _last_dividend_check = today
        if nouveaux > 0:
            app.logger.info("Import auto dividendes: %s nouveau(x)", nouveaux)
    except Exception as exc:
        app.logger.warning("Import auto dividendes: %s", exc)


def _cours_scheduler():
    while True:
        now = _paris_now()
        _sync_dividendes_quotidien(now)

        if not _marche_ouvert(now):
            _set_cours_status(prochaine_maj_dt=_next_market_open(now))
            time.sleep(60)
            continue

        try:
            prices.vider_cache_ancien(max_age=60)  # Purge cache > 60s
            calcul_resume(force=True)
            try:
                prices.verifier_alertes()
            except Exception as exc_alertes:
                app.logger.warning("verifier_alertes: %s", exc_alertes)
            refreshed_at = _paris_now()
            _sync_dividendes_quotidien(refreshed_at)
            _set_cours_status(
                cours_ok=True,
                derniere_maj_dt=refreshed_at,
                prochaine_maj_dt=refreshed_at + datetime.timedelta(minutes=2),
            )
        except Exception as exc:
            app.logger.exception("Erreur lors du rafraîchissement automatique des cours: %s", exc)
            _set_cours_status(
                cours_ok=False,
                prochaine_maj_dt=_paris_now() + datetime.timedelta(minutes=2),
            )

        time.sleep(120)  # 2 minutes au lieu de 5

# -- HELPERS -------------------------------------------------------------------
def _clean_env(env: str | None) -> str:
    env_value = (env or "PEA").upper().strip()
    return env_value if env_value in ("PEA", "CTO", "OR") else "PEA"


def _to_float(value, default=0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _actif_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    return {
        "nom": str(payload.get("nom", base.get("nom", ""))).strip(),
        "ticker": str(payload.get("ticker", base.get("ticker", ""))).upper().strip(),
        "quantite": _to_float(payload.get("quantite", base.get("quantite", 0))),
        "pru": _to_float(payload.get("pru", base.get("pru", 0))),
        "type": str(payload.get("type", base.get("type", "action") or "action")).strip() or "action",
        "categorie": str(payload.get("categorie", base.get("categorie", "coeur") or "coeur")).strip() or "coeur",
        "date_achat": str(payload.get("date_achat", base.get("date_achat", ""))).strip(),
        "notes": str(payload.get("notes", base.get("notes", ""))).strip(),
    }


def _livret_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    return {
        "nom": str(payload.get("nom", base.get("nom", ""))).strip(),
        "capital": _to_float(payload.get("capital", base.get("capital", 0))),
        "taux": _to_float(payload.get("taux", base.get("taux", 0))),
        "date_maj": str(payload.get("date_maj", base.get("date_maj", ""))).strip(),
        "notes": str(payload.get("notes", base.get("notes", ""))).strip(),
    }


def _assurance_vie_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    type_support = str(payload.get("type_support", base.get("type_support", "mixte"))).strip().lower() or "mixte"
    if type_support not in ("fonds_euros", "uc", "mixte"):
        type_support = "mixte"

    return {
        "nom": str(payload.get("nom", base.get("nom", ""))).strip(),
        "assureur": str(payload.get("assureur", base.get("assureur", ""))).strip(),
        "type_support": type_support,
        "versements": _to_float(payload.get("versements", base.get("versements", 0))),
        "valeur_actuelle": _to_float(payload.get("valeur_actuelle", base.get("valeur_actuelle", 0))),
        "date_maj": str(payload.get("date_maj", base.get("date_maj", ""))).strip(),
        "notes": str(payload.get("notes", base.get("notes", ""))).strip(),
    }


def _dividende_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    montant_legacy = _to_float(payload.get("montant", base.get("montant", 0)))
    montant_brut = _to_float(payload.get("montant_brut", base.get("montant_brut", montant_legacy)))
    retenue_source = _to_float(payload.get("retenue_source", base.get("retenue_source", 0)))
    montant_net = _to_float(payload.get("montant_net", base.get("montant_net", montant_legacy)))

    return {
        "ticker": str(payload.get("ticker", base.get("ticker", ""))).upper().strip(),
        "nom": str(payload.get("nom", base.get("nom", ""))).strip(),
        "montant": montant_brut,
        "montant_brut": montant_brut,
        "retenue_source": retenue_source,
        "montant_net": montant_net,
        "pays_source": str(payload.get("pays_source", base.get("pays_source", ""))).strip(),
        "devise_source": str(payload.get("devise_source", base.get("devise_source", "EUR"))).upper().strip() or "EUR",
        "date_versement": str(payload.get("date_versement", base.get("date_versement", ""))).strip(),
        "enveloppe": str(payload.get("enveloppe", base.get("enveloppe", ""))).strip(),
        "notes": str(payload.get("notes", base.get("notes", ""))).strip(),
    }


def _validate_dividende_data(data: dict) -> tuple[bool, str | None]:
    if not data["nom"]:
        return False, "Champ 'nom' obligatoire."
    if not data["date_versement"]:
        return False, "Champ 'date_versement' obligatoire."
    if not _safe_iso_date(data["date_versement"]):
        return False, "Date de versement invalide (format attendu: YYYY-MM-DD)."
    if data["montant_brut"] <= 0:
        return False, "Le montant brut doit être strictement positif."
    if data["retenue_source"] < 0:
        return False, "La retenue à la source ne peut pas être négative."
    if data["montant_net"] < 0:
        return False, "Le montant net ne peut pas être négatif."
    if data["montant_net"] > data["montant_brut"]:
        return False, "Le montant net ne peut pas dépasser le montant brut."
    if data["retenue_source"] > data["montant_brut"]:
        return False, "La retenue à la source ne peut pas dépasser le montant brut."
    return True, None


def _alerte_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    type_val = str(payload.get("type_alerte", base.get("type_alerte", "hausse"))).strip().lower()
    if type_val not in ("hausse", "baisse"):
        type_val = "hausse"
    return {
        "ticker": str(payload.get("ticker", base.get("ticker", ""))).upper().strip(),
        "nom": str(payload.get("nom", base.get("nom", ""))).strip(),
        "type_alerte": type_val,
        "seuil": _to_float(payload.get("seuil", base.get("seuil", 0))),
    }


def _compte_etranger_payload(payload: dict, existing: dict | None = None) -> dict:
    base = existing or {}
    type_compte = str(payload.get("type_compte", base.get("type_compte", "titres"))).strip().lower() or "titres"
    if type_compte not in TYPE_COMPTE_ALLOWED:
        type_compte = "autre"

    titulaire = str(payload.get("titulaire", base.get("titulaire", "titulaire"))).strip().lower() or "titulaire"
    if titulaire not in TITULAIRE_ALLOWED:
        titulaire = "titulaire"

    detention_mode = str(payload.get("detention_mode", base.get("detention_mode", "directe"))).strip().lower() or "directe"
    if detention_mode not in DETENTION_ALLOWED:
        detention_mode = "directe"

    actif_numerique_raw = payload.get("actif_numerique", base.get("actif_numerique", 0))
    actif_numerique = 1 if str(actif_numerique_raw).strip().lower() in ("1", "true", "oui", "on") else 0

    return {
        "etablissement": str(payload.get("etablissement", base.get("etablissement", ""))).strip(),
        "pays": str(payload.get("pays", base.get("pays", ""))).strip(),
        "adresse": str(payload.get("adresse", base.get("adresse", ""))).strip(),
        "etablissement_ville": str(payload.get("etablissement_ville", base.get("etablissement_ville", ""))).strip(),
        "etablissement_code_postal": str(payload.get("etablissement_code_postal", base.get("etablissement_code_postal", ""))).strip(),
        "etablissement_identifiant": str(payload.get("etablissement_identifiant", base.get("etablissement_identifiant", ""))).strip(),
        "numero_compte": str(payload.get("numero_compte", base.get("numero_compte", ""))).strip(),
        "date_ouverture": str(payload.get("date_ouverture", base.get("date_ouverture", ""))).strip(),
        "date_cloture": str(payload.get("date_cloture", base.get("date_cloture", ""))).strip(),
        "type_compte": type_compte,
        "type_compte_detail": str(payload.get("type_compte_detail", base.get("type_compte_detail", ""))).strip(),
        "titulaire": titulaire,
        "titulaire_nom": str(payload.get("titulaire_nom", base.get("titulaire_nom", ""))).strip(),
        "co_titulaire_nom": str(payload.get("co_titulaire_nom", base.get("co_titulaire_nom", ""))).strip(),
        "detention_mode": detention_mode,
        "actif_numerique": actif_numerique,
        "plateforme_actifs_numeriques": str(payload.get("plateforme_actifs_numeriques", base.get("plateforme_actifs_numeriques", ""))).strip(),
        "wallet_adresse": str(payload.get("wallet_adresse", base.get("wallet_adresse", ""))).strip(),
        "commentaire": str(payload.get("commentaire", base.get("commentaire", ""))).strip(),
    }


def _operation_payload(payload: dict) -> dict:
    op = str(payload.get("type_operation", "")).strip().lower()
    if op not in ("achat", "vente"):
        op = ""

    return {
        "type_operation": op,
        "quantite": _to_float(payload.get("quantite", 0)),
        "prix_unitaire": _to_float(payload.get("prix_unitaire", 0)),
        "frais": _to_float(payload.get("frais", 0)),
        "date_operation": str(payload.get("date_operation", "")).strip(),
    }


def _mouvement_edit_payload(payload: dict, existing: dict) -> dict:
    return {
        "quantite": _to_float(payload.get("quantite", existing.get("quantite", 0))),
        "prix_unitaire": _to_float(payload.get("prix_unitaire", existing.get("prix_unitaire", 0))),
        "frais": _to_float(payload.get("frais", existing.get("frais", 0))),
        "date_operation": str(payload.get("date_operation", existing.get("date_operation", ""))).strip(),
    }


def _safe_iso_date(value: str | None) -> datetime.date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.date.fromisoformat(raw[:10])
    except Exception:
        return None


def _normalize_for_match(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _mask_identifier(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 4:
        return raw
    return f"{raw[:2]}***{raw[-2:]}"


def _find_probable_duplicate(compte_data: dict, existing_id: int | None = None) -> dict | None:
    key_a = _normalize_for_match(compte_data.get("etablissement"))
    key_b = _normalize_for_match(compte_data.get("pays"))
    key_c = _normalize_for_match(compte_data.get("numero_compte") or compte_data.get("wallet_adresse"))
    if not key_a or not key_b:
        return None

    for current in db.get_comptes_etrangers():
        if existing_id and int(current.get("id") or 0) == int(existing_id):
            continue
        same_bank = _normalize_for_match(current.get("etablissement")) == key_a
        same_country = _normalize_for_match(current.get("pays")) == key_b
        same_identifier = _normalize_for_match(current.get("numero_compte") or current.get("wallet_adresse")) == key_c if key_c else False
        if same_bank and same_country and (same_identifier or key_c == ""):
            return current
    return None


def _validate_compte_etranger(data: dict, existing_id: int | None = None) -> tuple[bool, str | None, list[dict]]:
    alerts: list[dict] = []

    if not data["etablissement"]:
        return False, "Champ 'etablissement' obligatoire.", alerts
    if not data["pays"]:
        return False, "Champ 'pays' obligatoire.", alerts

    ouverture = _safe_iso_date(data.get("date_ouverture"))
    cloture = _safe_iso_date(data.get("date_cloture"))
    if data.get("date_ouverture") and not ouverture:
        return False, "Date d'ouverture invalide (format attendu: YYYY-MM-DD).", alerts
    if data.get("date_cloture") and not cloture:
        return False, "Date de clôture invalide (format attendu: YYYY-MM-DD).", alerts
    if ouverture and cloture and cloture < ouverture:
        return False, "Incohérence de dates: la clôture est antérieure à l'ouverture.", alerts

    if data.get("titulaire") == "cotitulaire" and not data.get("co_titulaire_nom"):
        alerts.append({
            "code": "co_titulaire_nom_manquant",
            "message": "Nom du co-titulaire recommandé pour faciliter la préparation 3916.",
            "action": "Renseignez le nom du co-titulaire.",
            "niveau": "attention",
        })

    if data.get("titulaire") in ("titulaire", "mandataire") and not data.get("titulaire_nom"):
        alerts.append({
            "code": "titulaire_nom_manquant",
            "message": "Nom du titulaire non renseigné.",
            "action": "Ajoutez le nom du titulaire principal.",
            "niveau": "attention",
        })

    is_crypto = data.get("type_compte") == "crypto" or int(data.get("actif_numerique") or 0) == 1
    if is_crypto and not (data.get("plateforme_actifs_numeriques") or data.get("wallet_adresse") or data.get("numero_compte")):
        return False, "Pour un compte d'actifs numériques (3916-bis), renseignez au moins une plateforme ou une adresse wallet.", alerts

    duplicate = _find_probable_duplicate(data, existing_id=existing_id)
    if duplicate:
        return False, (
            "Doublon probable détecté avec un compte existant "
            f"({duplicate.get('etablissement')} / {duplicate.get('pays')} / {_mask_identifier(duplicate.get('numero_compte') or duplicate.get('wallet_adresse'))})."
        ), alerts

    return True, None, alerts


def _compte_est_declarable_annee(compte: dict, annee: int) -> dict:
    debut = datetime.date(annee, 1, 1)
    fin = datetime.date(annee, 12, 31)
    ouvert_le = _safe_iso_date(compte.get("date_ouverture"))
    cloture_le = _safe_iso_date(compte.get("date_cloture"))
    trace = []
    vigilances = []

    if compte.get("date_ouverture") and not ouvert_le:
        vigilances.append("Date d'ouverture invalide: vérification manuelle nécessaire.")
        trace.append("date_ouverture_invalide")
    if compte.get("date_cloture") and not cloture_le:
        vigilances.append("Date de clôture invalide: vérification manuelle nécessaire.")
        trace.append("date_cloture_invalide")

    if ouvert_le and cloture_le and cloture_le < ouvert_le:
        return {
            "declarable": False,
            "motif": "incoherent_dates",
            "motif_label": "Incohérence de dates",
            "trace": trace + ["cloture_avant_ouverture"],
            "vigilances": [
                *vigilances,
                "La date de clôture est antérieure à la date d'ouverture.",
            ],
        }

    if not ouvert_le:
        trace.append("date_ouverture_manquante")
        return {
            "declarable": True,
            "motif": "date_ouverture_manquante",
            "motif_label": "Date d'ouverture manquante (à vérifier)",
            "trace": trace,
            "vigilances": [
                *vigilances,
                "Date d'ouverture non renseignée: compte conservé par prudence.",
            ],
        }

    if ouvert_le > fin:
        return {
            "declarable": False,
            "motif": "ouvert_apres",
            "motif_label": "Ouvert après l'année fiscale",
            "trace": trace + ["ouverture_apres_fin_annee"],
            "vigilances": vigilances,
        }
    if cloture_le and cloture_le < debut:
        return {
            "declarable": False,
            "motif": "clos_avant",
            "motif_label": "Clôturé avant l'année fiscale",
            "trace": trace + ["cloture_avant_debut_annee"],
            "vigilances": vigilances,
        }

    if debut <= ouvert_le <= fin and cloture_le and debut <= cloture_le <= fin:
        return {
            "declarable": True,
            "motif": "ouvert_et_clos_dans_annee",
            "motif_label": "Ouvert puis clôturé pendant l'année",
            "trace": trace + ["ouverture_dans_annee", "cloture_dans_annee"],
            "vigilances": vigilances,
        }

    if debut <= ouvert_le <= fin:
        return {
            "declarable": True,
            "motif": "ouvert_dans_annee",
            "motif_label": "Ouvert pendant l'année",
            "trace": trace + ["ouverture_dans_annee"],
            "vigilances": vigilances,
        }
    if cloture_le and debut <= cloture_le <= fin:
        return {
            "declarable": True,
            "motif": "clos_dans_annee",
            "motif_label": "Clôturé pendant l'année",
            "trace": trace + ["cloture_dans_annee"],
            "vigilances": vigilances,
        }
    return {
        "declarable": True,
        "motif": "actif_sur_annee",
        "motif_label": "Actif sur l'année",
        "trace": trace + ["actif_sur_periode"],
        "vigilances": vigilances,
    }


def _last_inserted_id(table_name: str) -> int | None:
    try:
        conn = db.get_db()
        row = conn.execute(f"SELECT MAX(id) AS id FROM {table_name}").fetchone()
        conn.close()
        return int(row["id"]) if row and row["id"] is not None else None
    except Exception:
        return None


def _enrichir_avec_tri(actifs_bruts: list[dict]) -> list[dict]:
    enrichis = prices.enrichir_actifs(actifs_bruts)
    for a in enrichis:
        a["tri"] = calculs.tri_position(a)
    return enrichis


def calcul_resume(force: bool = False):
    """Resume patrimonial avec valorisation aux cours reels."""
    if not force:
        with _RESUME_CACHE_LOCK:
            cached = _RESUME_CACHE.get("data")
            cached_at = float(_RESUME_CACHE.get("timestamp") or 0.0)
            if cached is not None and time.time() - cached_at < RESUME_CACHE_TTL:
                return cached

    pea_raw = db.get_actifs("PEA")
    cto_raw = db.get_actifs("CTO")
    or_raw = db.get_actifs("OR")
    livrets = db.get_livrets()
    assurance_vie = db.get_assurance_vie()

    actifs_enrichis = prices.enrichir_actifs(pea_raw + cto_raw + or_raw)
    pea = [a for a in actifs_enrichis if a.get("enveloppe") == "PEA"]
    cto = [a for a in actifs_enrichis if a.get("enveloppe") == "CTO"]
    or_ = [a for a in actifs_enrichis if a.get("enveloppe") == "OR"]

    stats_pea = prices.calcul_stats_enveloppe(pea)
    stats_cto = prices.calcul_stats_enveloppe(cto)
    stats_or = prices.calcul_stats_enveloppe(or_)

    val_livrets = sum(l.get("capital") or 0 for l in livrets)
    val_assurance_vie = sum(_to_float(c.get("valeur_actuelle"), 0) for c in assurance_vie)
    inv_assurance_vie = sum(_to_float(c.get("versements"), 0) for c in assurance_vie)
    total = stats_pea["valeur_actuelle"] + stats_cto["valeur_actuelle"] + stats_or["valeur_actuelle"] + val_livrets + val_assurance_vie
    total_investi = stats_pea["valeur_investie"] + stats_cto["valeur_investie"] + stats_or["valeur_investie"] + val_livrets + inv_assurance_vie
    pv_total = total - total_investi

    def pct(v):
        return round(v / total * 100, 1) if total > 0 else 0

    resume = {
        "total": round(total, 2),
        "total_investi": round(total_investi, 2),
        "pv_total": round(pv_total, 2),
        "pv_pct": round(pv_total / total_investi * 100, 2) if total_investi > 0 else 0,
        "pea": {**stats_pea, "pct": pct(stats_pea["valeur_actuelle"])},
        "cto": {**stats_cto, "pct": pct(stats_cto["valeur_actuelle"])},
        "or": {**stats_or, "pct": pct(stats_or["valeur_actuelle"])},
        "livrets": {"valeur_actuelle": val_livrets, "pct": pct(val_livrets), "nb": len(livrets)},
        "assurance_vie": {
            "valeur_actuelle": round(val_assurance_vie, 2),
            "valeur_investie": round(inv_assurance_vie, 2),
            "pv_euros": round(val_assurance_vie - inv_assurance_vie, 2),
            "pct": pct(val_assurance_vie),
            "nb": len(assurance_vie),
        },
    }

    with _RESUME_CACHE_LOCK:
        _RESUME_CACHE["data"] = resume
        _RESUME_CACHE["timestamp"] = time.time()

    return resume


if not DISABLE_STARTUP_TASKS:
    _run_auto_backup_cycle(_paris_now())

    today_str = _paris_now().date().isoformat()
    if db.get_last_snapshot_date() != today_str:
        try:
            _do_snapshot()
        except Exception as e:
            app.logger.warning("snapshot démarrage raté: %s", e)

    _t = threading.Thread(target=_snapshot_scheduler, daemon=True)
    _t.start()

    _cours_t = threading.Thread(target=_cours_scheduler, daemon=True)
    _cours_t.start()

    _backup_t = threading.Thread(target=_backup_scheduler, daemon=True)
    _backup_t.start()


# -- API JSON ------------------------------------------------------------------
@app.route("/")
def api_root():
    return jsonify({
        "ok": True,
        "message": "Tomino API active",
        "hint": "Utilise les endpoints /api/*",
        "endpoints": [
            "/api/resume",
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/password-reset/request",
            "/api/auth/password-reset/confirm",
            "/api/auth/provider/link",
            "/api/auth/logout",
            "/api/auth/logout-all",
            "/api/auth/me",
            "/api/plans",
            "/api/billing/subscription",
            "/api/billing/change-plan",
            "/api/billing/checkout-session",
            "/api/billing/portal-session",
            "/api/billing/webhook",
            "/api/devices",
            "/api/devices/revoke",
            "/api/sync/pause",
            "/api/sync/resume",
            "/api/sync/events?since=0&limit=200",
            "/api/sync/events/apply",
            "/api/actifs?env=PEA",
            "/api/actifs/all",
            "/api/livrets",
            "/api/assurance-vie",
            "/api/historique",
            "/api/benchmark?ticker=CW8.PA&depuis=2025-01-01",
            "/api/repartition?env=PEA",
            "/api/export/pdf/patrimoine",
            "/api/export/backup",
            "/api/import/backup",
            "/api/import/backup/verify",
            "/api/backup/auto/status",
            "/api/backup/auto/open-folder",
            "/api/export/csv/mouvements",
            "/api/export/csv/dividendes",
            "/api/export/csv/fiscal?annee=2025",
            "/api/grok/historique",
        ],
    })


@app.route("/api/resume")
def api_resume():
    return jsonify(calcul_resume())


@app.route("/api/status")
def api_status():
    return jsonify(_build_status_payload())


@app.route("/api/auth/register", methods=["POST"])
def api_auth_register():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    requested_tier = _auth_normalize_tier(payload.get("tier"))
    if _billing_provider() == "stripe" and requested_tier == "tomino_plus":
        # In Stripe mode, paid tiers must come from checkout/webhook confirmation.
        requested_tier = "free"
    device_id = _auth_normalize_device_id(payload.get("device_id"))
    device_label = str(payload.get("device_label") or "").strip() or None

    if not _auth_email_is_valid(email):
        _auth_audit("register", False, email=email, device_id=device_id, reason="invalid_email")
        return jsonify({"ok": False, "erreur": "Email invalide."}), 400
    if len(password) < 8:
        _auth_audit("register", False, email=email, device_id=device_id, reason="short_password")
        return jsonify({"ok": False, "erreur": "Mot de passe trop court (8 caractères minimum)."}), 400
    if db.get_user_by_email(email):
        _auth_audit("register", False, email=email, device_id=device_id, reason="already_exists")
        return jsonify({"ok": False, "erreur": "Un compte existe déjà pour cet email."}), 409

    try:
        user = db.create_user(email=email, password_hash=_auth_hash_password(password), tier=requested_tier)
        device = db.upsert_user_device(int(user.get("id")), device_id=device_id, device_label=device_label)
        if device and device.get("revoked_at"):
            _auth_audit("register", False, user_id=int(user.get("id") or 0), email=email, device_id=device_id, reason="device_revoked")
            return jsonify({"ok": False, "erreur": "Cet appareil est révoqué pour ce compte."}), 403
        session = _auth_issue_session(int(user.get("id")), device_id=device_id, device_label=device_label)
        db.rotate_user_sessions(int(user.get("id")), keep_latest=AUTH_MAX_ACTIVE_SESSIONS)
        _auth_audit("register", True, user_id=int(user.get("id") or 0), email=email, device_id=device_id)
        return jsonify({
            "ok": True,
            "user": {
                "id": int(user.get("id")),
                "email": user.get("email"),
                "auth_provider": user.get("auth_provider", "local"),
                "tier": user.get("tier", "free"),
                "tier_label": _auth_tier_label(user.get("tier", "free")),
                "tomino_plus": _auth_is_tomino_plus(user),
            },
            "token": session.get("token"),
            "expires_at": session.get("expires_at"),
            "device": {
                "device_id": device_id,
                "device_label": (device or {}).get("device_label") or device_label,
                "sync_paused": bool(int((device or {}).get("sync_paused") or 0)),
            },
        })
    except sqlite3.IntegrityError:
        _auth_audit("register", False, email=email, device_id=device_id, reason="integrity_error")
        return jsonify({"ok": False, "erreur": "Un compte existe déjà pour cet email."}), 409


@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    device_id = _auth_normalize_device_id(payload.get("device_id"))
    device_label = str(payload.get("device_label") or "").strip() or None
    client_ip = _auth_client_ip()

    limited, retry_after = _auth_login_check_rate_limit(email, client_ip)
    if limited:
        _auth_audit("login", False, email=email, device_id=device_id, reason="rate_limited")
        return jsonify({
            "ok": False,
            "erreur": "Trop de tentatives de connexion. Réessayez plus tard.",
            "retry_after": retry_after,
        }), 429

    user = db.get_user_by_email(email)
    if not user or not _auth_verify_password(password, str(user.get("password_hash") or "")):
        _auth_login_record_failure(email, client_ip)
        _auth_audit("login", False, email=email, device_id=device_id, reason="invalid_credentials")
        return jsonify({"ok": False, "erreur": "Identifiants invalides."}), 401

    device = db.upsert_user_device(int(user.get("id")), device_id=device_id, device_label=device_label)
    if device and device.get("revoked_at"):
        _auth_audit("login", False, user_id=int(user.get("id") or 0), email=email, device_id=device_id, reason="device_revoked")
        return jsonify({"ok": False, "erreur": "Cet appareil est révoqué pour ce compte."}), 403

    _auth_login_record_success(email, client_ip)
    session = _auth_issue_session(int(user.get("id")), device_id=device_id, device_label=device_label)
    db.rotate_user_sessions(int(user.get("id")), keep_latest=AUTH_MAX_ACTIVE_SESSIONS)
    _auth_audit("login", True, user_id=int(user.get("id") or 0), email=email, device_id=device_id)
    return jsonify({
        "ok": True,
        "user": {
            "id": int(user.get("id")),
            "email": user.get("email"),
            "auth_provider": user.get("auth_provider", "local"),
            "tier": user.get("tier", "free"),
            "tier_label": _auth_tier_label(user.get("tier", "free")),
            "tomino_plus": _auth_is_tomino_plus(user),
        },
        "token": session.get("token"),
        "expires_at": session.get("expires_at"),
        "device": {
            "device_id": device_id,
            "device_label": (device or {}).get("device_label") or device_label,
            "sync_paused": bool(int((device or {}).get("sync_paused") or 0)),
        },
    })


@app.route("/api/auth/password-reset/request", methods=["POST"])
def api_auth_password_reset_request():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()

    # Réponse volontairement générique pour éviter l'énumération des emails.
    generic_message = "Si cet email existe, un lien de réinitialisation a été émis."

    if not _auth_email_is_valid(email):
        _auth_audit("password_reset_request", False, email=email, reason="invalid_email")
        return jsonify({"ok": True, "message": generic_message})

    user = db.get_user_by_email(email)
    if not user:
        _auth_audit("password_reset_request", False, email=email, reason="user_not_found")
        return jsonify({"ok": True, "message": generic_message})

    try:
        raw_token, expires_at = _auth_issue_password_reset_token(int(user.get("id") or 0))
        _auth_audit("password_reset_request", True, user_id=int(user.get("id") or 0), email=email)

        response_payload = {
            "ok": True,
            "message": generic_message,
            "expires_at": expires_at,
        }
        if AUTH_PASSWORD_RESET_EXPOSE_TOKEN or _billing_provider() == "local":
            response_payload["reset_token"] = raw_token
            response_payload["warning"] = "Mode local: token renvoyé directement (pas d'email configuré)."
        return jsonify(response_payload)
    except Exception:
        _auth_audit("password_reset_request", False, user_id=int(user.get("id") or 0), email=email, reason="token_issue_failed")
        return jsonify({"ok": True, "message": generic_message})


@app.route("/api/auth/password-reset/confirm", methods=["POST"])
def api_auth_password_reset_confirm():
    payload = request.get_json(silent=True) or {}
    token = str(payload.get("token") or "").strip()
    new_password = str(payload.get("password") or "")

    if not token:
        return jsonify({"ok": False, "erreur": "Token de réinitialisation requis."}), 400
    if len(new_password) < 8:
        return jsonify({"ok": False, "erreur": "Mot de passe trop court (8 caractères minimum)."}), 400

    token_hash = _auth_hash_token(token)
    token_row = db.get_password_reset_token(token_hash)
    if not token_row or token_row.get("used_at") or _auth_is_password_reset_token_expired(token_row):
        _auth_audit("password_reset_confirm", False, reason="invalid_or_expired_token")
        return jsonify({"ok": False, "erreur": "Token invalide ou expiré."}), 400

    user_id = int(token_row.get("user_id") or 0)
    user = db.get_user_by_id(user_id)
    if not user:
        _auth_audit("password_reset_confirm", False, reason="user_not_found")
        return jsonify({"ok": False, "erreur": "Utilisateur introuvable."}), 404

    try:
        updated = db.update_user_password_hash(user_id, _auth_hash_password(new_password))
        if not updated:
            _auth_audit("password_reset_confirm", False, user_id=user_id, email=user.get("email"), reason="update_failed")
            return jsonify({"ok": False, "erreur": "Réinitialisation impossible."}), 500

        db.mark_password_reset_token_used(token_hash)
        db.revoke_all_user_sessions(user_id)
        _auth_audit("password_reset_confirm", True, user_id=user_id, email=user.get("email"))

        return jsonify({
            "ok": True,
            "message": "Mot de passe réinitialisé. Reconnectez-vous.",
            "revoked_sessions": True,
        })
    except Exception as e:
        _auth_audit("password_reset_confirm", False, user_id=user_id, email=user.get("email"), reason="exception")
        return jsonify({"ok": False, "erreur": f"Réinitialisation impossible: {e}"}), 500


@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    user, session = _auth_optional_user_session()
    token = _auth_extract_token()
    if not token:
        return jsonify({"ok": True, "revoked": False})
    revoked = db.revoke_user_session(_auth_hash_token(token))
    if user or revoked:
        _auth_audit(
            "logout",
            bool(revoked),
            user_id=int((user or {}).get("id") or 0) if user else None,
            email=(user or {}).get("email") if user else None,
            device_id=(session or {}).get("device_id") if session else None,
            reason=None if revoked else "token_not_found",
        )
    return jsonify({"ok": True, "revoked": bool(revoked)})


@app.route("/api/auth/logout-all", methods=["POST"])
def api_auth_logout_all():
    user, session, error = _auth_required_user()
    if error:
        return error

    token = _auth_extract_token()
    token_hash = _auth_hash_token(token) if token else None
    revoked_count = db.revoke_all_user_sessions(int(user.get("id") or 0), except_token_hash=token_hash)
    _auth_audit(
        "logout_all",
        True,
        user_id=int(user.get("id") or 0),
        email=user.get("email"),
        device_id=session.get("device_id"),
        reason=f"revoked={int(revoked_count or 0)}",
    )
    return jsonify({"ok": True, "revoked_sessions": int(revoked_count or 0)})


@app.route("/api/auth/me")
def api_auth_me():
    user, session, error = _auth_required_user()
    if error:
        return error
    return jsonify({
        "ok": True,
        "user": {
            "id": int(user.get("id")),
            "email": user.get("email"),
            "auth_provider": user.get("auth_provider", "local"),
            "tier": user.get("tier", "free"),
            "tier_label": _auth_tier_label(user.get("tier", "free")),
            "tomino_plus": _auth_is_tomino_plus(user),
        },
        "session": {
            "device_id": session.get("device_id"),
            "device_label": session.get("device_label_effective") or session.get("device_label"),
            "sync_paused": bool(int(session.get("device_sync_paused") or 0)),
            "expires_at": session.get("expires_at"),
        },
    })


@app.route("/api/auth/provider/link", methods=["POST"])
def api_auth_provider_link():
    user, session, error = _auth_required_user()
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    provider = str(payload.get("provider") or "").strip().lower()
    provider_user_id = str(payload.get("provider_user_id") or "").strip()

    if provider not in ("supabase", "oidc"):
        _auth_audit("provider_link", False, user_id=int(user.get("id") or 0), email=user.get("email"), device_id=session.get("device_id"), reason="invalid_provider")
        return jsonify({"ok": False, "erreur": "Provider invalide (supabase|oidc)."}), 400
    if not provider_user_id:
        _auth_audit("provider_link", False, user_id=int(user.get("id") or 0), email=user.get("email"), device_id=session.get("device_id"), reason="missing_provider_user_id")
        return jsonify({"ok": False, "erreur": "provider_user_id requis."}), 400

    existing = db.get_user_by_provider_identity(provider, provider_user_id)
    if existing and int(existing.get("id") or 0) != int(user.get("id") or 0):
        _auth_audit("provider_link", False, user_id=int(user.get("id") or 0), email=user.get("email"), device_id=session.get("device_id"), reason="identity_already_linked")
        return jsonify({"ok": False, "erreur": "Cette identité provider est déjà liée à un autre compte."}), 409

    try:
        linked = db.link_user_provider_identity(int(user.get("id") or 0), provider, provider_user_id)
        if not linked:
            _auth_audit("provider_link", False, user_id=int(user.get("id") or 0), email=user.get("email"), device_id=session.get("device_id"), reason="user_not_found")
            return jsonify({"ok": False, "erreur": "Utilisateur introuvable."}), 404

        _auth_audit("provider_link", True, user_id=int(linked.get("id") or 0), email=linked.get("email"), device_id=session.get("device_id"), reason=provider)
        return jsonify({
            "ok": True,
            "user": {
                "id": int(linked.get("id") or 0),
                "email": linked.get("email"),
                "auth_provider": linked.get("auth_provider", "local"),
                "provider_user_id": linked.get("provider_user_id"),
                "tier": linked.get("tier", "free"),
                "tier_label": _auth_tier_label(linked.get("tier", "free")),
                "tomino_plus": _auth_is_tomino_plus(linked),
            }
        })
    except ValueError as e:
        _auth_audit("provider_link", False, user_id=int(user.get("id") or 0), email=user.get("email"), device_id=session.get("device_id"), reason="validation_error")
        return jsonify({"ok": False, "erreur": str(e)}), 400


@app.route("/api/devices")
def api_devices():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    devices = db.list_user_devices(int(user.get("id") or 0))
    return jsonify({
        "ok": True,
        "current_device_id": session.get("device_id"),
        "devices": [
            {
                "device_id": d.get("device_id"),
                "device_label": d.get("device_label"),
                "sync_paused": bool(int(d.get("sync_paused") or 0)),
                "last_sync_cursor": int(d.get("last_sync_cursor") or 0),
                "last_seen_at": d.get("last_seen_at"),
                "revoked_at": d.get("revoked_at"),
                "created_at": d.get("created_at"),
            }
            for d in devices
        ],
    })


@app.route("/api/devices/revoke", methods=["POST"])
def api_devices_revoke():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    payload = request.get_json(silent=True) or {}
    device_id = str(payload.get("device_id") or "").strip()
    if not device_id:
        return jsonify({"ok": False, "erreur": "Champ 'device_id' requis."}), 400
    if device_id == str(session.get("device_id") or ""):
        return jsonify({"ok": False, "erreur": "Impossible de révoquer l'appareil courant depuis cette session."}), 400

    changed = db.revoke_user_device(int(user.get("id") or 0), device_id)
    if not changed:
        return jsonify({"ok": False, "erreur": "Appareil introuvable ou déjà révoqué."}), 404
    return jsonify({"ok": True, "revoked": True, "device_id": device_id})


@app.route("/api/devices/rename", methods=["POST"])
def api_devices_rename():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    payload = request.get_json(silent=True) or {}
    device_id = str(payload.get("device_id") or "").strip()
    device_label = str(payload.get("device_label") or "").strip()
    
    if not device_id:
        return jsonify({"ok": False, "erreur": "Champ 'device_id' requis."}), 400
    if not device_label:
        return jsonify({"ok": False, "erreur": "Champ 'device_label' requis."}), 400

    try:
        updated = db.upsert_user_device(int(user.get("id") or 0), device_id, device_label)
        return jsonify({"ok": True, "device": updated})
    except Exception as e:
        return jsonify({"ok": False, "erreur": str(e)}), 500


@app.route("/api/sync/pause", methods=["POST"])
def api_sync_pause():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    payload = request.get_json(silent=True) or {}
    target_device_id = str(payload.get("device_id") or session.get("device_id") or "").strip()
    if not target_device_id:
        return jsonify({"ok": False, "erreur": "Aucun appareil associé à cette session."}), 400

    changed, device = db.set_device_sync_paused(int(user.get("id") or 0), target_device_id, True)
    if not changed:
        return jsonify({"ok": False, "erreur": "Appareil introuvable ou révoqué."}), 404
    return jsonify({
        "ok": True,
        "device_id": target_device_id,
        "sync_paused": bool(int((device or {}).get("sync_paused") or 0)),
    })


@app.route("/api/sync/resume", methods=["POST"])
def api_sync_resume():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    payload = request.get_json(silent=True) or {}
    target_device_id = str(payload.get("device_id") or session.get("device_id") or "").strip()
    if not target_device_id:
        return jsonify({"ok": False, "erreur": "Aucun appareil associé à cette session."}), 400

    changed, device = db.set_device_sync_paused(int(user.get("id") or 0), target_device_id, False)
    if not changed:
        return jsonify({"ok": False, "erreur": "Appareil introuvable ou révoqué."}), 404
    return jsonify({
        "ok": True,
        "device_id": target_device_id,
        "sync_paused": bool(int((device or {}).get("sync_paused") or 0)),
        "last_sync_cursor": int((device or {}).get("last_sync_cursor") or 0),
    })


@app.route("/api/sync/events")
def api_sync_events():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    if int(session.get("device_sync_paused") or 0) == 1:
        return _auth_sync_paused_error()

    since_raw = request.args.get("since", "0")
    limit_raw = request.args.get("limit", "200")
    include_skipped_raw = str(request.args.get("include_skipped", "0")).strip().lower()

    try:
        since_id = max(0, int(since_raw))
    except Exception:
        return jsonify({"ok": False, "erreur": "Parametre 'since' invalide."}), 400

    try:
        limit = min(max(int(limit_raw), 1), 1000)
    except Exception:
        return jsonify({"ok": False, "erreur": "Parametre 'limit' invalide."}), 400

    include_skipped = include_skipped_raw in ("1", "true", "yes")
    events = db.get_sync_events(
        since_id=since_id,
        limit=limit,
        include_skipped=include_skipped,
        user_id=int(user.get("id") or 0),
    )
    next_since = since_id
    if events:
        next_since = int(events[-1].get("id") or since_id)

    session_device_id = str(session.get("device_id") or "").strip()
    if session_device_id:
        db.update_device_sync_cursor(int(user.get("id") or 0), session_device_id, next_since)

    return jsonify({
        "ok": True,
        "user_id": int(user.get("id") or 0),
        "device_id": session.get("device_id"),
        "since": since_id,
        "next_since": next_since,
        "count": len(events),
        "events": events,
    })


@app.route("/api/sync/events/apply", methods=["POST"])
def api_sync_events_apply():
    user, session, error = _auth_required_user()
    if error:
        return error
    plus_error = _auth_require_tomino_plus(user)
    if plus_error:
        return plus_error

    if int(session.get("device_sync_paused") or 0) == 1:
        return _auth_sync_paused_error()

    payload = request.get_json(silent=True) or {}
    events = payload.get("events")
    source = str(payload.get("source") or "remote").strip() or "remote"

    if not isinstance(events, list):
        return jsonify({"ok": False, "erreur": "Champ 'events' requis (liste)."}), 400

    try:
        result = db.apply_sync_events(
            events,
            source=source,
            user_id=int(user.get("id") or 0),
            device_id=session.get("device_id"),
        )
        if int(result.get("applied") or 0) > 0:
            _invalidate_resume_cache()
        session_device_id = str(session.get("device_id") or "").strip()
        if session_device_id:
            db.update_device_sync_cursor(int(user.get("id") or 0), session_device_id, int(result.get("cursor") or 0))
        return jsonify({"ok": True, "user_id": int(user.get("id") or 0), "device_id": session.get("device_id"), **result})
    except ValueError as e:
        return jsonify({"ok": False, "erreur": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "erreur": f"Sync apply impossible: {e}"}), 500


@app.route("/api/plans")
def api_plans():
    provider = _billing_provider()
    return jsonify({
        "ok": True,
        "provider": provider,
        "stripe_ready": _billing_is_stripe_ready(),
        "plans": [
            {
                "tier": "free",
                "label": "Gratuit — sans compte",
                "tomino_plus": False,
                "price_eur_month": 0,
                "alerts_max": _alerts_limit_for_tier("free"),
                "features": [
                    "Tracking complet (PEA, CTO, Or, Livrets, Assurance vie)",
                    "Cours temps réel et dashboard historique",
                    "3 alertes prix maximum",
                    "IA limitée (2 analyses/semaine, chat basique)",
                    "Export backup local",
                    "Application desktop uniquement",
                ],
            },
            {
                "tier": "tomino_plus",
                "label": "Tomino + — 4,99 EUR/mois",
                "tomino_plus": True,
                "price_eur_month": 4.99,
                "alerts_max": None,
                "price_configured": bool(_billing_price_id_for_tier("tomino_plus")) if provider == "stripe" else True,
                "features": [
                    "Synchronisation cloud multi-appareils",
                    "Alertes illimitées",
                    "IA avancée",
                    "Rapports mensuels automatiques",
                    "Export PDF premium",
                    "Simulateur 'et si ?' (quand disponible)",
                    "Nouvelles enveloppes en avant-première",
                ],
            },
        ],
    })


@app.route("/api/billing/subscription")
def api_billing_subscription():
    user, _session, error = _auth_required_user()
    if error:
        return error

    return jsonify({
        "ok": True,
        "provider": _billing_provider(),
        "stripe_ready": _billing_is_stripe_ready(),
        "subscription": _billing_build_subscription_payload(user),
    })


@app.route("/api/billing/change-plan", methods=["POST"])
def api_billing_change_plan():
    user, _session, error = _auth_required_user()
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    requested_tier = _auth_normalize_tier(payload.get("tier"))
    current_tier = _auth_normalize_tier(user.get("tier"))
    provider = _billing_provider()

    if requested_tier == current_tier:
        return jsonify({
            "ok": True,
            "changed": False,
            "provider": provider,
            "subscription": _billing_build_subscription_payload(user, override_tier=current_tier),
        })

    if provider == "stripe" and requested_tier == "tomino_plus":
        return jsonify({
            "ok": False,
            "payment_required": True,
            "provider": provider,
            "tier": requested_tier,
            "erreur": "Le passage à Tomino + nécessite un paiement Stripe.",
            "action": "Lancez une session de paiement via /api/billing/checkout-session.",
        }), 402

    updated = db.update_user_tier(int(user.get("id") or 0), requested_tier)
    if not updated:
        return jsonify({"ok": False, "erreur": "Utilisateur introuvable."}), 404

    db.upsert_user_subscription(
        int(user.get("id") or 0),
        provider=provider,
        tier=requested_tier,
        status="active" if requested_tier == "tomino_plus" else "free",
        metadata={"source": "manual_change_plan"},
    )

    return jsonify({
        "ok": True,
        "changed": True,
        "provider": provider,
        "subscription": _billing_build_subscription_payload(updated, override_tier=requested_tier),
        "note": "Mode local: changement immédiat du forfait." if provider == "local" else "Downgrade appliqué immédiatement.",
    })


@app.route("/api/billing/checkout-session", methods=["POST"])
def api_billing_checkout_session():
    user, _session, error = _auth_required_user()
    if error:
        return error

    if _billing_provider() != "stripe":
        return jsonify({"ok": False, "erreur": "Stripe non activé sur cette instance."}), 400
    if not _billing_is_stripe_ready():
        return jsonify({"ok": False, "erreur": "Configuration Stripe incomplète côté serveur."}), 500

    payload = request.get_json(silent=True) or {}
    requested_tier = _auth_normalize_tier(payload.get("tier"))
    if requested_tier != "tomino_plus":
        return jsonify({"ok": False, "erreur": "Tier invalide pour le checkout Stripe."}), 400

    price_id = _billing_price_id_for_tier(requested_tier)
    if not price_id:
        return jsonify({"ok": False, "erreur": "Prix Stripe manquant pour ce forfait."}), 500

    success_url = str(payload.get("success_url") or STRIPE_CHECKOUT_SUCCESS_URL).strip() or STRIPE_CHECKOUT_SUCCESS_URL
    cancel_url = str(payload.get("cancel_url") or STRIPE_CHECKOUT_CANCEL_URL).strip() or STRIPE_CHECKOUT_CANCEL_URL

    try:
        stripe = _stripe_client()
        checkout = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=str(user.get("email") or "").strip() or None,
            client_reference_id=str(int(user.get("id") or 0)),
            metadata={
                "user_id": str(int(user.get("id") or 0)),
                "tier": requested_tier,
            },
            subscription_data={
                "metadata": {
                    "user_id": str(int(user.get("id") or 0)),
                    "tier": requested_tier,
                }
            },
        )
        return jsonify({
            "ok": True,
            "provider": "stripe",
            "checkout_session_id": str(checkout.get("id") or ""),
            "url": str(checkout.get("url") or ""),
        })
    except Exception as e:
        return jsonify({"ok": False, "erreur": f"Checkout Stripe impossible: {e}"}), 500


@app.route("/api/billing/portal-session", methods=["POST"])
def api_billing_portal_session():
    user, _session, error = _auth_required_user()
    if error:
        return error

    if _billing_provider() != "stripe":
        return jsonify({"ok": False, "erreur": "Portail abonnement disponible uniquement en mode Stripe."}), 400
    if not STRIPE_SECRET_KEY:
        return jsonify({"ok": False, "erreur": "Configuration Stripe incomplète côté serveur."}), 500

    subscription = db.get_user_subscription(int(user.get("id") or 0)) or {}
    customer_id = str(subscription.get("provider_customer_id") or "").strip()
    if not customer_id:
        return jsonify({
            "ok": False,
            "erreur": "Aucun client Stripe associé à ce compte.",
            "action": "Activez Tomino + une première fois via le checkout Stripe.",
        }), 400

    payload = request.get_json(silent=True) or {}
    return_url = str(payload.get("return_url") or STRIPE_PORTAL_RETURN_URL).strip() or STRIPE_PORTAL_RETURN_URL

    try:
        stripe = _stripe_client()
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return jsonify({
            "ok": True,
            "provider": "stripe",
            "url": str(portal.get("url") or ""),
        })
    except Exception as e:
        return jsonify({"ok": False, "erreur": f"Portail Stripe indisponible: {e}"}), 500


@app.route("/api/billing/webhook", methods=["POST"])
def api_billing_webhook():
    if _billing_provider() != "stripe":
        return jsonify({"ok": False, "erreur": "Stripe non activé sur cette instance."}), 400
    if not STRIPE_WEBHOOK_SECRET:
        return jsonify({"ok": False, "erreur": "Webhook Stripe non configuré."}), 500

    payload = request.get_data(cache=False, as_text=False)
    signature = request.headers.get("Stripe-Signature", "")

    try:
        stripe = _stripe_client()
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        app.logger.warning("WEBHOOK signature invalide: %s", e)
        return jsonify({"ok": False, "erreur": f"Signature webhook invalide: {e}"}), 400

    event_type = str(event.get("type") or "")
    data_object = (event.get("data") or {}).get("object") or {}
    app.logger.info("WEBHOOK STRIPE reçu — type: %s", event_type)

    def _get_user_subscription_by_customer(customer_id: str):
        safe_customer = str(customer_id or "").strip()
        if not safe_customer:
            return None
        if hasattr(db, "get_user_subscription_by_provider_customer"):
            return db.get_user_subscription_by_provider_customer("stripe", safe_customer)

        conn = db.get_db()
        row = conn.execute(
            """
            SELECT *
            FROM user_subscriptions
            WHERE provider=? AND provider_customer_id=?
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            ("stripe", safe_customer),
        ).fetchone()
        conn.close()
        return dict(row) if row else None

    try:
        if event_type == "checkout.session.completed":
            metadata = data_object.get("metadata") or {}
            user_id = int(metadata.get("user_id") or data_object.get("client_reference_id") or 0)
            tier = _auth_normalize_tier(metadata.get("tier"))
            if user_id > 0 and tier == "tomino_plus":
                user = db.update_user_tier(user_id, tier)
                if user:
                    current_period_end = None
                    subscription_id = str(data_object.get("subscription") or "").strip() or None
                    if subscription_id:
                        try:
                            stripe_sub = stripe.Subscription.retrieve(subscription_id)
                            if stripe_sub and stripe_sub.get("current_period_end"):
                                current_period_end = datetime.datetime.fromtimestamp(
                                    int(stripe_sub.get("current_period_end")), tz=datetime.UTC
                                ).isoformat().replace("+00:00", "Z")
                        except Exception:
                            pass
                    db.upsert_user_subscription(
                        user_id,
                        provider="stripe",
                        tier=tier,
                        status="active",
                        provider_customer_id=str(data_object.get("customer") or "").strip() or None,
                        provider_subscription_id=subscription_id,
                        current_period_end=current_period_end,
                        metadata={"event_type": event_type},
                    )
                    if user and user.get("email"):
                        emails.send_welcome(
                            user["email"],
                            _auth_tier_label(tier)
                        )
                    app.logger.info("WEBHOOK tier mis à jour — user_id: %s tier: %s", user_id, tier)

        elif event_type == "invoice.payment_succeeded":
            # Email de confirmation de débit mensuel
            customer_id = str(data_object.get("customer") or "").strip()
            amount_paid = data_object.get("amount_paid") or 0
            period_end_ts = (data_object.get("lines", {})
                             .get("data", [{}])[0]
                             .get("period", {})
                             .get("end"))
            amount_eur = f"{amount_paid / 100:.2f} €"
            period_end_str = ""
            if period_end_ts:
                period_end_str = datetime.datetime.fromtimestamp(
                    int(period_end_ts), tz=datetime.UTC
                ).strftime("%d/%m/%Y")

            # Récupérer l'email de l'utilisateur via customer_id
            if customer_id:
                user_sub = _get_user_subscription_by_customer(customer_id)
                if user_sub:
                    user_data = db.get_user_by_id(int(user_sub.get("user_id") or 0))
                    if user_data and user_data.get("email"):
                        emails.send_payment_confirmed(
                            user_data["email"], amount_eur, period_end_str
                        )
            app.logger.info(
                "WEBHOOK invoice.payment_succeeded — customer: %s amount: %s",
                customer_id, amount_eur
            )

        elif event_type == "invoice.payment_failed":
            customer_id = str(data_object.get("customer") or "").strip()
            next_attempt_ts = data_object.get("next_payment_attempt")
            next_attempt_str = None
            if next_attempt_ts:
                next_attempt_str = datetime.datetime.fromtimestamp(
                    int(next_attempt_ts), tz=datetime.UTC
                ).strftime("%d/%m/%Y")

            if customer_id:
                user_sub = _get_user_subscription_by_customer(customer_id)
                if user_sub:
                    user_data = db.get_user_by_id(int(user_sub.get("user_id") or 0))
                    if user_data and user_data.get("email"):
                        emails.send_payment_failed(
                            user_data["email"], next_attempt_str
                        )
            app.logger.warning(
                "WEBHOOK invoice.payment_failed — customer: %s", customer_id
            )

        elif event_type == "customer.subscription.deleted":
            # Déjà géré pour le downgrade — ajouter l'email de confirmation
            subscription_id = str(data_object.get("id") or "").strip()
            current_period_end_ts = data_object.get("current_period_end")
            period_end_str = ""
            if current_period_end_ts:
                period_end_str = datetime.datetime.fromtimestamp(
                    int(current_period_end_ts), tz=datetime.UTC
                ).strftime("%d/%m/%Y")

            user_sub = db.get_user_subscription_by_provider_subscription(
                "stripe", subscription_id
            )
            if user_sub:
                user_data = db.get_user_by_id(int(user_sub.get("user_id") or 0))
                if user_data and user_data.get("email"):
                    emails.send_cancellation_confirmed(
                        user_data["email"], period_end_str
                    )

            metadata = data_object.get("metadata") or {}
            status = str(data_object.get("status") or "").strip().lower() or "unknown"
            tier_from_event = _auth_normalize_tier(metadata.get("tier"))
            user_id = int((user_sub or {}).get("user_id") or metadata.get("user_id") or 0)
            if user_id > 0:
                current_period_end = None
                if data_object.get("current_period_end"):
                    current_period_end = datetime.datetime.fromtimestamp(
                        int(data_object.get("current_period_end")), tz=datetime.UTC
                    ).isoformat().replace("+00:00", "Z")

                effective_tier = tier_from_event
                if effective_tier == "free" and user_sub:
                    effective_tier = _auth_normalize_tier(user_sub.get("tier"))
                if status not in ("active", "trialing"):
                    effective_tier = "free"

                user = db.update_user_tier(user_id, effective_tier)
                if user:
                    db.upsert_user_subscription(
                        user_id,
                        provider="stripe",
                        tier=effective_tier,
                        status=status,
                        provider_customer_id=str(data_object.get("customer") or "").strip() or None,
                        provider_subscription_id=subscription_id or None,
                        current_period_end=current_period_end,
                        metadata={"event_type": event_type},
                    )

        elif event_type == "customer.subscription.updated":
            metadata = data_object.get("metadata") or {}
            subscription_id = str(data_object.get("id") or "").strip()
            status = str(data_object.get("status") or "").strip().lower() or "unknown"
            tier_from_event = _auth_normalize_tier(metadata.get("tier"))
            user_sub = db.get_user_subscription_by_provider_subscription("stripe", subscription_id)
            user_id = int((user_sub or {}).get("user_id") or metadata.get("user_id") or 0)
            if user_id > 0:
                current_period_end = None
                if data_object.get("current_period_end"):
                    current_period_end = datetime.datetime.fromtimestamp(
                        int(data_object.get("current_period_end")), tz=datetime.UTC
                    ).isoformat().replace("+00:00", "Z")

                effective_tier = tier_from_event
                if effective_tier == "free" and user_sub:
                    effective_tier = _auth_normalize_tier(user_sub.get("tier"))
                if status not in ("active", "trialing"):
                    effective_tier = "free"

                user = db.update_user_tier(user_id, effective_tier)
                if user:
                    db.upsert_user_subscription(
                        user_id,
                        provider="stripe",
                        tier=effective_tier,
                        status=status,
                        provider_customer_id=str(data_object.get("customer") or "").strip() or None,
                        provider_subscription_id=subscription_id or None,
                        current_period_end=current_period_end,
                        metadata={"event_type": event_type},
                    )
    except Exception as e:
        return jsonify({"ok": False, "erreur": f"Webhook Stripe non appliqué: {e}"}), 500

    return jsonify({"ok": True, "event_type": event_type})


@app.route("/api/actifs")
def api_actifs():
    env = _clean_env(request.args.get("env", "PEA"))
    liste = _enrichir_avec_tri(db.get_actifs(env))
    index_nom = {int(a.get("id")): a.get("nom", "") for a in liste if a.get("id") is not None}
    mouvements = []
    for m in db.get_mouvements(enveloppe=env, limit=500):
        aid = int(m.get("actif_id")) if m.get("actif_id") is not None else None
        if aid not in index_nom:
            # Ignore les mouvements orphelins (actif supprimé) dans la vue portefeuille.
            continue
        m["actif_nom"] = index_nom.get(aid, "")
        mouvements.append(m)

    stats = prices.calcul_stats_enveloppe(liste)
    stats["tri"] = calculs.tri_enveloppe(liste)

    coeur = [a for a in liste if a.get("categorie") == "coeur"]
    satellite = [a for a in liste if a.get("categorie") == "satellite"]

    return jsonify({
        "ok": True,
        "env": env,
        "actifs": liste,
        "mouvements": mouvements,
        "stats": stats,
        "stats_coeur": prices.calcul_stats_enveloppe(coeur),
        "stats_satellite": prices.calcul_stats_enveloppe(satellite),
    })


@app.route("/api/actifs/all")
def api_actifs_all():
    actifs = _enrichir_avec_tri(db.get_actifs())
    return jsonify({"ok": True, "actifs": actifs})


@app.route("/api/actifs", methods=["POST"])
def api_actifs_create():
    payload = request.get_json(silent=True) or {}
    enveloppe = _clean_env(payload.get("enveloppe", "PEA"))
    data = _actif_payload(payload)
    date_operation = data.get("date_achat") or datetime.date.today().isoformat()
    qty = _to_float(data.get("quantite"), 0)
    pru = _to_float(data.get("pru"), 0)
    montant_brut = round(qty * pru, 4)

    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400

    ticker = data.get("ticker", "")
    existant = db.get_actif_by_ticker(ticker, enveloppe) if ticker else None

    if existant:
        total_qty = _to_float(existant.get("quantite"), 0) + data["quantite"]
        if total_qty <= 0:
            return jsonify({"ok": False, "erreur": "Quantite totale invalide apres fusion."}), 400
        new_pru = (_to_float(existant.get("pru"), 0) * _to_float(existant.get("quantite"), 0) + data["pru"] * data["quantite"]) / total_qty
        db.update_actif(existant["id"], {
            "nom": existant.get("nom", data["nom"]),
            "ticker": ticker,
            "quantite": round(total_qty, 6),
            "pru": round(new_pru, 4),
            "type": existant.get("type", data["type"]),
            "categorie": existant.get("categorie", data["categorie"]),
            "date_achat": existant.get("date_achat", data["date_achat"]),
            "notes": existant.get("notes", data["notes"]),
        })

        if qty > 0 and pru > 0:
            db.add_mouvement({
                "actif_id": existant["id"],
                "enveloppe": enveloppe,
                "type_operation": "achat",
                "date_operation": date_operation,
                "quantite": round(qty, 6),
                "prix_unitaire": round(pru, 6),
                "frais": 0.0,
                "montant_brut": montant_brut,
                "montant_net": montant_brut,
                "pv_realisee": None,
            })

        _invalidate_resume_cache()
        return jsonify({"ok": True, "id": existant["id"], "fusion": True})

    db.add_actif({"enveloppe": enveloppe, **data})
    new_id = _last_inserted_id("actifs")

    if new_id and qty > 0 and pru > 0:
        db.add_mouvement({
            "actif_id": new_id,
            "enveloppe": enveloppe,
            "type_operation": "achat",
            "date_operation": date_operation,
            "quantite": round(qty, 6),
            "prix_unitaire": round(pru, 6),
            "frais": 0.0,
            "montant_brut": montant_brut,
            "montant_net": montant_brut,
            "pv_realisee": None,
        })

    _invalidate_resume_cache()
    return jsonify({"ok": True, "id": new_id})


@app.route("/api/actifs/snapshot", methods=["POST"])
def api_actifs_snapshot():
    """Importe une position existante sans recalcul du PRU (onboarding)."""
    payload = request.get_json(silent=True) or {}
    enveloppe = _clean_env(payload.get("enveloppe", "PEA"))
    data = _actif_payload(payload)
    date_debut = str(payload.get("date_debut", "") or datetime.date.today().isoformat()).strip()
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_debut):
        date_debut = datetime.date.today().isoformat()

    qty = _to_float(data.get("quantite"), 0)
    pru = _to_float(data.get("pru"), 0)

    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400
    if qty <= 0:
        return jsonify({"ok": False, "erreur": "La quantite doit etre positive."}), 400
    if pru <= 0:
        return jsonify({"ok": False, "erreur": "Le PRU doit etre positif."}), 400

    ticker = data.get("ticker", "")
    existant = db.get_actif_by_ticker(ticker, enveloppe) if ticker else None
    montant = round(qty * pru, 4)

    if existant:
        db.update_actif(existant["id"], {
            "nom": existant.get("nom", data["nom"]),
            "ticker": ticker,
            "quantite": round(qty, 6),
            "pru": round(pru, 4),
            "type": existant.get("type", data["type"]),
            "categorie": existant.get("categorie", data["categorie"]),
            "date_achat": existant.get("date_achat") or date_debut,
            "notes": existant.get("notes", data["notes"]),
        })
        actif_id = existant["id"]
    else:
        db.add_actif({"enveloppe": enveloppe, **data, "date_achat": date_debut})
        actif_id = _last_inserted_id("actifs")

    if actif_id:
        db.add_mouvement({
            "actif_id": actif_id,
            "enveloppe": enveloppe,
            "type_operation": "snapshot",
            "date_operation": date_debut,
            "quantite": round(qty, 6),
            "prix_unitaire": round(pru, 6),
            "frais": 0.0,
            "montant_brut": montant,
            "montant_net": montant,
            "pv_realisee": None,
        })

    _invalidate_resume_cache()
    return jsonify({"ok": True, "id": actif_id})


@app.route("/api/actifs/<int:actif_id>", methods=["PUT"])
def api_actifs_update(actif_id):
    current = db.get_actif(actif_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Actif introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    data = _actif_payload(payload, current)
    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400

    db.update_actif(actif_id, data)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/actifs/<int:actif_id>", methods=["DELETE"])
def api_actifs_delete(actif_id):
    current = db.get_actif(actif_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Actif introuvable."}), 404
    db.delete_actif(actif_id)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/actifs/<int:actif_id>/operation", methods=["POST"])
def api_actifs_operation(actif_id):
    actif = db.get_actif(actif_id)
    if not actif:
        return jsonify({"ok": False, "erreur": "Actif introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    op = _operation_payload(payload)

    if op["type_operation"] not in ("achat", "vente"):
        return jsonify({"ok": False, "erreur": "type_operation invalide. Valeurs: achat, vente."}), 400
    if op["quantite"] <= 0:
        return jsonify({"ok": False, "erreur": "La quantite doit etre strictement positive."}), 400
    if op["prix_unitaire"] <= 0:
        return jsonify({"ok": False, "erreur": "Le prix unitaire doit etre strictement positif."}), 400
    if op["frais"] < 0:
        return jsonify({"ok": False, "erreur": "Les frais ne peuvent pas etre negatifs."}), 400

    date_operation = op["date_operation"] or datetime.date.today().isoformat()
    qty_actuelle = _to_float(actif.get("quantite"), 0)
    pru_actuel = _to_float(actif.get("pru"), 0)
    quantite = op["quantite"]
    prix = op["prix_unitaire"]
    frais = op["frais"]
    montant_brut = round(quantite * prix, 4)
    mouvement = None

    if op["type_operation"] == "achat":
        total_qty = qty_actuelle + quantite
        if total_qty <= 0:
            return jsonify({"ok": False, "erreur": "Quantite totale invalide apres achat."}), 400

        cout_total_ancien = qty_actuelle * pru_actuel
        cout_total_nouveau = montant_brut + frais
        new_pru = (cout_total_ancien + cout_total_nouveau) / total_qty

        db.update_actif(actif_id, {
            "nom": actif.get("nom", ""),
            "ticker": actif.get("ticker", ""),
            "quantite": round(total_qty, 6),
            "pru": round(new_pru, 4),
            "type": actif.get("type", "action"),
            "categorie": actif.get("categorie", "coeur"),
            "date_achat": actif.get("date_achat", ""),
            "notes": actif.get("notes", ""),
        })

        mouvement = {
            "actif_id": actif_id,
            "enveloppe": actif.get("enveloppe", ""),
            "type_operation": "achat",
            "date_operation": date_operation,
            "quantite": round(quantite, 6),
            "prix_unitaire": round(prix, 6),
            "frais": round(frais, 4),
            "montant_brut": round(montant_brut, 4),
            "montant_net": round(montant_brut + frais, 4),
            "pv_realisee": None,
        }
        db.add_mouvement(mouvement)

    else:
        if quantite > qty_actuelle + 1e-9:
            return jsonify({"ok": False, "erreur": "Quantite de vente superieure a la position detenue."}), 400

        new_qty = qty_actuelle - quantite
        if abs(new_qty) < 1e-9:
            new_qty = 0.0
        cout_revient = quantite * pru_actuel
        montant_net_vente = montant_brut - frais
        pv_realisee = montant_net_vente - cout_revient
        new_pru = pru_actuel if new_qty > 0 else 0.0

        db.update_actif(actif_id, {
            "nom": actif.get("nom", ""),
            "ticker": actif.get("ticker", ""),
            "quantite": round(new_qty, 6),
            "pru": round(new_pru, 4),
            "type": actif.get("type", "action"),
            "categorie": actif.get("categorie", "coeur"),
            "date_achat": actif.get("date_achat", ""),
            "notes": actif.get("notes", ""),
        })

        mouvement = {
            "actif_id": actif_id,
            "enveloppe": actif.get("enveloppe", ""),
            "type_operation": "vente",
            "date_operation": date_operation,
            "quantite": round(quantite, 6),
            "prix_unitaire": round(prix, 6),
            "frais": round(frais, 4),
            "montant_brut": round(montant_brut, 4),
            "montant_net": round(montant_net_vente, 4),
            "pv_realisee": round(pv_realisee, 4),
        }
        db.add_mouvement(mouvement)

    updated = db.get_actif(actif_id)
    _invalidate_resume_cache()
    return jsonify({"ok": True, "actif": updated, "mouvement": mouvement})


@app.route("/api/actifs/<int:actif_id>/operations")
def api_actifs_operations(actif_id):
    actif = db.get_actif(actif_id)
    if not actif:
        return jsonify({"ok": False, "erreur": "Actif introuvable."}), 404
    return jsonify({"ok": True, "operations": db.get_mouvements(actif_id=actif_id, limit=200)})


@app.route("/api/mouvements/<int:mouvement_id>", methods=["PUT"])
def api_mouvement_update(mouvement_id):
    mouvement = db.get_mouvement(mouvement_id)
    if not mouvement:
        return jsonify({"ok": False, "erreur": "Mouvement introuvable."}), 404

    actif = db.get_actif(int(mouvement.get("actif_id"))) if mouvement.get("actif_id") is not None else None
    if not actif:
        return jsonify({"ok": False, "erreur": "Actif introuvable pour ce mouvement."}), 404

    payload = request.get_json(silent=True) or {}
    data = _mouvement_edit_payload(payload, mouvement)

    if data["quantite"] <= 0:
        return jsonify({"ok": False, "erreur": "La quantite doit etre strictement positive."}), 400
    if data["prix_unitaire"] <= 0:
        return jsonify({"ok": False, "erreur": "Le prix unitaire doit etre strictement positif."}), 400
    if data["frais"] < 0:
        return jsonify({"ok": False, "erreur": "Les frais ne peuvent pas etre negatifs."}), 400

    op_type = str(mouvement.get("type_operation") or "").strip().lower()
    if op_type not in ("achat", "vente"):
        return jsonify({"ok": False, "erreur": "Type de mouvement non supporte."}), 400

    old_qty = _to_float(mouvement.get("quantite"), 0)
    old_brut = _to_float(mouvement.get("montant_brut"), 0)
    old_frais = _to_float(mouvement.get("frais"), 0)
    new_brut = round(data["quantite"] * data["prix_unitaire"], 4)
    qty_actuelle = _to_float(actif.get("quantite"), 0)

    if op_type == "achat":
        old_cost = old_brut + old_frais
        new_cost = new_brut + data["frais"]

        total_cost_actuel = qty_actuelle * _to_float(actif.get("pru"), 0)
        new_qty_total = qty_actuelle - old_qty + data["quantite"]
        new_cost_total = total_cost_actuel - old_cost + new_cost

        if new_qty_total <= 0 or new_cost_total < 0:
            return jsonify({"ok": False, "erreur": "Modification impossible: incoherence avec la position actuelle (possibles cessions deja enregistrees)."}), 400

        new_pru = new_cost_total / new_qty_total
        new_montant_net = round(new_cost, 4)
        new_pv_realisee = None
    else:
        # On "retire" l'ancienne vente puis on applique la nouvelle vente.
        qty_before_sale = qty_actuelle + old_qty
        new_qty_total = qty_before_sale - data["quantite"]

        if new_qty_total < -1e-9:
            return jsonify({"ok": False, "erreur": "Modification impossible: quantite vendue superieure a la position detenue."}), 400

        if abs(new_qty_total) < 1e-9:
            new_qty_total = 0.0

        pru_actuel = _to_float(actif.get("pru"), 0)
        new_pru = pru_actuel if new_qty_total > 0 else 0.0
        new_montant_net = round(new_brut - data["frais"], 4)
        new_pv_realisee = round(new_montant_net - (data["quantite"] * pru_actuel), 4)

    db.update_actif(actif["id"], {
        "nom": actif.get("nom", ""),
        "ticker": actif.get("ticker", ""),
        "quantite": round(new_qty_total, 6),
        "pru": round(new_pru, 4),
        "type": actif.get("type", "action"),
        "categorie": actif.get("categorie", "coeur"),
        "date_achat": actif.get("date_achat", ""),
        "notes": actif.get("notes", ""),
    })

    db.update_mouvement(mouvement_id, {
        "date_operation": data["date_operation"] or mouvement.get("date_operation", ""),
        "quantite": round(data["quantite"], 6),
        "prix_unitaire": round(data["prix_unitaire"], 6),
        "frais": round(data["frais"], 4),
        "montant_brut": round(new_brut, 4),
        "montant_net": new_montant_net,
        "pv_realisee": new_pv_realisee,
    })

    _invalidate_resume_cache()
    return jsonify({"ok": True, "actif": db.get_actif(actif["id"]), "mouvement": db.get_mouvement(mouvement_id)})


@app.route("/api/mouvements/<int:mouvement_id>", methods=["DELETE"])
def api_mouvement_delete(mouvement_id):
    mouvement = db.get_mouvement(mouvement_id)
    if not mouvement:
        return jsonify({"ok": False, "erreur": "Mouvement introuvable."}), 404

    if mouvement.get("type_operation") not in ("achat", "snapshot"):
        return jsonify({"ok": False, "erreur": "Seuls les achats peuvent etre supprimes individuellement."}), 400

    actif = db.get_actif(int(mouvement.get("actif_id"))) if mouvement.get("actif_id") is not None else None
    if not actif:
        return jsonify({"ok": False, "erreur": "Actif introuvable pour ce mouvement."}), 404

    old_qty = _to_float(mouvement.get("quantite"), 0)
    old_cost = _to_float(mouvement.get("montant_brut"), 0) + _to_float(mouvement.get("frais"), 0)

    qty_actuelle = _to_float(actif.get("quantite"), 0)
    total_cost_actuel = qty_actuelle * _to_float(actif.get("pru"), 0)

    new_qty_total = qty_actuelle - old_qty
    new_cost_total = total_cost_actuel - old_cost

    if new_qty_total < 0 or new_cost_total < 0:
        return jsonify({"ok": False, "erreur": "Suppression impossible: ce renforcement a deja impacte des cessions."}), 400

    if new_qty_total <= 1e-9:
        new_qty_total = 0.0
        new_pru = 0.0
    else:
        new_pru = new_cost_total / new_qty_total

    db.update_actif(actif["id"], {
        "nom": actif.get("nom", ""),
        "ticker": actif.get("ticker", ""),
        "quantite": round(new_qty_total, 6),
        "pru": round(new_pru, 4),
        "type": actif.get("type", "action"),
        "categorie": actif.get("categorie", "coeur"),
        "date_achat": actif.get("date_achat", ""),
        "notes": actif.get("notes", ""),
    })
    db.delete_mouvement(mouvement_id)

    _invalidate_resume_cache()
    return jsonify({"ok": True, "actif": db.get_actif(actif["id"])})


@app.route("/api/livrets")
def api_livrets():
    liste = db.get_livrets()
    total = round(sum(_to_float(l.get("capital"), 0) for l in liste), 2)
    interets_annuels = round(sum(_to_float(l.get("capital"), 0) * _to_float(l.get("taux"), 0) / 100 for l in liste), 2)
    taux_moyen_pondere = round((interets_annuels / total * 100), 2) if total > 0 else 0

    return jsonify({
        "ok": True,
        "livrets": liste,
        "total": total,
        "stats": {
            "nb": len(liste),
            "interets_annuels": interets_annuels,
            "taux_moyen_pondere": taux_moyen_pondere,
        },
    })


@app.route("/api/livrets", methods=["POST"])
def api_livrets_create():
    payload = request.get_json(silent=True) or {}
    data = _livret_payload(payload)
    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400

    db.add_livret(data)
    livret_id = _last_inserted_id("livrets")
    _invalidate_resume_cache()
    return jsonify({"ok": True, "id": livret_id})


@app.route("/api/livrets/<int:livret_id>", methods=["PUT"])
def api_livrets_update(livret_id):
    current = db.get_livret(livret_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Livret introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    data = _livret_payload(payload, current)
    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400

    db.update_livret(livret_id, data)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/livrets/<int:livret_id>", methods=["DELETE"])
def api_livrets_delete(livret_id):
    current = db.get_livret(livret_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Livret introuvable."}), 404

    db.delete_livret(livret_id)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/assurance-vie")
def api_assurance_vie():
    contrats = db.get_assurance_vie()
    return jsonify({
        "ok": True,
        "contrats": contrats,
        "stats": db.get_assurance_vie_stats(),
    })


@app.route("/api/assurance-vie", methods=["POST"])
def api_assurance_vie_create():
    payload = request.get_json(silent=True) or {}
    data = _assurance_vie_payload(payload)
    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400
    if data["versements"] < 0:
        return jsonify({"ok": False, "erreur": "Les versements ne peuvent pas etre negatifs."}), 400
    if data["valeur_actuelle"] < 0:
        return jsonify({"ok": False, "erreur": "La valeur actuelle ne peut pas etre negative."}), 400

    db.add_assurance_vie(data)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/assurance-vie/<int:contrat_id>", methods=["PUT"])
def api_assurance_vie_update(contrat_id):
    current = db.get_assurance_vie_contrat(contrat_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Contrat introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    data = _assurance_vie_payload(payload, current)
    if not data["nom"]:
        return jsonify({"ok": False, "erreur": "Champ 'nom' obligatoire."}), 400
    if data["versements"] < 0:
        return jsonify({"ok": False, "erreur": "Les versements ne peuvent pas etre negatifs."}), 400
    if data["valeur_actuelle"] < 0:
        return jsonify({"ok": False, "erreur": "La valeur actuelle ne peut pas etre negative."}), 400

    db.update_assurance_vie(contrat_id, data)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/assurance-vie/<int:contrat_id>", methods=["DELETE"])
def api_assurance_vie_delete(contrat_id):
    current = db.get_assurance_vie_contrat(contrat_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Contrat introuvable."}), 404

    db.delete_assurance_vie(contrat_id)
    _invalidate_resume_cache()
    return jsonify({"ok": True})


@app.route("/api/data-dir")
def api_data_dir():
    import sys
    data_dir = db.get_data_dir()
    return jsonify({
        "ok": True,
        "data_dir": data_dir,
        "db_path": db.DB_PATH,
        "frozen": getattr(sys, "frozen", False),
    })


@app.route("/api/profil")
def api_profil_get():
    profil = db.get_profil()
    profil["profil_exists"] = db.profil_exists()
    profil["is_demo"] = db.get_is_demo()
    return jsonify(profil)


@app.route("/api/ia/quota")
def api_ia_quota():
    return jsonify({"ok": True, **_compute_ia_quota()})


@app.route("/api/profil", methods=["POST"])
def api_profil_save():
    payload = request.get_json(silent=True) or {}
    # Si on était en mode demo, purger les données fictives avant de sauvegarder le vrai profil
    try:
        current = db.get_profil()
        if int(current.get("is_demo") or 0) == 1:
            db.reset_all_data()
    except Exception:
        pass
    db.save_profil(payload)
    return jsonify({"ok": True})


@app.route("/api/dividendes")
def api_dividendes():
    return jsonify({
        "dividendes": db.get_dividendes(100),
        "stats": db.get_dividendes_stats(),
    })


@app.route("/api/comptes-etrangers")
def api_comptes_etrangers_get():
    comptes = db.get_comptes_etrangers()
    actifs = [c for c in comptes if not c.get("date_cloture")]
    crypto = [c for c in comptes if c.get("type_compte") == "crypto" or int(c.get("actif_numerique") or 0) == 1]
    return jsonify({
        "ok": True,
        "comptes": comptes,
        "stats": {
            "total": len(comptes),
            "actifs": len(actifs),
            "actifs_numeriques": len(crypto),
        },
    })


@app.route("/api/comptes-etrangers", methods=["POST"])
def api_comptes_etrangers_create():
    payload = request.get_json(silent=True) or {}
    data = _compte_etranger_payload(payload)
    ok, error, alerts = _validate_compte_etranger(data)
    if not ok:
        return jsonify({"ok": False, "erreur": error}), 400

    db.add_compte_etranger(data)
    compte_id = _last_inserted_id("comptes_etrangers")
    return jsonify({"ok": True, "id": compte_id, "alerts": alerts})


@app.route("/api/comptes-etrangers/<int:compte_id>", methods=["PUT"])
def api_comptes_etrangers_update(compte_id):
    current = db.get_compte_etranger(compte_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Compte introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    data = _compte_etranger_payload(payload, current)
    ok, error, alerts = _validate_compte_etranger(data, existing_id=compte_id)
    if not ok:
        return jsonify({"ok": False, "erreur": error}), 400

    db.update_compte_etranger(compte_id, data)
    return jsonify({"ok": True, "alerts": alerts})


@app.route("/api/comptes-etrangers/<int:compte_id>", methods=["DELETE"])
def api_comptes_etrangers_delete(compte_id):
    current = db.get_compte_etranger(compte_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Compte introuvable."}), 404
    db.delete_compte_etranger(compte_id)
    return jsonify({"ok": True})


@app.route("/api/comptes-etrangers/declaration")
def api_comptes_etrangers_declaration():
    annee_brute = str(request.args.get("annee", "")).strip()
    annee_defaut = datetime.date.today().year - 1

    try:
        annee = int(annee_brute) if annee_brute else annee_defaut
    except Exception:
        annee = annee_defaut

    if annee < 1990 or annee > 2100:
        return jsonify({"ok": False, "erreur": "Annee invalide."}), 400

    comptes = db.get_comptes_etrangers()
    declarables = []
    vigilances = []
    nb_dates_completes = 0
    nb_structures_completes = 0
    motifs_stats = {
        "ouvert_dans_annee": 0,
        "clos_dans_annee": 0,
        "actif_sur_annee": 0,
        "ouvert_et_clos_dans_annee": 0,
        "date_ouverture_manquante": 0,
    }

    for c in comptes:
        decision = _compte_est_declarable_annee(c, annee)
        if not decision.get("declarable"):
            if decision.get("vigilances"):
                vigilances.extend([
                    {
                        "section": "declaration_3916",
                        "niveau": "critique",
                        "code": "compte_non_retenu_incoherent",
                        "message": f"Compte #{c.get('id')}: {msg}",
                        "action": "Corrigez les dates d'ouverture/clôture du compte.",
                    }
                    for msg in decision.get("vigilances", [])
                ])
            continue

        motif = str(decision.get("motif") or "actif_sur_annee")
        if motif in motifs_stats:
            motifs_stats[motif] += 1

        has_dates = bool(_safe_iso_date(c.get("date_ouverture"))) and (
            not c.get("date_cloture") or bool(_safe_iso_date(c.get("date_cloture")))
        )
        has_structure = bool(c.get("etablissement") and c.get("pays") and (c.get("numero_compte") or c.get("wallet_adresse")))
        if has_dates:
            nb_dates_completes += 1
        if has_structure:
            nb_structures_completes += 1

        declarables.append({
            **c,
            "motif_declaration": motif,
            "motif_declaration_label": decision.get("motif_label"),
            "trace_regles": decision.get("trace") or [],
            "vigilances_compte": decision.get("vigilances") or [],
            "est_3916_bis": bool(c.get("type_compte") == "crypto" or int(c.get("actif_numerique") or 0) == 1),
        })
        for msg in decision.get("vigilances", []):
            vigilances.append({
                "section": "declaration_3916",
                "niveau": "attention",
                "code": "date_ouverture_manquante",
                "message": f"Compte #{c.get('id')} - {c.get('etablissement')}: {msg}",
                "action": "Complétez les dates manquantes pour sécuriser le périmètre annuel.",
            })

    total = len(declarables)
    ratio_dates = (nb_dates_completes / total) if total else 1.0
    ratio_structure = (nb_structures_completes / total) if total else 1.0
    ratio_global = (ratio_dates + ratio_structure) / 2
    confidence = "eleve" if ratio_global >= 0.85 else "moyen" if ratio_global >= 0.55 else "faible"

    if ratio_structure < 1.0:
        missing = total - nb_structures_completes
        vigilances.append({
            "section": "declaration_3916",
            "niveau": "attention",
            "code": "identifiant_compte_manquant",
            "message": f"{missing} compte(s) sans identifiant exploitable (numéro/wallet).",
            "action": "Ajoutez le numéro de compte, IBAN ou adresse wallet pour le report 3916.",
        })

    checklist = [
        {
            "label": "Vérifier chaque compte actif sur l'année fiscale",
            "done": total > 0,
        },
        {
            "label": "Compléter les dates d'ouverture et de clôture",
            "done": ratio_dates >= 1.0,
        },
        {
            "label": "Renseigner un identifiant de compte exploitable",
            "done": ratio_structure >= 1.0,
        },
        {
            "label": "Contrôler les comptes d'actifs numériques (3916-bis)",
            "done": True,
        },
    ]

    return jsonify({
        "ok": True,
        "annee": annee,
        "comptes": declarables,
        "stats": {
            "total": total,
            "ouverts_dans_annee": motifs_stats["ouvert_dans_annee"],
            "clos_dans_annee": motifs_stats["clos_dans_annee"],
            "actifs_sur_annee": motifs_stats["actif_sur_annee"],
            "ouverts_et_clos_dans_annee": motifs_stats["ouvert_et_clos_dans_annee"],
            "dates_ouverture_manquantes": motifs_stats["date_ouverture_manquante"],
            "comptes_3916_bis": len([c for c in declarables if c.get("est_3916_bis")]),
        },
        "score_confiance": confidence,
        "vigilances": vigilances,
        "checklist": checklist,
        "hypotheses": [
            "Si la date d'ouverture est absente, le compte est conservé par prudence pour éviter un oubli déclaratif.",
            "Un compte est retenu s'il est ouvert avant le 31/12 de l'année et non clôturé avant le 01/01.",
        ],
    })


@app.route("/api/fiscal")
def api_fiscal():
    annee_brute = str(request.args.get("annee", "")).strip()
    annee_defaut = datetime.date.today().year - 1
    try:
        annee = int(annee_brute) if annee_brute else annee_defaut
    except Exception:
        annee = annee_defaut
    if annee < 1990 or annee > 2100:
        return jsonify({"ok": False, "erreur": "Année invalide."}), 400
    return jsonify({"ok": True, **db.get_fiscal_summary(annee)})


@app.route("/api/export/pdf/patrimoine")
def api_export_pdf_patrimoine():
    include_ia_raw = str(request.args.get("include_ia", "1")).strip().lower()
    include_ia_comment = include_ia_raw in ("1", "true", "yes", "on")

    try:
        pdf_bytes = _build_patrimoine_pdf_bytes(include_ia_comment=include_ia_comment)
    except RuntimeError as exc:
        return jsonify({"ok": False, "erreur": str(exc)}), 500
    except Exception as exc:
        app.logger.exception("Export PDF patrimoine impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Export PDF indisponible pour le moment."}), 500

    filename = _build_export_filename()
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.route("/api/export/backup", methods=["GET", "POST"])
def api_export_backup():
    payload = request.get_json(silent=True) or {}
    password = _normalize_backup_password(payload.get("password") if request.method == "POST" else None)
    if password and len(password) < 8:
        return jsonify({
            "ok": False,
            "erreur": "Mot de passe trop court (8 caractères minimum).",
            "action": "Choisissez un mot de passe d'au moins 8 caractères.",
        }), 400

    try:
        archive_bytes, manifest = _build_backup_archive_bytes()
        encrypted = False
        if password:
            archive_bytes = _encrypt_backup_archive_bytes(archive_bytes, password, manifest)
            encrypted = True
    except Exception as exc:
        app.logger.exception("Export backup impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Impossible d'exporter la sauvegarde locale."}), 500

    filename = _build_export_filename(prefix="tomino-backup", ext="tomino-backup")
    return Response(
        archive_bytes,
        mimetype="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Tomino-Backup-Encrypted": "1" if encrypted else "0",
        },
    )


@app.route("/api/backup/auto/status")
def api_backup_auto_status():
    try:
        return jsonify(_auto_backup_status_payload())
    except Exception as exc:
        app.logger.exception("Auto-backup status impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Impossible de lire le statut des sauvegardes automatiques."}), 500


@app.route("/api/backup/auto/open-folder", methods=["POST"])
def api_backup_auto_open_folder():
    try:
        _open_auto_backup_dir()
        return jsonify({"ok": True, "dir": AUTO_BACKUP_DIR})
    except Exception as exc:
        app.logger.exception("Ouverture dossier sauvegardes impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Impossible d'ouvrir le dossier des sauvegardes."}), 500


@app.route("/api/import/csv/positions", methods=["POST"])
def api_import_csv_positions():
    """Parse un fichier de positions broker (Boursorama CSV, Fortuneo XLS) et résout les tickers via Yahoo Finance."""
    import io as _io
    import re as _re

    file = request.files.get("file")
    if not file:
        return jsonify({"ok": False, "erreur": "Fichier manquant."}), 400

    filename = str(file.filename or "").lower()
    file_bytes = file.read()

    def _parse_num(val):
        if val is None or str(val).strip() == "":
            return 0.0
        try:
            return float(str(val).replace(" ", "").replace("\xa0", "").replace(",", ".").strip('"'))
        except (ValueError, TypeError):
            return 0.0

    def _resolve_ticker(isin, name):
        """Cherche le ticker Yahoo Finance via l'ISIN, fallback sur le nom."""
        for query in [isin, name]:
            if not query:
                continue
            try:
                url = "https://query1.finance.yahoo.com/v1/finance/search"
                params = {"q": query, "quotesCount": 5, "newsCount": 0, "listsCount": 0}
                r = prices.SESSION.get(url, params=params, timeout=4)
                quotes = r.json().get("quotes") or []
                for item in quotes:
                    ticker = item.get("symbol", "")
                    if not ticker or prices._ISIN_TICKER.match(ticker):
                        continue
                    if item.get("quoteType", "").upper() not in ("EQUITY", "ETF", "MUTUALFUND"):
                        continue
                    raw_name = item.get("shortname") or item.get("longname") or ticker
                    return ticker, raw_name.split("\t")[0].strip()
            except Exception:
                continue
        return "", name

    def _infer_type(label):
        return "etf" if any(k in label.upper() for k in ("ETF", "UCITS", "INDEX", "TRACKER")) else "action"

    # ── Format Fortuneo : fichier .xls ────────────────────────────────────────
    if filename.endswith(".xls") or filename.endswith(".xlsx"):
        try:
            import xlrd
        except ImportError:
            return jsonify({"ok": False, "erreur": "Module xlrd manquant pour lire les fichiers .xls. Contactez le support."}), 500

        try:
            wb = xlrd.open_workbook(file_contents=file_bytes)
        except Exception as e:
            return jsonify({"ok": False, "erreur": f"Impossible d'ouvrir le fichier Excel : {e}"}), 400

        ws = wb.sheets()[0]

        # Trouver la ligne d'en-tête (contient "ISIN" ou "Qté" ou "Libellé")
        header_idx = None
        header_row = []
        for i in range(min(15, ws.nrows)):
            row = [str(ws.cell_value(i, j)).strip() for j in range(ws.ncols)]
            row_lower = [c.lower() for c in row]
            if any(c in ("isin", "qté", "qt", "libellé", "libelle") for c in row_lower):
                header_idx = i
                header_row = row
                break

        if header_idx is None:
            return jsonify({"ok": False, "erreur": "Format Fortuneo non reconnu : en-tête introuvable."}), 400

        # Mapper les colonnes
        col = {}
        for j, h in enumerate(header_row):
            hl = h.lower().strip()
            if hl in ("libellé", "libelle", "nom", "valeur"):
                col["libelle"] = j
            elif hl in ("qté", "qt", "quantite", "quantité", "qty", "nombre"):
                col["qty"] = j
            elif hl in ("pru", "prix de revient unitaire", "cours achat", "pa"):
                col["pru"] = j
            elif hl == "isin":
                col["isin"] = j

        if "libelle" not in col or "qty" not in col:
            return jsonify({"ok": False, "erreur": "Colonnes Libellé/Qté introuvables dans le fichier Fortuneo."}), 400

        rows = []
        for i in range(header_idx + 1, ws.nrows):
            raw = [ws.cell_value(i, j) for j in range(ws.ncols)]

            libelle = str(raw[col["libelle"]]).strip() if col.get("libelle") is not None else ""
            if not libelle or libelle.lower() in ("total", "totaux", ""):
                continue

            # Extraire le ticker entre parenthèses à la fin : "AIRBUS (AIR)" → "AIR"
            m = _re.search(r'\(([A-Z0-9\-]+)\)\s*$', libelle)
            ticker_raw = m.group(1) if m else ""
            name = _re.sub(r'\s*\([A-Z0-9\-]+\)\s*$', '', libelle).strip() or libelle

            isin = str(raw[col["isin"]]).strip() if col.get("isin") is not None else ""
            qty = _parse_num(raw[col["qty"]]) if col.get("qty") is not None else 0.0
            pru = _parse_num(raw[col["pru"]]) if col.get("pru") is not None else 0.0

            if qty <= 0:
                continue

            # Résolution Yahoo Finance via ISIN (plus fiable que le ticker Euronext brut)
            ticker_yf, resolved_name = _resolve_ticker(isin, name)
            ticker = ticker_yf or ticker_raw  # fallback sur le ticker du fichier

            rows.append({
                "nom": resolved_name or name,
                "nom_original": libelle,
                "isin": isin,
                "ticker": ticker,
                "quantite": qty,
                "pru": pru,
                "date_debut": "",
                "type": _infer_type(libelle),
                "categorie": "coeur",
                "ticker_resolu": bool(ticker_yf),
            })

        return jsonify({"ok": True, "positions": rows})

    # ── Format Boursorama : fichier CSV ───────────────────────────────────────
    try:
        content = file_bytes.decode("utf-8-sig")
    except Exception:
        return jsonify({"ok": False, "erreur": "Impossible de lire le fichier (encodage non supporté)."}), 400

    reader = csv.DictReader(_io.StringIO(content), delimiter=";")

    rows = []
    for row in reader:
        name = str(row.get("name") or row.get("nom") or "").strip().strip('"')
        isin = str(row.get("isin") or row.get("ISIN") or "").strip()
        qty = _parse_num(row.get("quantity") or row.get("quantite") or row.get("qty"))
        pru = _parse_num(row.get("buyingPrice") or row.get("pru") or row.get("PRU") or row.get("cours_achat"))
        date = str(row.get("lastMovementDate") or row.get("date") or "").strip()

        if not name or qty <= 0:
            continue

        ticker, resolved_name = _resolve_ticker(isin, name)

        rows.append({
            "nom": resolved_name or name,
            "nom_original": name,
            "isin": isin,
            "ticker": ticker,
            "quantite": qty,
            "pru": pru,
            "date_debut": date[:10] if len(date) >= 10 else "",
            "type": _infer_type(name),
            "categorie": "coeur",
            "ticker_resolu": bool(ticker),
        })

    return jsonify({"ok": True, "positions": rows})


@app.route("/api/import/backup", methods=["POST"])
def api_import_backup():
    upload = request.files.get("backup") or request.files.get("file")
    if not upload:
        return jsonify({"ok": False, "erreur": "Fichier de sauvegarde manquant (champ 'backup')."}), 400

    if str(request.form.get("confirm_restore", "")).strip() != "1":
        return jsonify({
            "ok": False,
            "erreur": "Confirmation manquante avant restauration. Vérifiez puis confirmez l'écrasement.",
        }), 400

    password = _normalize_backup_password(request.form.get("password"))

    try:
        archive_bytes = upload.read()
        manifest, db_bytes = _extract_backup_archive_bytes(archive_bytes, password=password)
    except ValueError as exc:
        return jsonify({"ok": False, "erreur": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Import backup invalide: %s", exc)
        return jsonify({"ok": False, "erreur": "Import impossible: fichier invalide."}), 400

    db_path = db.DB_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    tmp_path = ""
    pre_import_copy = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="tomino-restore-", suffix=".db", delete=False, dir=os.path.dirname(db_path)) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name

        if os.path.exists(db_path):
            pre_import_copy = f"{db_path}.pre-import-{_paris_now().strftime('%Y%m%d-%H%M%S')}.bak"
            shutil.copy2(db_path, pre_import_copy)

        os.replace(tmp_path, db_path)
        tmp_path = ""

        db.init_db()
        _invalidate_resume_cache()

        schema_after = int(db.get_schema_version() or 0)

        return jsonify({
            "ok": True,
            "message": "Sauvegarde importée avec succès.",
            "format": manifest.get("format"),
            "version": manifest.get("version"),
            "schema_version_before": manifest.get("schema_version"),
            "schema_version_after": schema_after,
            "encrypted": bool(manifest.get("encrypted")),
            "created_at": manifest.get("created_at"),
            "db_size": manifest.get("db_size"),
            "db_sha256": manifest.get("db_sha256"),
            "backup_local": os.path.basename(pre_import_copy) if pre_import_copy else "",
        })
    except PermissionError:
        return jsonify({
            "ok": False,
            "erreur": "Import impossible: la base locale est utilisée. Fermez les autres opérations et réessayez.",
        }), 423
    except Exception as exc:
        app.logger.exception("Import backup impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Import impossible pour le moment."}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@app.route("/api/import/backup/verify", methods=["POST"])
def api_import_backup_verify():
    upload = request.files.get("backup") or request.files.get("file")
    if not upload:
        return jsonify({"ok": False, "erreur": "Fichier de sauvegarde manquant (champ 'backup')."}), 400

    password = _normalize_backup_password(request.form.get("password"))

    try:
        archive_bytes = upload.read()
        manifest, db_bytes = _extract_backup_archive_bytes(archive_bytes, password=password)
        backup_overview = _db_overview_from_sqlite_bytes(db_bytes)
        current_overview = _db_overview_from_path(db.DB_PATH)

        return jsonify({
            "ok": True,
            "filename": upload.filename or "backup.tomino-backup",
            "manifest": {
                "format": manifest.get("format"),
                "version": manifest.get("version"),
                "schema_version": manifest.get("schema_version"),
                "created_at": manifest.get("created_at"),
                "db_size": manifest.get("db_size"),
                "db_sha256": manifest.get("db_sha256"),
                "encrypted": bool(manifest.get("encrypted")),
            },
            "backup": backup_overview,
            "current": current_overview,
            "warning": "La restauration remplace la base locale actuelle. Une copie de sécurité pré-import sera créée automatiquement.",
        })
    except ValueError as exc:
        return jsonify({"ok": False, "erreur": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Vérification backup impossible: %s", exc)
        return jsonify({"ok": False, "erreur": "Impossible de vérifier la sauvegarde."}), 500


@app.route("/api/export/csv/mouvements")
def api_export_csv_mouvements():
    headers = [
        "id",
        "date_operation",
        "enveloppe",
        "type_operation",
        "actif_id",
        "actif_nom",
        "ticker",
        "quantite",
        "prix_unitaire",
        "frais",
        "montant_brut",
        "montant_net",
        "pv_realisee",
        "created_at",
    ]
    rows = _build_mouvements_csv_rows()
    return _csv_download_response("tomino-mouvements", headers, rows)


@app.route("/api/export/csv/dividendes")
def api_export_csv_dividendes():
    headers = [
        "id",
        "date_versement",
        "enveloppe",
        "nom",
        "ticker",
        "montant",
        "montant_brut",
        "retenue_source",
        "montant_net",
        "pays_source",
        "devise_source",
        "notes",
        "created_at",
    ]
    rows = _build_dividendes_csv_rows()
    return _csv_download_response("tomino-dividendes", headers, rows)


@app.route("/api/export/csv/fiscal")
def api_export_csv_fiscal():
    annee_brute = str(request.args.get("annee", "")).strip()
    annee_defaut = datetime.date.today().year - 1
    try:
        annee = int(annee_brute) if annee_brute else annee_defaut
    except Exception:
        annee = annee_defaut
    if annee < 1990 or annee > 2100:
        return jsonify({"ok": False, "erreur": "Année invalide."}), 400

    headers = ["categorie", "sous_categorie", "metric", "valeur", "unite", "notes"]
    rows = _build_fiscal_csv_rows(annee)
    return _csv_download_response(f"tomino-fiscal-{annee}", headers, rows)


@app.route("/api/dividendes", methods=["POST"])
def api_dividendes_create():
    payload = request.get_json(silent=True) or {}
    data = _dividende_payload(payload)
    ok, error = _validate_dividende_data(data)
    if not ok:
        return jsonify({"ok": False, "erreur": error}), 400

    db.add_dividende(data)
    return jsonify({"ok": True})


@app.route("/api/dividendes/<int:dividende_id>", methods=["PUT"])
def api_dividendes_update(dividende_id):
    current = db.get_dividende(dividende_id)
    if not current:
        return jsonify({"ok": False, "erreur": "Dividende introuvable."}), 404

    payload = request.get_json(silent=True) or {}
    data = _dividende_payload(payload, current)
    ok, error = _validate_dividende_data(data)
    if not ok:
        return jsonify({"ok": False, "erreur": error}), 400

    db.update_dividende(dividende_id, data)
    return jsonify({"ok": True})


@app.route("/api/dividendes/sync", methods=["POST"])
def api_dividendes_sync():
    nouveaux = prices.import_dividendes_auto()
    return jsonify({"ok": True, "nouveaux": int(nouveaux)})


@app.route("/api/dividendes/calendrier")
def api_dividendes_calendrier():
    actifs = db.get_actifs()
    ticker_qty = {}
    ticker_nom = {}
    ticker_env = {}
    for a in actifs:
        t = str(a.get("ticker") or "").strip().upper()
        if not t:
            continue
        qty = float(a.get("quantite") or 0)
        if qty <= 0:
            continue
        ticker_qty[t] = ticker_qty.get(t, 0) + qty
        if t not in ticker_nom:
            ticker_nom[t] = str(a.get("nom") or t)
        env = str(a.get("enveloppe") or "")
        if env:
            ticker_env.setdefault(t, [])
            if env not in ticker_env[t]:
                ticker_env[t].append(env)

    events = prices.get_calendrier_dividendes(ticker_qty)
    for e in events:
        t = e.get("ticker", "")
        e["nom"] = ticker_nom.get(t, t)
        e["enveloppes"] = ticker_env.get(t, [])
    return jsonify({"events": events})


@app.route("/api/dividendes/<int:dividende_id>", methods=["DELETE"])
def api_dividendes_delete(dividende_id):
    db.delete_dividende(dividende_id)
    return jsonify({"ok": True})


@app.route("/api/alertes")
def api_alertes():
    return jsonify({"alertes": db.get_alertes()})


@app.route("/api/alertes/check")
def api_alertes_check():
    declenchees = prices.verifier_alertes()
    return jsonify({"declenchees": declenchees})


@app.route("/api/alertes", methods=["POST"])
def api_alertes_create():
    payload = request.get_json(silent=True) or {}
    data = _alerte_payload(payload)
    if not data["ticker"]:
        return jsonify({"ok": False, "erreur": "Champ 'ticker' obligatoire."}), 400
    if data["seuil"] <= 0:
        return jsonify({"ok": False, "erreur": "Le seuil doit être strictement positif."}), 400

    user, _session = _auth_optional_user_session()
    tier = _auth_normalize_tier((user or {}).get("tier") if isinstance(user, dict) else "free")
    active_alertes = db.get_alertes(actives_only=True)
    free_limit = _alerts_limit_for_tier(tier)
    if free_limit is not None and len(active_alertes) >= free_limit:
        return jsonify({
            "ok": False,
            "erreur": f"Limite Free atteinte: {free_limit} alertes actives maximum.",
            "action": "Passez à Tomino + pour des alertes illimitées.",
            "limit": free_limit,
            "active_count": len(active_alertes),
            "tier": tier,
        }), 403

    db.add_alerte(data)
    return jsonify({"ok": True})


@app.route("/api/alertes/<int:alerte_id>", methods=["DELETE"])
def api_alertes_delete(alerte_id):
    db.delete_alerte(alerte_id)
    return jsonify({"ok": True})


@app.route("/api/alertes/<int:alerte_id>/reactiver", methods=["POST"])
def api_alertes_reactiver(alerte_id):
    db.reactiver_alerte(alerte_id)
    return jsonify({"ok": True})


@app.route("/api/historique")
def api_historique():
    return jsonify(db.get_historique(90))


_RECONSTRUCTION_LOCK = threading.Lock()

@app.route("/api/historique/reconstruire", methods=["POST"])
def api_historique_reconstruire():
    """
    Reconstruit l'historique patrimonial rétroactif à partir des mouvements
    et des cours Yahoo Finance. Opération longue (~5–30s selon le nombre de tickers).
    Idempotente : peut être relancée sans perdre les données existantes.
    """
    if not _RECONSTRUCTION_LOCK.acquire(blocking=False):
        return jsonify({"ok": False, "erreur": "Reconstruction déjà en cours, patientez."}), 409

    try:
        mouvements = db.get_mouvements_pour_historique()
        if not mouvements:
            return jsonify({"ok": True, "points": 0, "message": "Aucun mouvement avec ticker connu."})

        snapshots = prices.reconstruire_historique_portfolio(mouvements)
        if not snapshots:
            return jsonify({"ok": True, "points": 0, "message": "Aucune donnée récupérée depuis Yahoo Finance."})

        count = db.upsert_historique_retroactif(snapshots)
        app.logger.info("Reconstruction historique : %d points insérés/mis à jour.", count)
        return jsonify({"ok": True, "points": count, "tickers": len(mouvements)})
    except Exception as e:
        app.logger.exception("Erreur reconstruction historique : %s", e)
        return jsonify({"ok": False, "erreur": str(e)}), 500
    finally:
        _RECONSTRUCTION_LOCK.release()


@app.route("/api/rapport")
def api_rapport():
    mois = request.args.get("mois", "").strip()
    # Valider et normaliser YYYY-MM
    if not re.match(r"^\d{4}-\d{2}$", mois):
        now = datetime.datetime.now()
        mois = now.strftime("%Y-%m")

    debut = mois + "-01"
    # Dernier jour du mois
    try:
        y, m = int(mois[:4]), int(mois[5:7])
        if m == 12:
            fin_dt = datetime.date(y + 1, 1, 1) - datetime.timedelta(days=1)
        else:
            fin_dt = datetime.date(y, m + 1, 1) - datetime.timedelta(days=1)
        fin = str(fin_dt)
    except Exception:
        fin = mois + "-31"

    conn = db.get_db()

    # Historique du mois (évolution patrimoine)
    hist_rows = conn.execute(
        "SELECT date, valeur_totale, valeur_pea, valeur_cto, valeur_or, valeur_livrets, valeur_assurance_vie "
        "FROM historique WHERE date >= ? AND date <= ? ORDER BY date ASC",
        (debut, fin),
    ).fetchall()
    historique = [dict(r) for r in hist_rows]

    # Valeur début et fin de mois
    valeur_debut = historique[0]["valeur_totale"] if historique else None
    valeur_fin = historique[-1]["valeur_totale"] if historique else None
    variation = None
    variation_pct = None
    if valeur_debut is not None and valeur_fin is not None:
        variation = round(valeur_fin - valeur_debut, 2)
        variation_pct = round((variation / valeur_debut * 100), 2) if valeur_debut else 0

    # Mouvements du mois
    mov_rows = conn.execute(
        """SELECT m.*, a.ticker, a.nom AS actif_nom
           FROM mouvements m
           LEFT JOIN actifs a ON a.id = m.actif_id
           WHERE m.date_operation >= ? AND m.date_operation <= ?
           ORDER BY m.date_operation DESC, m.id DESC""",
        (debut, fin),
    ).fetchall()
    mouvements = [dict(r) for r in mov_rows]

    # Dividendes du mois
    div_rows = conn.execute(
        "SELECT * FROM dividendes WHERE date_versement >= ? AND date_versement <= ? ORDER BY date_versement DESC, id DESC",
        (debut, fin),
    ).fetchall()
    dividendes = [dict(r) for r in div_rows]

    # Alertes déclenchées ce mois
    alerte_rows = conn.execute(
        "SELECT * FROM alertes WHERE declenchee_le >= ? AND declenchee_le <= ? ORDER BY declenchee_le DESC",
        (debut + " 00:00:00", fin + " 23:59:59"),
    ).fetchall()
    alertes = [dict(r) for r in alerte_rows]

    conn.close()

    # Agrégats dividendes
    total_dividendes = round(sum(d.get("montant_net") or 0 for d in dividendes), 2)

    # Investissements nets (achats - ventes)
    total_achats = round(sum(
        (m.get("montant_net") or 0) for m in mouvements if m.get("type_operation") == "achat"
    ), 2)
    total_ventes = round(sum(
        (m.get("montant_net") or 0) for m in mouvements if m.get("type_operation") == "vente"
    ), 2)
    pv_realisee = round(sum(
        (m.get("pv_realisee") or 0) for m in mouvements if m.get("pv_realisee") is not None
    ), 2)

    return jsonify({
        "mois": mois,
        "debut": debut,
        "fin": fin,
        "historique": historique,
        "valeur_debut": valeur_debut,
        "valeur_fin": valeur_fin,
        "variation": variation,
        "variation_pct": variation_pct,
        "mouvements": mouvements,
        "dividendes": dividendes,
        "alertes": alertes,
        "stats": {
            "total_dividendes": total_dividendes,
            "total_achats": total_achats,
            "total_ventes": total_ventes,
            "pv_realisee": pv_realisee,
            "nb_mouvements": len(mouvements),
            "nb_dividendes": len(dividendes),
            "nb_alertes": len(alertes),
        },
    })


@app.route("/api/stock/search")
def api_stock_search():
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify([])
    return jsonify(prices.search_tickers(q))


@app.route("/api/stock/historique/<path:ticker>")
def api_stock_historique(ticker):
    ticker = str(ticker).strip().upper()
    data = prices.get_stock_history(ticker)
    if not data:
        return jsonify({"ok": False, "erreur": "Données historiques indisponibles"}), 404
    return jsonify({"ok": True, **data})


@app.route("/api/stock/memo", methods=["POST"])
def api_stock_memo():
    payload = request.get_json(silent=True) or {}
    stock_data = payload.get("stock_data", {})
    history_data = payload.get("history_data", None)
    if not stock_data or not stock_data.get("ticker"):
        return jsonify({"ok": False, "erreur": "stock_data manquant"}), 400
    if not _xai_api_key_configured():
        return jsonify({
            "ok": False,
            "erreur": "Clé API xAI absente. Configurez XAI_API_KEY dans le fichier .env puis redémarrez Tomino.",
        }), 503
    texte, usage = grok.generer_memo_action(stock_data, history_data)
    if texte.startswith("[ERREUR]"):
        return jsonify({"ok": False, "erreur": texte}), 500
    return jsonify({"ok": True, "memo": texte, "usage": usage})


@app.route("/api/stock/<path:ticker>")
def api_stock_fundamentals(ticker):
    ticker = str(ticker).strip().upper()
    if not ticker:
        return jsonify({"ok": False, "erreur": "Ticker manquant"}), 400
    force = request.args.get("force", "0") == "1"
    data = prices.get_stock_fundamentals(ticker, force=force)
    if not data:
        return jsonify({
            "ok": False,
            "erreur": f"Impossible de récupérer les données pour {ticker}. Vérifiez le ticker ou réessayez dans quelques secondes.",
        }), 404
    return jsonify({"ok": True, **data})


@app.route("/api/stock/chat/stream", methods=["POST"])
def api_stock_chat_stream():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    stock_data = payload.get("stock_data", {})
    history_data = payload.get("history_data", {})
    investment_score = payload.get("investment_score", {})

    if not isinstance(messages, list):
        return jsonify({"ok": False, "erreur": "Format invalide"}), 400

    if not _xai_api_key_configured():
        return jsonify({
            "ok": False,
            "erreur": "Clé API xAI absente. Configurez XAI_API_KEY dans le fichier .env puis redémarrez Tomino.",
        }), 503

    conv_id = str(payload.get("conv_id") or "").strip() or None
    tier = db.get_profil().get("tier", "free")
    quota = _compute_ia_quota(tier=tier)
    if quota["blocked"]:
        return jsonify({"ok": False, "erreur": _quota_error_message(quota), "quota": quota}), 429

    @stream_with_context
    def generate():
        chunks = []
        usage = {}
        for chunk in grok.stock_chat_stream(
            messages,
            stock_data,
            history_data=history_data,
            investment_score=investment_score,
            tier=tier,
            conv_id=conv_id,
        ):
            if isinstance(chunk, dict) and "__usage__" in chunk:
                usage = chunk["__usage__"]
                continue
            chunks.append(chunk)
            yield "data: " + json.dumps({"delta": chunk}, ensure_ascii=False) + "\n\n"
        full_output = "".join(chunks)
        if not str(full_output or "").startswith("[ERREUR]"):
            _record_ia_usage("stock_chat", tier, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("cached_tokens", 0))
        yield "data: " + json.dumps({"done": True}, ensure_ascii=False) + "\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/cours/<ticker>")
def api_cours(ticker):
    data = prices.get_prix(ticker)
    return jsonify(data or {"erreur": "cours introuvable"})


@app.route("/api/benchmark")
def api_benchmark():
    ticker = request.args.get("ticker", "").strip()
    depuis = request.args.get("depuis", "").strip()
    data = prices.get_benchmark_performance(ticker, depuis)
    if data is None:
        return jsonify({"ok": False, "erreur": "benchmark indisponible"})
    return jsonify(data)


@app.route("/api/repartition")
def api_repartition():
    env = _clean_env(request.args.get("env", "PEA"))
    actifs = prices.enrichir_actifs(db.get_actifs(env))
    total = sum(float(a.get("valeur_actuelle", 0) or 0) for a in actifs)

    if total <= 0:
        return jsonify({"secteurs": {}, "pays": {}})

    secteurs = {}
    pays = {}

    for a in actifs:
        ticker = str(a.get("ticker", "")).strip()
        if not ticker:
            continue

        valeur = float(a.get("valeur_actuelle", 0) or 0)
        if valeur <= 0:
            continue

        info = prices.get_info_titre(ticker)

        secteur = str((info or {}).get("sector", "")).strip()
        country = str((info or {}).get("country", "")).strip()
        sector_weights = (info or {}).get("sector_weights") or {}

        if secteur:
            secteurs[secteur] = secteurs.get(secteur, 0.0) + valeur
        elif sector_weights:
            # ETF : distribuer la valeur proportionnellement sur les secteurs
            for s, w in sector_weights.items():
                secteurs[s] = secteurs.get(s, 0.0) + valeur * w
        else:
            secteurs["Non classifié"] = secteurs.get("Non classifié", 0.0) + valeur

        country_weights = (info or {}).get("country_weights") or {}
        is_etf = str(a.get("type", "")).lower() in ("etf", "mutualfund") or bool(sector_weights)

        if country_weights:
            # ETF ou action avec répartition géographique détaillée
            for c, w in country_weights.items():
                pays[c] = pays.get(c, 0.0) + valeur * w
        elif country and not is_etf:
            # Action individuelle : utiliser le pays de domiciliation
            pays[country] = pays.get(country, 0.0) + valeur
        elif not is_etf:
            pays["Non classifié"] = pays.get("Non classifié", 0.0) + valeur
        # ETF sans country_weights → ignoré (domiciliation != exposition géographique)

    def to_pct(buckets: dict[str, float]) -> dict[str, float]:
        if not buckets:
            return {}
        bucket_total = sum(buckets.values())
        if bucket_total <= 0:
            return {}
        return {
            k: round(v / bucket_total * 100, 1)
            for k, v in sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
        }

    return jsonify({"secteurs": to_pct(secteurs), "pays": to_pct(pays)})


@app.route("/api/position_existante")
def api_position_existante():
    ticker = request.args.get("ticker", "").upper().strip()
    env = _clean_env(request.args.get("env", "PEA"))
    if not ticker:
        return jsonify({"existant": False})

    actif = db.get_actif_by_ticker(ticker, env)
    if actif:
        return jsonify({"existant": True, "quantite": actif["quantite"], "pru": actif["pru"]})
    return jsonify({"existant": False})


@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])

    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {
            "q": q,
            "lang": "fr-FR",
            "region": "FR",
            "quotesCount": 15,
            "newsCount": 0,
            "listsCount": 0,
        }
        r = prices.SESSION.get(url, params=params, timeout=5)
        data = r.json()
        quotes = data.get("quotes") or []
        raw = []
        for item in quotes:
            ticker = item.get("symbol", "")
            if not ticker:
                continue
            if prices._ISIN_TICKER.match(ticker):
                continue
            if item.get("quoteType", "").upper() not in ("EQUITY", "ETF", "MUTUALFUND"):
                continue
            exchDisp = item.get("exchDisp", "")
            raw_name = item.get("shortname") or item.get("longname") or ticker
            # Yahoo Finance insère parfois un tab + classe d'action (ex: "Airbus SE\tA") → strip
            clean_name = raw_name.split('\t')[0].strip()
            raw.append({
                "symbol": ticker,
                "name": clean_name,
                "exchange": exchDisp,
                "type": item.get("quoteType", "").lower(),
                "_exc": item.get("exchange", ""),
            })
        deduped = prices._dedup_search(raw, name_key="name", exchange_key="_exc")
        results = [{"symbol": x["symbol"], "name": x["name"], "exchange": x["exchange"], "type": x["type"]} for x in deduped[:8]]
        return jsonify(results)
    except Exception:
        return jsonify([])


@app.route("/api/rafraichir", methods=["POST"])
def api_rafraichir():
    prices.vider_cache()
    _invalidate_resume_cache()
    resume = calcul_resume(force=True)
    try:
        db.save_snapshot({
            "totale": resume["total"],
            "pea": resume["pea"]["valeur_actuelle"],
            "cto": resume["cto"]["valeur_actuelle"],
            "or_": resume["or"]["valeur_actuelle"],
            "livrets": resume["livrets"]["valeur_actuelle"],
            "assurance_vie": resume["assurance_vie"]["valeur_actuelle"],
            "investie": resume.get("total_investi", 0),
        }, snapshot_date=_paris_now().date().isoformat())
    except Exception:
        pass
    return jsonify({"ok": True, "total": resume["total"]})


@app.route("/api/grok/analyser", methods=["POST"])
def api_grok_analyser():
    payload = request.get_json(silent=True) or {}
    type_analyse = str(payload.get("type_analyse", "performance")).strip() or "performance"

    if not _xai_api_key_configured():
        return jsonify({
            "ok": False,
            "erreur": "Clé API xAI absente. Configurez XAI_API_KEY dans le fichier .env puis redémarrez Tomino.",
            "action": "Ajoutez XAI_API_KEY dans .env puis relancez l'application.",
        }), 503

    if type_analyse not in ("performance", "arbitrage", "risques"):
        return jsonify({"ok": False, "erreur": "type_analyse invalide"}), 400

    # Le tier est toujours lu depuis le profil serveur, jamais depuis le client
    tier = db.get_profil().get("tier", "free")

    quota = _compute_ia_quota(tier=tier)
    if quota["blocked"]:
        return jsonify({"ok": False, "erreur": _quota_error_message(quota), "quota": quota}), 429

    resume = calcul_resume()
    actifs = [a for a in _enrichir_avec_tri(db.get_actifs()) if float(a.get("quantite") or 0) > 0]
    reponse, usage = grok.analyser(type_analyse, resume, actifs, tier=tier)

    if str(reponse or "").startswith("[ERREUR]"):
        return jsonify({
            "ok": False,
            "erreur": _clean_ai_error_text(reponse),
            "action": "Vérifiez la clé API xAI, votre connexion réseau, puis réessayez.",
        }), 502

    analyse_id = None
    if not str(reponse or "").startswith("[ERREUR]"):
        _record_ia_usage("analyse", tier, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("cached_tokens", 0))
        last = db.get_analyses(1)
        analyse_id = last[0]["id"] if last else None

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return jsonify({"ok": True, "id": analyse_id, "type": type_analyse, "reponse": reponse, "date": now_str})


@app.route("/api/grok/historique")
def api_grok_historique():
    return jsonify({"ok": True, "analyses": db.get_analyses(20)})


@app.route("/api/chat", methods=["POST"])
def api_chat():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        return jsonify({"ok": False, "erreur": "Format JSON invalide: 'messages' doit etre une liste."}), 400

    if not _xai_api_key_configured():
        return jsonify({
            "ok": False,
            "erreur": "Clé API xAI absente. Configurez XAI_API_KEY dans le fichier .env puis redémarrez Tomino.",
            "action": "Ajoutez XAI_API_KEY dans .env puis relancez l'application.",
        }), 503

    tier = db.get_profil().get("tier", "free")
    quota = _compute_ia_quota(tier=tier)
    if quota["blocked"]:
        return jsonify({"ok": False, "erreur": _quota_error_message(quota), "quota": quota}), 429

    resume = calcul_resume()
    actifs = [a for a in _enrichir_avec_tri(db.get_actifs()) if float(a.get("quantite") or 0) > 0]
    reponse, usage = grok.chat(messages, resume, actifs=actifs, tier=tier)
    if str(reponse or "").startswith("[ERREUR]"):
        return jsonify({
            "ok": False,
            "erreur": _clean_ai_error_text(reponse),
            "action": "Vérifiez la clé API xAI, votre connexion réseau, puis réessayez.",
        }), 502

    _record_ia_usage("chat", tier, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("cached_tokens", 0))
    return jsonify({"ok": True, "reponse": reponse})


@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        return jsonify({"ok": False, "erreur": "Format JSON invalide: 'messages' doit etre une liste."}), 400

    if not _xai_api_key_configured():
        return jsonify({
            "ok": False,
            "erreur": "Clé API xAI absente. Configurez XAI_API_KEY dans le fichier .env puis redémarrez Tomino.",
            "action": "Ajoutez XAI_API_KEY dans .env puis relancez l'application.",
        }), 503

    tier = db.get_profil().get("tier", "free")
    quota = _compute_ia_quota(tier=tier)
    if quota["blocked"]:
        return jsonify({"ok": False, "erreur": _quota_error_message(quota), "quota": quota}), 429

    conv_id = str(payload.get("conv_id") or "").strip() or None
    resume = calcul_resume()
    actifs = [a for a in _enrichir_avec_tri(db.get_actifs()) if float(a.get("quantite") or 0) > 0]

    @stream_with_context
    def generate():
        chunks = []
        usage = {}
        for chunk in grok.chat_stream(messages, resume, actifs=actifs, tier=tier, conv_id=conv_id):
            if isinstance(chunk, dict) and "__usage__" in chunk:
                usage = chunk["__usage__"]
                continue
            chunks.append(chunk)
            yield "data: " + json.dumps({"delta": chunk}, ensure_ascii=False) + "\n\n"
        full_output = "".join(chunks)
        if not str(full_output or "").startswith("[ERREUR]"):
            _record_ia_usage("chat", tier, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("cached_tokens", 0))
        yield "data: " + json.dumps({"done": True}, ensure_ascii=False) + "\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/demo/inject", methods=["POST"])
def api_demo_inject():
    try:
        db.inject_demo_data()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erreur": str(e)}), 500

@app.route("/api/demo/reset", methods=["POST"])
def api_demo_reset():
    try:
        db.reset_all_data()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erreur": str(e)}), 500

@app.errorhandler(404)
def json_not_found(_error):
    return jsonify({
        "ok": False,
        "erreur": "Route introuvable",
        "hint": "Consulte / pour la liste d'endpoints API disponibles.",
    }), 404


@app.errorhandler(sqlite3.OperationalError)
def json_sqlite_operational_error(error):
    message = str(error or "").lower()
    if "locked" in message or "database is locked" in message:
        return jsonify({
            "ok": False,
            "erreur": "Base locale temporairement verrouillée.",
            "action": "Fermez les opérations en cours, attendez quelques secondes puis réessayez.",
        }), 423

    return jsonify({
        "ok": False,
        "erreur": "Erreur base de données locale.",
        "action": "Redémarrez Tomino puis réessayez. Si le problème persiste, restaurez une sauvegarde récente.",
    }), 500



if SERVE_FRONTEND:
    from flask import send_from_directory

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        # Routes API -> ne pas intercepter
        if path.startswith("api/"):
            return jsonify({"ok": False, "erreur": "Route API introuvable"}), 404
        # Fichier statique existant (JS, CSS, assets)
        target = FRONT_DIST / path
        if path and target.exists() and target.is_file():
            return send_from_directory(str(FRONT_DIST), path)
        # SPA fallback -> index.html pour React Router
        return send_from_directory(str(FRONT_DIST), "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)

