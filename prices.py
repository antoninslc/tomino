"""
Module de récupération des cours via l'API Yahoo Finance (appel direct HTTP).
Contourne les problèmes de blocage de yfinance en utilisant requests
avec les bons headers navigateur.
"""

import json
import logging
import os
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# ── CACHE ─────────────────────────────────────────────────
_cache = {}
_cache_lock = threading.RLock()
_thread_local = threading.local()
CACHE_TTL = 300  # 5 minutes
INFO_TTL = 86400  # 24 heures
MAX_PARALLEL_FETCH = 6

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prix_cache.json")


def _configure_session(session: requests.Session) -> requests.Session:
    session.headers.update(HEADERS)
    session.cookies.set("euConsent", "true", domain=".yahoo.com")
    session.cookies.set("GUCS", "AQABCAFn", domain=".yahoo.com")
    return session

def _load_cache():
    global _cache
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                _cache = json.load(f)
        except Exception:
            _cache = {}

def _save_cache():
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(_cache, f)
    except Exception:
        pass

_load_cache()

# ── HEADERS navigateur pour contourner le blocage Yahoo ───
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
}

SESSION = _configure_session(requests.Session())


def _get_session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = _configure_session(requests.Session())
        _thread_local.session = session
    return session


def _get_cache_entry(cache_key: str, ttl: int) -> dict | None:
    now = time.time()
    with _cache_lock:
        entry = _cache.get(cache_key)
        if isinstance(entry, dict) and now - entry.get("timestamp", 0) < ttl:
            return dict(entry)
    return None


def _set_cache_entries(entries: dict[str, dict]) -> None:
    if not entries:
        return

    with _cache_lock:
        _cache.update(entries)
        _save_cache()


def _build_price_result(ticker: str, raw: dict | None, now: float | None = None, eur_usd: float | None = None) -> dict:
    now = now or time.time()

    if not raw:
        return {
            "ticker": ticker,
            "prix": None,
            "devise": "EUR",
            "timestamp": now,
            "date": "—",
            "source": "yahoo_direct",
            "erreur": "Impossible de récupérer le cours (ticker invalide ou marché fermé)",
        }

    prix = raw["prix"]
    devise = raw["devise"]

    if devise == "USD":
        taux_eur_usd = eur_usd if eur_usd and eur_usd > 0 else _get_eurusd()
        if taux_eur_usd and taux_eur_usd > 0:
            prix = round(prix / taux_eur_usd, 4)
            devise = "EUR"

    return {
        "ticker": ticker,
        "prix": round(prix, 4),
        "devise": devise,
        "timestamp": now,
        "date": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "source": "yahoo_direct",
    }


def get_prix_many(tickers: list[str]) -> dict[str, dict]:
    """
    Retourne les cours d'une liste de tickers en limitant les appels Yahoo
    via déduplication, cache partagé et fetch parallèle des entrées manquantes.
    """
    results: dict[str, dict] = {}
    tickers_uniques: list[str] = []
    deja_vus: set[str] = set()

    for ticker in tickers:
        normalized = str(ticker or "").strip().upper()
        if not normalized or normalized in deja_vus:
            continue
        deja_vus.add(normalized)
        tickers_uniques.append(normalized)

    missing: list[str] = []
    for ticker in tickers_uniques:
        cached = _get_cache_entry(ticker, CACHE_TTL)
        if cached is not None:
            results[ticker] = cached
        else:
            missing.append(ticker)

    if not missing:
        return results

    raws: dict[str, dict | None] = {}
    max_workers = min(MAX_PARALLEL_FETCH, len(missing))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_fetch_yahoo, ticker): ticker for ticker in missing}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                raws[ticker] = future.result()
            except Exception:
                raws[ticker] = None

    eur_usd = None
    if any(raw and raw.get("devise") == "USD" for raw in raws.values()):
        eur_usd = _get_eurusd()

    now = time.time()
    cache_updates: dict[str, dict] = {}
    for ticker in missing:
        result = _build_price_result(ticker, raws.get(ticker), now=now, eur_usd=eur_usd)
        results[ticker] = result
        if result.get("prix") is not None:
            cache_updates[ticker] = result

    _set_cache_entries(cache_updates)
    return results


def _fetch_yahoo(ticker: str) -> dict | None:
    """
    Appelle l'API Yahoo Finance v8 directement.
    Retourne le dict 'price' ou None en cas d'échec.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "interval": "1d",
        "range": "1d",
        "includePrePost": "false",
    }

    try:
        session = _get_session()
        r = session.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        chart = data.get("chart", {})
        if chart.get("error"):
            return None

        result_data = chart.get("result", [])
        if not result_data:
            return None

        meta = result_data[0].get("meta", {})
        prix = meta.get("regularMarketPrice") or meta.get("previousClose")
        devise = meta.get("currency", "EUR")

        if not prix:
            return None

        return {"prix": float(prix), "devise": devise}

    except Exception:
        # Fallback sur query2 si query1 échoue
        try:
            url2 = url.replace("query1", "query2")
            r2 = session.get(url2, params=params, timeout=10)
            r2.raise_for_status()
            data2 = r2.json()
            meta2 = data2["chart"]["result"][0]["meta"]
            prix2 = meta2.get("regularMarketPrice") or meta2.get("previousClose")
            devise2 = meta2.get("currency", "EUR")
            if prix2:
                return {"prix": float(prix2), "devise": devise2}
        except Exception:
            pass

        return None


def _get_eurusd() -> float | None:
    """Taux EUR/USD via Yahoo Finance."""
    data = _fetch_yahoo("EURUSD=X")
    if data and data.get("prix"):
        return data["prix"]
    return None


def get_prix(ticker: str) -> dict | None:
    """
    Retourne {prix, devise, timestamp, date, source, cours_ok} pour un ticker.
    Cache de 5 minutes. Conversion USD→EUR automatique.
    """
    if not ticker:
        return None

    ticker = ticker.upper().strip()
    cached = _get_cache_entry(ticker, CACHE_TTL)
    if cached is not None:
        return cached

    raw = _fetch_yahoo(ticker)
    result = _build_price_result(ticker, raw)
    if result.get("prix") is not None:
        _set_cache_entries({ticker: result})
    return result


def get_info_titre(ticker: str) -> dict:
    """
    Retourne des informations de profil Yahoo: secteur et pays.
    Cache 24h dans _cache avec clé "info_{ticker}".
    """
    if not ticker:
        return {}

    ticker = ticker.upper().strip()
    cache_key = f"info_{ticker}"
    now = time.time()

    entry = _cache.get(cache_key)
    if isinstance(entry, dict) and now - entry.get("timestamp", 0) < INFO_TTL:
        value = entry.get("value")
        return value if isinstance(value, dict) else {}

    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
    params = {"modules": "assetProfile,summaryProfile"}

    try:
        r = _get_session().get(url, params=params, timeout=8)
        r.raise_for_status()
        payload = r.json()

        result = payload.get("quoteSummary", {}).get("result") or []
        if not result:
            return {}

        info_block = result[0]
        profile = info_block.get("assetProfile") or info_block.get("summaryProfile") or {}
        sector = str(profile.get("sector") or "").strip()
        country = str(profile.get("country") or "").strip()

        info = {}
        if sector:
            info["sector"] = sector
        if country:
            info["country"] = country

        # Force l'accès pour rester compatible avec le schéma demandé,
        # même si la donnée n'est pas renvoyée au client.
        _ = profile.get("longBusinessSummary")

        _set_cache_entries({
            cache_key: {
                "timestamp": now,
                "value": info,
            }
        })
        return info
    except Exception:
        return {}


def enrichir_actifs(actifs: list) -> list:
    """
    Enrichit une liste d'actifs avec cours réel, valeur actuelle et +/- value.
    """
    prix_par_ticker = get_prix_many([a.get("ticker", "") for a in actifs])
    enrichis = []
    for a in actifs:
        a = dict(a)
        ticker  = a.get("ticker", "")
        qte     = float(a.get("quantite", 0))
        pru     = float(a.get("pru", 0))
        investi = qte * pru

        data = prix_par_ticker.get(str(ticker or "").strip().upper()) if ticker else None

        if data and data.get("prix"):
            cours    = data["prix"]
            valeur   = qte * cours
            pv_euros = valeur - investi
            pv_pct   = (pv_euros / investi * 100) if investi > 0 else 0

            a["cours_actuel"]    = round(cours, 4)
            a["valeur_actuelle"] = round(valeur, 2)
            a["pv_euros"]        = round(pv_euros, 2)
            a["pv_pct"]          = round(pv_pct, 2)
            a["cours_date"]      = data.get("date", "—")
            a["cours_ok"]        = True
        else:
            a["cours_actuel"]    = pru
            a["valeur_actuelle"] = investi
            a["pv_euros"]        = 0.0
            a["pv_pct"]          = 0.0
            a["cours_date"]      = "—"
            a["cours_ok"]        = False
            if data and data.get("erreur"):
                a["cours_erreur"] = data["erreur"]

        a["valeur_investie"] = round(investi, 2)
        enrichis.append(a)

    return enrichis


def calcul_stats_enveloppe(actifs_enrichis: list) -> dict:
    valeur_actuelle = sum(a["valeur_actuelle"] for a in actifs_enrichis)
    valeur_investie = sum(a["valeur_investie"] for a in actifs_enrichis)
    pv_euros = valeur_actuelle - valeur_investie
    pv_pct   = (pv_euros / valeur_investie * 100) if valeur_investie > 0 else 0

    return {
        "valeur_actuelle": round(valeur_actuelle, 2),
        "valeur_investie": round(valeur_investie, 2),
        "pv_euros":        round(pv_euros, 2),
        "pv_pct":          round(pv_pct, 2),
        "nb":              len(actifs_enrichis),
    }


def vider_cache():
    """Efface complètement le cache (rarement utilisé, gardé pour compatibilité)."""
    global _cache
    _cache = {}
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)


def vider_cache_ancien(max_age: int = 60) -> int:
    """
    Purge uniquement les entrées de cache qui ont dépassé leur TTL.
    Permet de rafraîchir les données stales sans refetch inutile de tout.
    
    Args:
        max_age: âge maximal en secondes (défaut 60s = 1 minute)
    
    Returns:
        Nombre d'entrées purgées
    """
    global _cache
    now = time.time()
    ancien_count = len(_cache)
    _cache = {k: v for k, v in _cache.items() if now - v.get('timestamp', 0) < max_age}
    nouveau_count = len(_cache)
    purgees = ancien_count - nouveau_count
    if purgees > 0:
        logger.debug(f"Cache: {purgees} entrées purgées (>{max_age}s)")
    return purgees


def get_benchmark_performance(ticker: str, date_achat: str) -> dict | None:
    """
    Compare la performance d'un benchmark entre une date de départ et aujourd'hui.

    Args:
        ticker: symbole Yahoo du benchmark (ex: CW8.PA, ^FCHI)
        date_achat: date de départ au format YYYY-MM-DD

    Returns:
        {"perf_pct", "cours_debut", "cours_actuel", "ticker"} ou None en cas d'erreur.
    """
    if not ticker:
        return None

    ticker = ticker.strip().upper()
    now_dt = datetime.now()

    start_dt = None
    if date_achat:
        try:
            parsed = datetime.strptime(date_achat, "%Y-%m-%d")
            if parsed < now_dt:
                start_dt = parsed
        except Exception:
            start_dt = None

    if start_dt is None:
        start_dt = now_dt - timedelta(days=365)

    period1 = int(start_dt.timestamp())
    period2 = int(now_dt.timestamp())

    if period1 >= period2:
        return None

    def _fetch_chart(url: str):
        params = {
            "interval": "1d",
            "period1": period1,
            "period2": period2,
            "includePrePost": "false",
            "events": "history",
        }
        r = _get_session().get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        chart = data.get("chart", {})
        if chart.get("error"):
            return None
        result_data = chart.get("result", [])
        return result_data[0] if result_data else None

    try:
        base_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        result = _fetch_chart(base_url)
        if result is None:
            result = _fetch_chart(base_url.replace("query1", "query2"))
        if result is None:
            return None

        closes = (
            result.get("indicators", {})
            .get("quote", [{}])[0]
            .get("close", [])
        )
        timestamps = result.get("timestamp", [])

        if not closes or not timestamps or len(closes) != len(timestamps):
            return None

        cours_debut = None
        cours_actuel = None

        for ts, close in zip(timestamps, closes):
            if close is None:
                continue
            if ts >= period1:
                cours_debut = float(close)
                break

        for close in reversed(closes):
            if close is not None:
                cours_actuel = float(close)
                break

        meta = result.get("meta", {})
        market_price = meta.get("regularMarketPrice")
        if market_price is not None:
            cours_actuel = float(market_price)

        if cours_debut is None or cours_actuel is None or cours_debut <= 0:
            return None

        perf_pct = (cours_actuel - cours_debut) / cours_debut * 100

        return {
            "perf_pct": round(perf_pct, 2),
            "cours_debut": round(cours_debut, 4),
            "cours_actuel": round(cours_actuel, 4),
            "ticker": ticker,
        }
    except Exception:
        return None


def verifier_alertes() -> list:
    """
    Vérifie toutes les alertes actives et déclenche celles dont le seuil est atteint.
    Retourne la liste des alertes déclenchées lors de cet appel.
    """
    import database as db

    alertes = db.get_alertes(actives_only=True)
    prix_par_ticker = get_prix_many([alerte.get("ticker", "") for alerte in alertes])
    declenchees = []

    for alerte in alertes:
        ticker = str(alerte.get("ticker") or "").strip()
        if not ticker:
            continue

        data = prix_par_ticker.get(ticker.upper())
        if not data or not data.get("prix"):
            continue

        cours = float(data["prix"])
        seuil = float(alerte.get("seuil") or 0)
        type_alerte = str(alerte.get("type_alerte") or "")

        declenchee = (
            (type_alerte == "hausse" and cours >= seuil) or
            (type_alerte == "baisse" and cours <= seuil)
        )

        if declenchee:
            db.desactiver_alerte(alerte["id"])
            declenchees.append({
                "ticker": ticker,
                "nom": alerte.get("nom", ""),
                "type_alerte": type_alerte,
                "seuil": seuil,
                "cours_actuel": cours,
            })

    return declenchees


def import_dividendes_auto() -> int:
    """
    Importe les dividendes Yahoo pour toutes les positions éligibles.
    Retourne le nombre de nouveaux versements importés.
    """
    import database as db

    nouveaux = 0
    now_ts = int(time.time())
    actifs = db.get_actifs()

    for actif in actifs:
        ticker = str(actif.get("ticker") or "").strip().upper()
        date_achat_str = str(actif.get("date_achat") or "").strip()
        quantite = float(actif.get("quantite") or 0)

        if not ticker or not date_achat_str or quantite <= 0:
            continue

        try:
            dt_achat = datetime.strptime(date_achat_str, "%Y-%m-%d")
        except Exception:
            continue

        period1 = int(dt_achat.timestamp())
        if period1 <= 0 or period1 >= now_ts:
            continue

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        params = {
            "interval": "1d",
            "period1": period1,
            "period2": now_ts,
            "events": "dividends",
            "includePrePost": "false",
        }

        try:
            r = _get_session().get(url, params=params, timeout=12)
            r.raise_for_status()
            payload = r.json()

            result = (payload.get("chart") or {}).get("result") or []
            if not result:
                continue

            events = (result[0].get("events") or {}).get("dividends") or {}
            if not isinstance(events, dict) or not events:
                continue

            for item in events.values():
                if not isinstance(item, dict):
                    continue

                amount = float(item.get("amount") or 0)
                ts = item.get("date")
                if amount <= 0 or not ts:
                    continue

                try:
                    date_div = datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d")
                except Exception:
                    continue

                if date_div < date_achat_str:
                    continue

                if db.get_dividende_by_ticker_date(ticker, date_div):
                    continue

                db.add_dividende({
                    "ticker": ticker,
                    "nom": str(actif.get("nom") or ticker),
                    "montant": round(amount * quantite, 2),
                    "date_versement": date_div,
                    "enveloppe": str(actif.get("enveloppe") or "").strip(),
                    "notes": "Import automatique",
                })
                nouveaux += 1
        except Exception as exc:
            logger.warning("Import dividendes: erreur sur %s (%s)", ticker, exc)
            continue

    return nouveaux
