import threading
import time
import requests

BASE_URL = "https://api.coingecko.com/api/v3"

_cache_lock = threading.Lock()
_cache: dict = {}
CACHE_TTL = 60

_session = requests.Session()
_session.headers.update({"User-Agent": "Tomino/1.0"})


def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
        return None


def _cache_set(key, data):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": time.time()}


def search_coins(query: str) -> list:
    """GET /search?query={query} — returns list of {id, nom, symbol, thumb} (max 10)."""
    key = f"search:{query.lower()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        resp = _session.get(f"{BASE_URL}/search", params={"query": query}, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for coin in (data.get("coins") or [])[:10]:
            results.append({
                "id": coin.get("id", ""),
                "nom": coin.get("name", ""),
                "symbol": coin.get("symbol", ""),
                "thumb": coin.get("thumb", ""),
            })
        _cache_set(key, results)
        return results
    except Exception:
        return []


def get_prix_many(coin_ids: list, vs_currency="eur") -> dict:
    """GET /simple/price — returns {coin_id: {prix, variation_24h, market_cap}}."""
    if not coin_ids:
        return {}
    sorted_ids = sorted(set(coin_ids))
    key = f"prices:{','.join(sorted_ids)}:{vs_currency}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        resp = _session.get(
            f"{BASE_URL}/simple/price",
            params={
                "ids": ",".join(sorted_ids),
                "vs_currencies": vs_currency,
                "include_24hr_change": "true",
                "include_market_cap": "true",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        result = {}
        for coin_id, values in data.items():
            result[coin_id] = {
                "prix": values.get(vs_currency),
                "variation_24h": values.get(f"{vs_currency}_24h_change"),
                "market_cap": values.get(f"{vs_currency}_market_cap"),
            }
        _cache_set(key, result)
        return result
    except Exception:
        return {}


def enrichir_crypto_actifs(actifs: list) -> list:
    """Enrichit chaque actif crypto avec cours_actuel, variation_24h, etc."""
    if not actifs:
        return []
    tickers = [a.get("ticker") for a in actifs if a.get("ticker")]
    prix_map = get_prix_many(tickers) if tickers else {}

    enriched = []
    for a in actifs:
        a = dict(a)
        ticker = a.get("ticker") or ""
        quantite = float(a.get("quantite") or 0)
        pru = float(a.get("pru") or 0)
        prix_data = prix_map.get(ticker, {})
        cours = prix_data.get("prix")
        cours_ok = cours is not None
        if not cours_ok:
            cours = 0.0
        valeur_actuelle = round(quantite * cours, 4)
        valeur_investie = round(quantite * pru, 4)
        pv_euros = round(valeur_actuelle - valeur_investie, 4)
        pv_pct = round((pv_euros / valeur_investie * 100), 2) if valeur_investie > 0 else 0.0
        a["cours_actuel"] = cours
        a["variation_24h"] = prix_data.get("variation_24h")
        a["market_cap"] = prix_data.get("market_cap")
        a["valeur_actuelle"] = valeur_actuelle
        a["valeur_investie"] = valeur_investie
        a["pv_euros"] = pv_euros
        a["pv_pct"] = pv_pct
        a["cours_ok"] = cours_ok
        enriched.append(a)
    return enriched


def calcul_stats_crypto(actifs_enrichis: list) -> dict:
    """Calcule les stats globales du portefeuille crypto."""
    valeur_actuelle = sum(a.get("valeur_actuelle") or 0 for a in actifs_enrichis)
    valeur_investie = sum(a.get("valeur_investie") or 0 for a in actifs_enrichis)
    pv_euros = round(valeur_actuelle - valeur_investie, 4)
    pv_pct = round((pv_euros / valeur_investie * 100), 2) if valeur_investie > 0 else 0.0
    return {
        "valeur_actuelle": round(valeur_actuelle, 2),
        "valeur_investie": round(valeur_investie, 2),
        "pv_euros": round(pv_euros, 2),
        "pv_pct": pv_pct,
        "nb": len(actifs_enrichis),
    }
