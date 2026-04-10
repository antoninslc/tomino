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

def get_data_dir():
    import sys
    if getattr(sys, 'frozen', False):
        app_data = os.getenv('APPDATA', os.path.expanduser('~'))
        data_dir = os.path.join(app_data, 'Tomino')
        os.makedirs(data_dir, exist_ok=True)
        return data_dir
    return os.path.dirname(os.path.abspath(__file__))

CACHE_FILE = os.path.join(get_data_dir(), "prix_cache.json")


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


_FMP_API_KEY = os.getenv("FMP_API_KEY", "")
_FMP_BASE = "https://financialmodelingprep.com/api/v3"

_COUNTRY_CODES = {
    "FR": "France", "DE": "Germany", "GB": "United Kingdom", "US": "United States",
    "NL": "Netherlands", "CH": "Switzerland", "ES": "Spain", "IT": "Italy",
    "BE": "Belgium", "SE": "Sweden", "DK": "Denmark", "NO": "Norway",
    "FI": "Finland", "PT": "Portugal", "AT": "Austria", "IE": "Ireland",
    "LU": "Luxembourg", "JP": "Japan", "CN": "China", "HK": "Hong Kong",
    "KR": "South Korea", "AU": "Australia", "CA": "Canada", "BR": "Brazil",
    "IN": "India", "TW": "Taiwan", "SG": "Singapore", "ZA": "South Africa",
}


def _fmp_profile(ticker: str) -> dict:
    """Retourne sector + country depuis Financial Modeling Prep."""
    key = _FMP_API_KEY or os.getenv("FMP_API_KEY", "")
    if not key:
        return {}
    try:
        r = _get_session().get(
            f"{_FMP_BASE}/profile/{ticker}",
            params={"apikey": key},
            timeout=8,
        )
        r.raise_for_status()
        data = r.json()
        if not data or not isinstance(data, list):
            return {}
        p = data[0]
        sector = str(p.get("sector") or "").strip()
        raw_country = str(p.get("country") or "").strip().upper()
        country = _COUNTRY_CODES.get(raw_country, raw_country.title()) if raw_country else ""
        result = {}
        if sector:
            result["sector"] = sector
        if country:
            result["country"] = country
        return result
    except Exception:
        return {}


_SECTOR_LABEL = {
    "realestate": "Real Estate",
    "consumer_cyclical": "Consumer Cyclical",
    "basic_materials": "Basic Materials",
    "consumer_defensive": "Consumer Defensive",
    "technology": "Technology",
    "communication_services": "Communication Services",
    "financial_services": "Financial Services",
    "utilities": "Utilities",
    "industrials": "Industrials",
    "energy": "Energy",
    "healthcare": "Healthcare",
}


def _sector_key_to_label(key: str) -> str:
    return _SECTOR_LABEL.get(key.lower(), key.replace("_", " ").title())


def get_info_titre(ticker: str) -> dict:
    """
    Retourne secteur et pays pour un ticker.
    Stratégie :
    1. FMP (Financial Modeling Prep) → sector + country fiables pour les actions EU/US
    2. Yahoo Finance assetProfile → fallback si FMP absent ou vide
    3. Yahoo Finance topHoldings → sector_weights pour les ETFs (pas de sector dans assetProfile)
    Cache 24h.
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

    info = {}

    # 1. FMP pour sector + country (actions)
    fmp = _fmp_profile(ticker)
    if fmp.get("sector"):
        info["sector"] = fmp["sector"]
    if fmp.get("country"):
        info["country"] = fmp["country"]

    # 2. Yahoo Finance si FMP n'a pas tout renseigné
    if not info.get("sector") or not info.get("country"):
        try:
            url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
            r = _get_session().get(url, params={"modules": "assetProfile,summaryProfile,topHoldings"}, timeout=8)
            r.raise_for_status()
            result_list = r.json().get("quoteSummary", {}).get("result") or []
            if result_list:
                info_block = result_list[0]
                profile = info_block.get("assetProfile") or info_block.get("summaryProfile") or {}

                if not info.get("sector"):
                    sector = str(profile.get("sector") or "").strip()
                    if sector:
                        info["sector"] = sector

                if not info.get("country"):
                    country = str(profile.get("country") or "").strip()
                    if country:
                        info["country"] = country

                # ETFs : pas de sector → chercher dans topHoldings.sectorWeightings
                if not info.get("sector"):
                    top = info_block.get("topHoldings") or {}
                    raw_weights = top.get("sectorWeightings") or []
                    weights = {}
                    for item in raw_weights:
                        for k, v in item.items():
                            label = _sector_key_to_label(k)
                            if label and isinstance(v, (int, float)) and v > 0:
                                weights[label] = round(float(v), 4)
                    if weights:
                        info["sector_weights"] = weights
        except Exception:
            pass

    # Ne pas mettre en cache un résultat vide — on réessaiera au prochain appel
    if info:
        _set_cache_entries({cache_key: {"timestamp": now, "value": info}})
    return info


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
    with _cache_lock:
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


def get_calendrier_dividendes(ticker_qty_map: dict) -> list:
    """
    Retourne les prochains versements de dividendes (6 mois) pour les tickers du portefeuille.
    ticker_qty_map: {TICKER: quantite_totale}
    Source primaire : FMP dividend calendar (1 seul appel).
    Fallback : Yahoo Finance defaultKeyStatistics / summaryDetail.
    """
    import datetime as dt_mod

    if not ticker_qty_map:
        return []

    today = dt_mod.date.today()
    end = today + dt_mod.timedelta(days=180)
    api_key = os.getenv("FMP_API_KEY", "")
    results = []
    found_tickers = set()

    # 1. FMP dividend calendar
    if api_key:
        try:
            url = f"https://financialmodelingprep.com/api/v3/stock_dividend_calendar"
            params = {
                "from": today.isoformat(),
                "to": end.isoformat(),
                "apikey": api_key,
            }
            r = _get_session().get(url, params=params, timeout=15)
            if r.ok:
                data = r.json()
                if isinstance(data, list):
                    tickers_upper = {t.upper() for t in ticker_qty_map}
                    for item in data:
                        sym = str(item.get("symbol") or "").upper()
                        if sym not in tickers_upper:
                            continue
                        qty = ticker_qty_map.get(sym, 0)
                        div_action = _safe_float(item.get("dividend"))
                        montant_estime = round(div_action * qty, 2) if div_action and qty else None
                        results.append({
                            "ticker": sym,
                            "ex_date": item.get("date") or "",
                            "payment_date": item.get("paymentDate") or "",
                            "record_date": item.get("recordDate") or "",
                            "dividende_action": div_action,
                            "quantite": qty,
                            "montant_estime": montant_estime,
                        })
                        found_tickers.add(sym)
        except Exception as e:
            logger.warning("get_calendrier_dividendes FMP: %s", e)

    # 2. Yahoo Finance fallback pour les tickers absents de FMP
    missing = [t for t in ticker_qty_map if t.upper() not in found_tickers]
    for ticker in missing:
        try:
            url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
            r = _get_session().get(url, params={"modules": "defaultKeyStatistics,summaryDetail"}, timeout=8)
            if not r.ok:
                continue
            result_list = (r.json().get("quoteSummary") or {}).get("result") or []
            if not result_list:
                continue
            stats = result_list[0].get("defaultKeyStatistics") or {}
            summary = result_list[0].get("summaryDetail") or {}

            ex_raw = (stats.get("exDividendDate") or {}).get("raw") or (summary.get("exDividendDate") or {}).get("raw")
            div_rate = _safe_float((summary.get("dividendRate") or {}).get("raw"))
            div_freq = int((summary.get("dividendFrequency") or {}).get("raw") or 4)

            if not ex_raw:
                continue
            ex_date_obj = dt_mod.date.fromtimestamp(int(ex_raw))
            if ex_date_obj < today or ex_date_obj > end:
                continue

            div_action = round(div_rate / div_freq, 4) if div_rate and div_freq else None
            qty = ticker_qty_map.get(ticker, 0)
            montant_estime = round(div_action * qty, 2) if div_action and qty else None

            results.append({
                "ticker": ticker.upper(),
                "ex_date": ex_date_obj.isoformat(),
                "payment_date": "",
                "record_date": "",
                "dividende_action": div_action,
                "quantite": qty,
                "montant_estime": montant_estime,
            })
        except Exception as e:
            logger.debug("get_calendrier_dividendes Yahoo(%s): %s", ticker, e)

    results.sort(key=lambda x: x.get("ex_date") or "")
    return results


# ── STOCK PICKING ──────────────────────────────────────────

# Correspondance suffixes Yahoo Finance → Alpha Vantage
_AV_SUFFIX_MAP = {
    ".PA": ".PAR",   # Euronext Paris
    ".BR": ".BRU",   # Euronext Bruxelles
    ".AS": ".AMS",   # Euronext Amsterdam
    ".L":  ".LON",   # London Stock Exchange
    ".DE": ".FRK",   # Francfort (XETRA)
    ".MI": ".MIL",   # Borsa Italiana
    ".MC": ".MCE",   # Madrid
    ".ST": ".STO",   # Stockholm
    ".HE": ".HEL",   # Helsinki
    ".OL": ".OSL",   # Oslo
    ".CO": ".CPH",   # Copenhague
    ".SW": ".SWX",   # Swiss Exchange
    ".TO": ".TRT",   # Toronto
    ".AX": ".ASX",   # ASX Australia
}

def _yahoo_to_av(ticker: str) -> str:
    """Convertit un ticker Yahoo Finance au format Alpha Vantage."""
    for ysfx, avsfx in _AV_SUFFIX_MAP.items():
        if ticker.endswith(ysfx):
            return ticker[:-len(ysfx)] + avsfx
    return ticker


def get_stock_fundamentals_av(ticker: str, av_key: str) -> dict:
    """
    Récupère les données fondamentales via Alpha Vantage (OVERVIEW + GLOBAL_QUOTE).
    Retourne {} si la clé est invalide, le ticker introuvable ou le quota dépassé.
    """
    av_ticker = _yahoo_to_av(ticker)
    base_url = "https://www.alphavantage.co/query"

    def _av(function: str) -> dict:
        try:
            r = _get_session().get(
                base_url,
                params={"function": function, "symbol": av_ticker, "apikey": av_key},
                timeout=14,
            )
            if not r.ok:
                return {}
            data = r.json()
            if "Information" in data or "Note" in data:
                logger.warning("Alpha Vantage quota/erreur (%s): %s", function,
                               data.get("Information") or data.get("Note"))
                return {}
            return data
        except Exception as e:
            logger.debug("Alpha Vantage %s %s: %s", function, av_ticker, e)
            return {}

    overview = _av("OVERVIEW")
    if not overview or not overview.get("Name"):
        return {}

    quote_raw = _av("GLOBAL_QUOTE").get("Global Quote", {})

    def sf(key, src=overview):
        return _safe_float(src.get(key))

    # Cours et variation
    cours = sf("05. price", quote_raw)
    prev  = sf("08. previous close", quote_raw)
    change_str = (quote_raw.get("10. change percent") or "").replace("%", "").strip()
    variation  = _safe_float(change_str)

    # Marge brute estimée depuis GrossProfitTTM / RevenueTTM
    gross  = sf("GrossProfitTTM")
    rev    = sf("RevenueTTM")
    marge_brute = round(gross / rev, 4) if gross and rev and rev != 0 else None

    # Consensus analystes
    sb = int(sf("AnalystRatingStrongBuy")  or 0)
    bu = int(sf("AnalystRatingBuy")        or 0)
    ho = int(sf("AnalystRatingHold")       or 0)
    se = int(sf("AnalystRatingSell")       or 0)
    ss = int(sf("AnalystRatingStrongSell") or 0)
    total = sb + bu + ho + se + ss
    consensus = {"strong_buy": sb, "buy": bu, "hold": ho,
                 "sell": se, "strong_sell": ss, "total": total} if total else None

    # Clé de recommandation dérivée du score pondéré
    reco = ""
    if total:
        score = (sb * 5 + bu * 4 + ho * 3 + se * 2 + ss * 1) / total
        if score >= 4.5:   reco = "strong_buy"
        elif score >= 3.5: reco = "buy"
        elif score >= 2.5: reco = "hold"
        elif score >= 1.5: reco = "sell"
        else:              reco = "strong_sell"

    return {
        "ticker":              ticker,
        "nom":                 overview.get("Name") or ticker,
        "nom_court":           overview.get("Name") or ticker,
        "devise":              overview.get("Currency", "USD"),
        "exchange":            overview.get("Exchange", ""),
        "secteur":             overview.get("Sector", ""),
        "industrie":           overview.get("Industry", ""),
        "pays":                overview.get("Country", ""),
        "description":         overview.get("Description", ""),
        "site":                overview.get("OfficialSite", ""),
        "cours":               cours,
        "variation_jour":      variation,
        "cours_52w_haut":      sf("52WeekHigh"),
        "cours_52w_bas":       sf("52WeekLow"),
        "capitalisation":      sf("MarketCapitalization"),
        "volume_moyen":        sf("200DayMovingAverage"),
        "beta":                sf("Beta"),
        "pe_trailing":         sf("TrailingPE"),
        "pe_forward":          sf("ForwardPE"),
        "peg":                 sf("PEGRatio"),
        "pb":                  sf("PriceToBookRatio"),
        "ps":                  sf("PriceToSalesRatioTTM"),
        "ev_ebitda":           sf("EVToEBITDA"),
        "ev":                  None,
        "rendement_div":       sf("DividendYield"),
        "taux_distribution":   sf("PayoutRatio"),
        "dividende_par_action":sf("DividendPerShare"),
        "marge_brute":         marge_brute,
        "marge_operationnelle":sf("OperatingMarginTTM"),
        "marge_nette":         sf("ProfitMargin"),
        "roe":                 sf("ReturnOnEquityTTM"),
        "roa":                 sf("ReturnOnAssetsTTM"),
        "dette_capitaux":      None,
        "current_ratio":       None,
        "quick_ratio":         None,
        "croissance_ca":       sf("QuarterlyRevenueGrowthYOY"),
        "croissance_benefices":sf("QuarterlyEarningsGrowthYOY"),
        "ca_ttm":              sf("RevenueTTM"),
        "ebitda":              sf("EBITDA"),
        "objectif_moyen":      sf("AnalystTargetPrice"),
        "objectif_haut":       None,
        "objectif_bas":        None,
        "recommandation":      reco,
        "nb_analystes":        total,
        "consensus":           consensus,
    }

import re as _re

_PRIMARY_EXCHANGES = {"NMS", "NGM", "NCM", "NYQ", "AMX", "PA", "L", "AS", "DE", "MI", "SW", "VX", "MC", "BR", "CO", "ST", "HE", "OL", "LS", "TYO", "HKG", "SHH", "SHZ"}
_REGIONAL_EXCHANGES = {"HM", "MU", "F", "BE", "DU", "SG", "HAN", "VI", "MX", "BA", "PCX"}
_ISIN_TICKER = _re.compile(r'^[A-Z]{2}[A-Z0-9]{9,11}\.[A-Z]+$')
_ALLOWED_TYPES = {"EQUITY", "ETF", "MUTUALFUND"}


_NORMALIZE_SUFFIXES = (
    " se", " sa", " ag", " plc", " inc", " corp", " ltd", " llc",
    " nv", " bv", " ab", " asa", " oyj", " spa",
    " group", " holding", " holdings",
    " ucits", " ucit", " uci", " etf", " etc", " fund", " trust", " pea",
    " a", " b", " c",  # classes d'actions (Airbus SE A, etc.)
)

def _normalize_company_name(name: str) -> str:
    n = name.lower().strip()
    # Boucle jusqu'à stabilisation — nécessaire pour les cas comme
    # "Airbus SE A" → strip " a" → "airbus se" → strip " se" → "airbus"
    prev = None
    while prev != n:
        prev = n
        for suffix in _NORMALIZE_SUFFIXES:
            if n.endswith(suffix):
                n = n[:-len(suffix)].strip()
    return n


def _exc_rank(exc: str) -> int:
    """Priorité d'exchange : plus bas = meilleur. Primary EU/US > autres connus > inconnu > régional."""
    if exc in _PRIMARY_EXCHANGES:
        return 0
    if exc in _REGIONAL_EXCHANGES:
        return 2
    return 1  # inconnu (CXE, etc.) : entre les deux


def _dedup_search(results: list, name_key: str = "nom", exchange_key: str = "exchange") -> list:
    seen: dict = {}
    out: list = []
    for item in results:
        key = _normalize_company_name(str(item.get(name_key) or ""))
        if not key:
            out.append(item)
            continue
        exc = str(item.get(exchange_key) or "")
        if key not in seen:
            seen[key] = len(out)
            out.append(item)
        elif _exc_rank(exc) < _exc_rank(str(out[seen[key]].get(exchange_key) or "")):
            # Le nouvel item a un exchange de meilleure priorité → remplace
            out[seen[key]] = item
    return out


def search_tickers(query: str) -> list:
    """Autocomplete ticker via Yahoo Finance search."""
    if not query or len(query.strip()) < 1:
        return []
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": query.strip(), "quotesCount": 15, "newsCount": 0, "enableFuzzyQuery": False}
        r = _get_session().get(url, params=params, timeout=6)
        r.raise_for_status()
        quotes = r.json().get("quotes", [])
        results = []
        for q in quotes:
            ticker = q.get("symbol", "")
            if not ticker:
                continue
            if _ISIN_TICKER.match(ticker):
                continue
            if q.get("quoteType", "").upper() not in _ALLOWED_TYPES:
                continue
            raw_name = q.get("shortname") or q.get("longname") or ticker
            results.append({
                "ticker": ticker,
                "nom": raw_name.split('\t')[0].strip(),
                "type": q.get("quoteType", ""),
                "exchange": q.get("exchange", ""),
            })
        results = _dedup_search(results)
        return results[:8]
    except Exception as e:
        logger.warning("search_tickers(%s): %s", query, e)
        return []


def _safe_float(val):
    try:
        v = float(val)
        return None if (v != v) else v  # NaN check
    except Exception:
        return None


# ── Crumb Yahoo Finance (requis depuis 2024 pour quoteSummary) ─
_crumb_value: str = ""
_crumb_ts: float = 0.0
_crumb_lock = threading.Lock()

def _get_crumb() -> str:
    global _crumb_value, _crumb_ts
    now = time.time()
    with _crumb_lock:
        if _crumb_value and now - _crumb_ts < 3600:
            return _crumb_value
    try:
        session = _get_session()
        # Step 1 : cookie "B" de base (contourne le GDPR/consent côté EU)
        try:
            session.get("https://fc.yahoo.com", timeout=8)
        except Exception:
            pass
        # Step 2 : cookie A1 via finance.yahoo.com
        session.get("https://finance.yahoo.com", timeout=8)
        # Step 3 : crumb
        r = session.get("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=8)
        crumb = r.text.strip() if r.ok else ""
        # Un crumb valide est une courte chaîne alphanumérique, pas un JSON d'erreur
        if crumb and not crumb.startswith("{") and len(crumb) < 50:
            with _crumb_lock:
                _crumb_value = crumb
                _crumb_ts = now
            return _crumb_value
        logger.debug("_get_crumb: réponse invalide: %s", crumb[:80] if crumb else "(vide)")
    except Exception as e:
        logger.debug("_get_crumb: %s", e)
    return ""


def _fetch_quote_summary(ticker: str, modules: list) -> dict:
    """Appelle quoteSummary pour un ensemble de modules. Retourne le bloc result[0] ou {}."""
    crumb = _get_crumb()
    for host in ("query2", "query1"):
        try:
            url = f"https://{host}.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
            params = {"modules": ",".join(modules)}
            if crumb:
                params["crumb"] = crumb
            r = _get_session().get(url, params=params, timeout=12)
            if not r.ok:
                logger.debug("_fetch_quote_summary %s %s: HTTP %s", host, ticker, r.status_code)
                continue
            results = r.json().get("quoteSummary", {}).get("result") or []
            if results:
                return results[0]
        except Exception as e:
            logger.debug("_fetch_quote_summary %s %s: %s", host, ticker, e)
    return {}


def get_stock_fundamentals(ticker: str, force: bool = False) -> dict:
    """
    Récupère les données fondamentales via yfinance.
    Fallback v8/chart si yfinance échoue (données limitées).
    """
    import yfinance as yf

    ticker = str(ticker).strip().upper()
    cache_key = f"fundamentals_{ticker}"
    now = time.time()

    if not force:
        with _cache_lock:
            entry = _cache.get(cache_key)
            if isinstance(entry, dict) and now - entry.get("timestamp", 0) < 900:
                return dict(entry.get("value", {}))

    # ── yfinance ────────────────────────────────────────────
    try:
        info = yf.Ticker(ticker).info
        cours = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        if not cours:
            raise ValueError("pas de cours")

        prev = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        # Stocker en décimal (0.018 = 1.8%) pour compatibilité avec pct() côté frontend
        chg = _safe_float(info.get("regularMarketChangePercent"))
        if chg is not None:
            variation = round(chg / 100, 4)
        elif prev and prev != 0:
            variation = round((cours - prev) / prev, 4)
        else:
            variation = None

        # Consensus analystes depuis recommendationMean
        reco_key = str(info.get("recommendationKey") or "").lower()
        nb_analystes = int(info.get("numberOfAnalystOpinions") or 0)

        # ── Ratios avancés calculés depuis le bilan ──────────────
        ticker_obj = yf.Ticker(ticker)

        # FCF TTM et actions en circulation
        fcf_ttm = _safe_float(info.get("freeCashflow"))
        shares = _safe_float(info.get("sharesOutstanding"))
        mktcap = _safe_float(info.get("marketCap"))

        # Price/FCF
        price_fcf = round(mktcap / fcf_ttm, 2) if (mktcap and fcf_ttm and fcf_ttm > 0) else None
        # FCF par action
        fcf_par_action = round(fcf_ttm / shares, 4) if (fcf_ttm and shares and shares > 0) else None

        # Dette nette / EBITDA
        ebitda_val = _safe_float(info.get("ebitda"))
        total_debt = _safe_float(info.get("totalDebt"))
        cash = _safe_float(info.get("totalCash"))
        dette_nette = None
        dette_nette_ebitda = None
        if total_debt is not None and cash is not None:
            dette_nette = total_debt - cash
        if dette_nette is not None and ebitda_val and ebitda_val != 0:
            dette_nette_ebitda = round(dette_nette / ebitda_val, 2)

        # ROIC = NOPAT / Invested Capital
        # NOPAT = EBIT × (1 - taux_impot)  |  Invested Capital = Total Actifs - Actifs Courants + Liquidités
        roic = None
        try:
            bs = None
            for attr in ("balance_sheet", "quarterly_balance_sheet"):
                f = getattr(ticker_obj, attr, None)
                if f is not None and not f.empty:
                    bs = f
                    break

            if bs is not None:
                def bs_val(*keys):
                    for k in keys:
                        if k in bs.index:
                            v = _safe_float(bs.iloc[bs.index.get_loc(k), 0])
                            if v is not None:
                                return v
                    return None

                total_assets     = bs_val("Total Assets")
                current_assets   = bs_val("Current Assets")
                current_liab     = bs_val("Current Liabilities")
                cash_bs          = bs_val("Cash And Cash Equivalents", "Cash")
                ebit_val         = _safe_float(info.get("ebitda")) # approximation si EBIT absent
                # Invested Capital = Total Assets - Current Liabilities - Cash
                if total_assets and current_liab is not None and cash_bs is not None:
                    invested_capital = total_assets - current_liab - cash_bs
                    if invested_capital > 0:
                        # NOPAT ≈ Résultat opérationnel × (1 - 0.25)
                        ebit_approx = _safe_float(info.get("operatingCashflow")) or ebitda_val
                        if ebit_approx:
                            nopat = ebit_approx * 0.75  # taux implicite 25%
                            roic = round(nopat / invested_capital, 4)
        except Exception:
            roic = None

        # ── Altman Z-Score (version originale non-financières) ──
        # Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
        # X1 = (Actifs courants - Passifs courants) / Total actifs
        # X2 = Résultats non distribués / Total actifs
        # X3 = EBIT / Total actifs
        # X4 = Valeur marché CP / Total dettes
        # X5 = CA / Total actifs
        altman_z = None
        try:
            bs2 = bs if bs is not None else None
            if bs2 is not None:
                def bsv(*keys):
                    for k in keys:
                        if k in bs2.index:
                            v = _safe_float(bs2.iloc[bs2.index.get_loc(k), 0])
                            if v is not None:
                                return v
                    return None

                ta = bsv("Total Assets")
                ca2 = bsv("Current Assets")
                cl = bsv("Current Liabilities")
                re = bsv("Retained Earnings")
                td2 = bsv("Total Debt", "Long Term Debt")
                rev_val = _safe_float(info.get("totalRevenue"))
                ebit_z = ebitda_val  # approximation

                if ta and ta > 0 and ca2 and cl and ebit_z and rev_val and mktcap:
                    x1 = (ca2 - cl) / ta
                    x2 = (re / ta) if re else 0
                    x3 = ebit_z / ta
                    x4 = mktcap / td2 if (td2 and td2 > 0) else 0
                    x5 = rev_val / ta
                    altman_z = round(1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5, 2)
        except Exception:
            altman_z = None

        data = {
            "ticker": ticker,
            "nom": info.get("longName") or info.get("shortName") or ticker,
            "nom_court": info.get("shortName") or ticker,
            "devise": info.get("currency", "EUR"),
            "exchange": info.get("exchange") or info.get("fullExchangeName") or "",
            "secteur": info.get("sector", ""),
            "industrie": info.get("industry", ""),
            "pays": info.get("country", ""),
            "description": info.get("longBusinessSummary", ""),
            "site": info.get("website", ""),
            "cours": cours,
            "variation_jour": variation,
            "cours_52w_haut": _safe_float(info.get("fiftyTwoWeekHigh")),
            "cours_52w_bas": _safe_float(info.get("fiftyTwoWeekLow")),
            "capitalisation": mktcap,
            "volume_moyen": _safe_float(info.get("averageVolume")),
            "beta": _safe_float(info.get("beta")),
            "shares": shares,
            "pe_trailing": _safe_float(info.get("trailingPE")),
            "pe_forward": _safe_float(info.get("forwardPE")),
            "peg": _safe_float(info.get("pegRatio") or info.get("trailingPegRatio")),
            "pb": _safe_float(info.get("priceToBook")),
            "ps": _safe_float(info.get("priceToSalesTrailing12Months")),
            "ev_ebitda": _safe_float(info.get("enterpriseToEbitda")),
            "ev": _safe_float(info.get("enterpriseValue")),
            "price_fcf": price_fcf,
            "fcf_ttm": fcf_ttm,
            "fcf_par_action": fcf_par_action,
            "rendement_div": _safe_float(info.get("dividendYield")),
            "taux_distribution": _safe_float(info.get("payoutRatio")),
            "dividende_par_action": _safe_float(info.get("dividendRate")),
            "marge_brute": _safe_float(info.get("grossMargins")),
            "marge_operationnelle": _safe_float(info.get("operatingMargins")),
            "marge_nette": _safe_float(info.get("profitMargins")),
            "roe": _safe_float(info.get("returnOnEquity")),
            "roa": _safe_float(info.get("returnOnAssets")),
            "roic": roic,
            "dette_capitaux": _safe_float(info.get("debtToEquity")),
            "dette_nette": dette_nette,
            "dette_nette_ebitda": dette_nette_ebitda,
            "current_ratio": _safe_float(info.get("currentRatio")),
            "quick_ratio": _safe_float(info.get("quickRatio")),
            "croissance_ca": _safe_float(info.get("revenueGrowth")),
            "croissance_benefices": _safe_float(info.get("earningsGrowth")),
            "ca_ttm": _safe_float(info.get("totalRevenue")),
            "ebitda": ebitda_val,
            "total_debt": total_debt,
            "total_cash": cash,
            "altman_z": altman_z,
            "objectif_moyen": _safe_float(info.get("targetMeanPrice")),
            "objectif_haut": _safe_float(info.get("targetHighPrice")),
            "objectif_bas": _safe_float(info.get("targetLowPrice")),
            "recommandation": reco_key,
            "nb_analystes": nb_analystes,
            "consensus": None,  # yfinance ne donne pas le détail par catégorie
        }

        with _cache_lock:
            _cache[cache_key] = {"timestamp": now, "value": data}
        return data

    except Exception as e:
        logger.warning("get_stock_fundamentals(%s): yfinance échoué (%s), fallback chart", ticker, e)

    # ── Fallback v8/chart ────────────────────────────────────
    try:
        chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        r = _get_session().get(chart_url, params={"interval": "1d", "range": "1d", "includePrePost": "false"}, timeout=10)
        if not r.ok:
            r = _get_session().get(chart_url.replace("query1", "query2"), params={"interval": "1d", "range": "1d"}, timeout=10)
        meta = (r.json().get("chart") or {}).get("result", [{}])[0].get("meta", {}) if r.ok else {}
    except Exception:
        meta = {}

    if not meta.get("regularMarketPrice"):
        return {}

    prev = _safe_float(meta.get("chartPreviousClose") or meta.get("previousClose"))
    cur  = _safe_float(meta.get("regularMarketPrice"))
    var  = round((cur - prev) / prev * 100, 2) if prev and cur else None

    data = {
        "ticker": ticker,
        "nom": meta.get("longName") or meta.get("shortName") or ticker,
        "nom_court": meta.get("shortName") or ticker,
        "devise": meta.get("currency", "EUR"),
        "exchange": meta.get("exchangeName", ""),
        "secteur": "", "industrie": "", "pays": "", "description": "", "site": "",
        "cours": cur, "variation_jour": var,
        "cours_52w_haut": _safe_float(meta.get("fiftyTwoWeekHigh")),
        "cours_52w_bas":  _safe_float(meta.get("fiftyTwoWeekLow")),
        "capitalisation": None, "volume_moyen": None, "beta": None,
        "pe_trailing": None, "pe_forward": None, "peg": None, "pb": None,
        "ps": None, "ev_ebitda": None, "ev": None,
        "rendement_div": None, "taux_distribution": None, "dividende_par_action": None,
        "marge_brute": None, "marge_operationnelle": None, "marge_nette": None,
        "roe": None, "roa": None, "dette_capitaux": None,
        "current_ratio": None, "quick_ratio": None,
        "croissance_ca": None, "croissance_benefices": None,
        "ca_ttm": None, "ebitda": None,
        "objectif_moyen": None, "objectif_haut": None, "objectif_bas": None,
        "recommandation": "", "nb_analystes": 0, "consensus": None,
        "source_limitee": True,
    }
    with _cache_lock:
        _cache[cache_key] = {"timestamp": now, "value": data}
    return data


def get_stock_history(ticker: str) -> dict:
    """
    Historique financier annuel sur 5 ans : CA, résultat net, FCF, marges, BPA.
    Source : yfinance income_stmt + cashflow.
    Cache 1h.
    """
    import yfinance as yf

    ticker = str(ticker).strip().upper()
    cache_key = f"history_{ticker}"
    now = time.time()

    with _cache_lock:
        entry = _cache.get(cache_key)
        if isinstance(entry, dict) and now - entry.get("timestamp", 0) < 3600:
            return dict(entry.get("value", {}))

    try:
        t = yf.Ticker(ticker)

        fin = None
        for attr in ("income_stmt", "financials"):
            try:
                f = getattr(t, attr, None)
                if f is not None and not f.empty:
                    fin = f
                    break
            except Exception:
                pass

        cf = None
        for attr in ("cashflow", "cash_flow"):
            try:
                f = getattr(t, attr, None)
                if f is not None and not f.empty:
                    cf = f
                    break
            except Exception:
                pass

        if fin is None:
            return {}

        dates = list(fin.columns[:5])  # plus récent en premier

        def get_row(df, *keys):
            if df is None or df.empty:
                return {}
            for k in keys:
                try:
                    if k in df.index:
                        return dict(df.loc[k])
                except Exception:
                    pass
            return {}

        revenue   = get_row(fin, "Total Revenue")
        net_inc   = get_row(fin, "Net Income")
        gross_prf = get_row(fin, "Gross Profit")
        ebit      = get_row(fin, "EBIT", "Operating Income")
        eps       = get_row(fin, "Basic EPS", "Diluted EPS")
        ocf_row   = get_row(cf, "Operating Cash Flow") if cf is not None else {}
        capex_row = get_row(cf, "Capital Expenditure") if cf is not None else {}

        annees, ca_l, rnet_l, bpa_l = [], [], [], []
        ocf_l, fcf_l, capex_l = [], [], []
        mn_l, mo_l, mb_l = [], [], []

        for d in reversed(dates):
            rev = _safe_float(revenue.get(d))
            net = _safe_float(net_inc.get(d))
            gp  = _safe_float(gross_prf.get(d))
            op  = _safe_float(ebit.get(d))
            e   = _safe_float(eps.get(d))
            o   = _safe_float(ocf_row.get(d))
            cap = _safe_float(capex_row.get(d))
            # capex est négatif dans yfinance → FCF = OCF + capex
            fcf = (o + cap) if (o is not None and cap is not None) else o

            annees.append(str(d.year))
            ca_l.append(rev)
            rnet_l.append(net)
            bpa_l.append(e)
            ocf_l.append(o)
            fcf_l.append(fcf)
            capex_l.append(abs(cap) if cap is not None else None)
            mn_l.append(round(net / rev, 4) if rev and net is not None else None)
            mo_l.append(round(op  / rev, 4) if rev and op  is not None else None)
            mb_l.append(round(gp  / rev, 4) if rev and gp  is not None else None)

        result = {
            "annees": annees,
            "ca": ca_l,
            "resultat_net": rnet_l,
            "bpa": bpa_l,
            "ocf": ocf_l,
            "fcf": fcf_l,
            "capex": capex_l,
            "marge_nette": mn_l,
            "marge_operationnelle": mo_l,
            "marge_brute": mb_l,
        }

        with _cache_lock:
            _cache[cache_key] = {"timestamp": now, "value": result}
        return result

    except Exception as e:
        logger.warning("get_stock_history(%s): %s", ticker, e)
        return {}


# ── HISTORIQUE RÉTROACTIF ─────────────────────────────────

def _fetch_historique_ticker(ticker: str, start_ts: int, end_ts: int) -> dict[str, float]:
    """
    Récupère les clôtures journalières d'un ticker via Yahoo Finance v8.
    Retourne {date_str: close_price} avec forward-fill sur les jours sans cotation.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {
        "interval": "1d",
        "period1": start_ts,
        "period2": end_ts,
        "includePrePost": "false",
        "events": "div,splits",
    }

    def _call(u):
        r = _get_session().get(u, params=params, timeout=20)
        r.raise_for_status()
        d = r.json()
        if d.get("chart", {}).get("error"):
            return None
        res = d["chart"]["result"]
        return res[0] if res else None

    try:
        result = _call(url)
        if result is None:
            result = _call(url.replace("query1", "query2"))
        if result is None:
            return {}

        timestamps = result.get("timestamp", [])
        closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        if not timestamps or not closes:
            return {}

        # Construire le dict date → close (ignorer les None)
        raw = {}
        for ts, c in zip(timestamps, closes):
            if c is not None:
                day = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                raw[day] = float(c)

        if not raw:
            return {}

        # Forward-fill : pour chaque jour calendaire entre min et max,
        # utiliser le dernier cours connu
        sorted_dates = sorted(raw)
        start_d = datetime.strptime(sorted_dates[0], "%Y-%m-%d").date()
        end_d = datetime.utcfromtimestamp(end_ts).date()
        filled = {}
        last = None
        cur = start_d
        while cur <= end_d:
            s = cur.strftime("%Y-%m-%d")
            if s in raw:
                last = raw[s]
            if last is not None:
                filled[s] = last
            cur += timedelta(days=1)

        return filled

    except Exception as e:
        logger.warning("_fetch_historique_ticker(%s): %s", ticker, e)
        return {}


def reconstruire_historique_portfolio(mouvements_par_ticker: dict) -> list[dict]:
    """
    Reconstruit l'historique journalier du patrimoine actions/or.

    Args:
        mouvements_par_ticker: {
            "AAPL": {
                "enveloppe": "PEA"|"CTO"|"OR",
                "mouvements": [
                    {"type_operation": "achat"|"vente"|"snapshot",
                     "date_operation": "YYYY-MM-DD",
                     "quantite": float,
                     "prix_unitaire": float},
                    ...
                ]
            }, ...
        }

    Returns:
        Liste triée de dicts {date, valeur_pea, valeur_cto, valeur_or, valeur_investie}.
        valeur_totale n'est PAS incluse (calculée dans upsert_historique_retroactif
        pour préserver les données livrets/AV existantes).
    """
    if not mouvements_par_ticker:
        return []

    # Trouver la date de début (premier mouvement)
    all_op_dates = [
        m["date_operation"]
        for info in mouvements_par_ticker.values()
        for m in info["mouvements"]
        if m.get("date_operation")
    ]
    if not all_op_dates:
        return []

    start_str = min(all_op_dates)
    today = datetime.utcnow().date()
    start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
    start_ts = int(datetime(start_d.year, start_d.month, start_d.day).timestamp())
    end_ts = int(datetime(today.year, today.month, today.day, 23, 59, 59).timestamp())

    # Fetch des historiques en parallèle
    prix_hist: dict[str, dict[str, float]] = {}

    def _fetch_one(ticker):
        return ticker, _fetch_historique_ticker(ticker, start_ts, end_ts)

    with ThreadPoolExecutor(max_workers=min(8, len(mouvements_par_ticker))) as ex:
        futures = {ex.submit(_fetch_one, t): t for t in mouvements_par_ticker}
        for fut in as_completed(futures):
            try:
                ticker, hist = fut.result()
                if hist:
                    prix_hist[ticker] = hist
            except Exception as e:
                logger.warning("reconstruire_historique_portfolio fetch: %s", e)

    if not prix_hist:
        return []

    # Générer tous les jours calendaires depuis start jusqu'à aujourd'hui
    result = []
    cur = start_d
    while cur <= today:
        day_str = cur.strftime("%Y-%m-%d")
        cur += timedelta(days=1)

        valeur_pea = 0.0
        valeur_cto = 0.0
        valeur_or = 0.0
        investie_pea = 0.0
        investie_cto = 0.0
        investie_or = 0.0
        has_position = False

        for ticker, info in mouvements_par_ticker.items():
            if ticker not in prix_hist:
                continue

            # Calcul qty + cost_basis à cette date (mouvements déjà triés par date_operation)
            qty = 0.0
            cost_basis = 0.0
            for m in info["mouvements"]:
                if (m.get("date_operation") or "") > day_str:
                    break
                q = float(m.get("quantite") or 0)
                p = float(m.get("prix_unitaire") or 0)
                op = m.get("type_operation", "")
                if op in ("achat", "snapshot"):
                    cost_basis += q * p
                    qty += q
                elif op == "vente":
                    if qty > 0:
                        cost_basis *= (qty - q) / qty  # réduction proportionnelle
                    qty -= q
                    qty = max(qty, 0.0)

            if qty <= 0:
                continue

            cours = prix_hist[ticker].get(day_str)
            if cours is None:
                continue

            valeur = round(qty * cours, 4)
            env = info.get("enveloppe", "")
            if env == "PEA":
                valeur_pea += valeur
                investie_pea += cost_basis
            elif env == "CTO":
                valeur_cto += valeur
                investie_cto += cost_basis
            elif env == "OR":
                valeur_or += valeur
                investie_or += cost_basis

            has_position = True

        if has_position:
            result.append({
                "date": day_str,
                "valeur_pea": round(valeur_pea, 2),
                "valeur_cto": round(valeur_cto, 2),
                "valeur_or": round(valeur_or, 2),
                "investie_pea": round(investie_pea, 2),
                "investie_cto": round(investie_cto, 2),
                "investie_or": round(investie_or, 2),
                "valeur_investie": round(investie_pea + investie_cto + investie_or, 2),
            })

    logger.info("reconstruire_historique_portfolio: %d points générés", len(result))
    return result
