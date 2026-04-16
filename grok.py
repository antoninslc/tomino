"""
Module d'analyse patrimoniale via l'API Grok (xAI).
Compatible format OpenAI — utilise requests, pas de SDK.

Niveaux de prompt (tier) :
  "free"        → ultra-compact : résumé minimal, réponse très courte
  "tomino_plus" → complet       : analyse riche, limites explicitées
"""

import json
import os

import requests
from dotenv import load_dotenv

import database as db

load_dotenv()

_API_URL = "https://api.x.ai/v1/chat/completions"
_MODEL   = "grok-4-1-fast-reasoning"
_MAX_CONTINUATIONS = 3

# Tool "search" natif xAI — Grok cherche sur le web + X en temps réel.
# Si l'API renvoie finish_reason="tool_calls", on fallback sur DuckDuckGo.
_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search",
        "description": "Recherche des informations récentes sur le web (actualités, cours, événements).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Requête de recherche"},
            },
            "required": ["query"],
        },
    },
}


def _search_ddg(query: str, max_results: int = 4) -> str:
    """Fallback DuckDuckGo Instant Answer — sans clé API."""
    try:
        r = requests.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            headers={"User-Agent": "Tomino/1.0 (finance assistant)"},
            timeout=8,
        )
        d = r.json()
        parts = []
        if d.get("AbstractText"):
            parts.append(d["AbstractText"])
        for topic in (d.get("RelatedTopics") or [])[:max_results]:
            if isinstance(topic, dict) and topic.get("Text"):
                parts.append(f"- {topic['Text']}")
        return "\n".join(parts) if parts else "Aucun résultat pertinent trouvé pour cette requête."
    except Exception as e:
        return f"Recherche indisponible : {e}"


def _apply_tool_calls(messages: list, tool_call_acc: dict) -> bool:
    """
    Exécute les tool_calls accumulés (search), ajoute les messages assistant + tool
    dans la liste, et retourne True si au moins un tool call a été traité.
    """
    if not tool_call_acc:
        return False
    tool_calls_list = [
        {
            "id": tc["id"],
            "type": "function",
            "function": {"name": tc["name"], "arguments": tc["arguments"]},
        }
        for tc in tool_call_acc.values()
    ]
    messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls_list})
    for tc in tool_call_acc.values():
        if tc["name"] in ("search", "web_search"):
            try:
                args = json.loads(tc["arguments"] or "{}")
                query = args.get("query", "")
            except Exception:
                query = ""
            result = _search_ddg(query) if query else "Requête vide."
        else:
            result = f"Tool '{tc['name']}' non supporté localement."
        messages.append({
            "role": "tool",
            "tool_call_id": tc["id"],
            "content": result,
        })
    return True


def _accumulate_tool_call(acc: dict, tc_delta: dict) -> None:
    """Fusionne un delta de tool_call dans l'accumulateur."""
    idx = tc_delta.get("index", 0)
    if idx not in acc:
        acc[idx] = {"id": "", "name": "", "arguments": ""}
    acc[idx]["id"] += tc_delta.get("id") or ""
    fn = tc_delta.get("function") or {}
    acc[idx]["name"] += fn.get("name") or ""
    acc[idx]["arguments"] += fn.get("arguments") or ""

# Tokens max par tier (system + user + réponse)
_MAX_TOKENS_PAR_TIER = {
    "free":        512,
    "tomino_plus": 1200,
}
_CHAT_MAX_TOKENS_PAR_TIER = {
    "free":        300,
    "tomino_plus": 500,
}

# Nombre de messages chat conservés par tier
_CHAT_HISTORIQUE_PAR_TIER = {
    "free":        4,
    "tomino_plus": 12,
}

# Nombre de positions affichées dans le contexte chat par tier
_CHAT_MAX_POSITIONS_PAR_TIER = {
    "free":        5,
    "tomino_plus": None,  # Toutes les positions
}

# ── SOCLES SYSTÈME PAR TIER ──────────────────────────────

_SOCLE_FREE = (
    "Tu es Tomino Intelligence, un assistant d'analyse patrimoniale.\n"
    "Tu apportes un regard extérieur, pédagogique et factuel sur le patrimoine décrit, "
    "uniquement à partir des données fournies.\n"
    "Tu n'es pas conseiller financier. Tu ne fournis ni conseil personnalisé, "
    "ni ordre d'achat, ni ordre de vente.\n"
    "Réponds en français, de manière très concise. "
    "Mets en avant uniquement les points les plus importants.\n"
    "N'invente aucune donnée. Si une information manque, dis-le.\n"
    "Adapte le ton et le style au profil utilisateur sans allonger inutilement la réponse.\n"
    "Termine par une phrase très brève rappelant qu'il s'agit d'un regard extérieur, "
    "pas d'un conseil financier."
)

_SOCLE_PLUS = (
    "Tu es Tomino Intelligence, un assistant d'analyse patrimoniale.\n"
    "Tu apportes un regard extérieur, critique, pédagogique, structuré et factuel "
    "sur le patrimoine décrit, uniquement à partir des données fournies.\n"
    "Tu n'es pas conseiller financier. Tu ne fournis ni conseil personnalisé en investissement, "
    "ni recommandation d'achat ou de vente, ni validation définitive d'une décision patrimoniale.\n"
    "Ton rôle est d'identifier les points forts, les fragilités, les concentrations, "
    "les risques visibles, les incohérences éventuelles et les questions utiles à se poser.\n"
    "Réponds en français avec un niveau de détail adapté aux préférences utilisateur.\n"
    "Si le style demandé est concis, reste dense et synthétique. "
    "Si le style demandé est détaillé, développe davantage, sans redondance.\n"
    "Si le ton demandé est formel, adopte un ton sobre et professionnel. "
    "Si le ton demandé est informel, reste naturel, clair et rigoureux.\n"
    "Utilise le profil investisseur pour évaluer la cohérence du patrimoine observé, "
    "sans transformer cette analyse en recommandation personnalisée.\n"
    "Respecte strictement les exclusions sectorielles et géographiques indiquées. "
    "Si une exposition existante semble incohérente avec ces exclusions, signale-la.\n"
    "N'invente aucune donnée. Si certaines informations sont absentes ou incomplètes, "
    "dis clairement ce que cela limite dans l'analyse.\n"
    "Emploie un langage non prescriptif : formule les conclusions en termes de vigilance, "
    "hypothèses, axes de réflexion et points à approfondir.\n"
    "Termine par une phrase courte rappelant qu'il s'agit d'un regard extérieur "
    "sur le patrimoine et non d'un conseil financier."
)

_SOCLES = {"free": _SOCLE_FREE, "tomino_plus": _SOCLE_PLUS}

# ── MODULES MÉTIER PAR TYPE D'ANALYSE ────────────────────

_MODULE_PERFORMANCE = (
    "Analyse la performance du patrimoine présenté.\n"
    "Identifie ce qui contribue le plus à la performance et ce qui la pénalise.\n"
    "Évalue si la trajectoire semble cohérente avec le profil investisseur et le benchmark.\n"
    "N'utilise pas de langage prescriptif."
)

_MODULE_ARBITRAGE = (
    "Analyse le patrimoine sous l'angle des déséquilibres, concentrations, "
    "redondances et écarts possibles avec le profil investisseur.\n"
    "Propose uniquement des pistes d'ajustement à étudier, jamais des ordres d'achat ou de vente.\n"
    "Respecte strictement les exclusions sectorielles et géographiques du profil."
)

_MODULE_RISQUES = (
    "Analyse le patrimoine sous l'angle des vulnérabilités visibles.\n"
    "Priorise les risques selon leur importance probable : "
    "concentration, secteur, géographie, devise, corrélation, liquidité, "
    "dépendance à quelques lignes.\n"
    "Formule les conclusions comme des points de vigilance, pas comme des consignes."
)

_MODULES_METIER = {
    "performance": _MODULE_PERFORMANCE,
    "arbitrage":   _MODULE_ARBITRAGE,
    "risques":     _MODULE_RISQUES,
}

# Tiers valides
TIERS_VALIDES = ("free", "tomino_plus")


def _tier_valide(tier: str) -> str:
    """Normalise et valide le tier. Replie sur 'free' si inconnu."""
    t = str(tier or "free").strip().lower()
    if t in ("tier1", "tier2", "tomino_plus", "tomino+", "plus"):
        return "tomino_plus"
    return "free"


def _profil_prompt_block(profil: dict) -> str:
    """Bloc profil compact injecté dans le contexte."""
    secteurs = profil.get("secteurs_exclus") or []
    secteurs_txt = ", ".join(str(s) for s in secteurs) if isinstance(secteurs, list) and secteurs else "Aucun"
    pays = profil.get("pays_exclus") or []
    pays_txt = ", ".join(str(p) for p in pays) if isinstance(pays, list) and pays else "Aucun"

    return (
        "\n--- Profil investisseur ---\n"
        f"Horizon : {profil.get('horizon', 'long')}\n"
        f"Risque : {profil.get('risque', 'equilibre')}\n"
        f"Objectif : {profil.get('objectif', 'croissance')}\n"
        f"Stratégie : {profil.get('strategie', 'mixte')}\n"
        f"Style : {profil.get('style_ia', 'detaille')} / Ton : {profil.get('ton_ia', 'informel')}\n"
        f"Secteurs exclus : {secteurs_txt}\n"
        f"Pays exclus : {pays_txt}\n"
        f"Benchmark : {profil.get('benchmark', 'CW8.PA')}\n"
        "Utilise ce profil pour évaluer la cohérence du patrimoine et adapter la forme. "
        "Ne transforme pas ce profil en recommandation personnalisée."
    )


def _construire_contexte(resume: dict, actifs: list, profil: dict | None = None) -> str:
    """Sérialise le snapshot patrimonial en texte structuré pour le prompt."""
    _pea = resume.get("pea") or {}
    _cto = resume.get("cto") or {}
    _or  = resume.get("or")  or {}
    _liv = resume.get("livrets") or {}
    _av  = resume.get("assurance_vie") or {}
    lignes = [
        "=== SNAPSHOT PATRIMONIAL ===",
        f"Valeur totale     : {float(resume.get('total') or 0):.2f} €",
        f"Montant investi   : {float(resume.get('total_investi') or 0):.2f} €",
        f"Plus-value totale : {float(resume.get('pv_total') or 0):+.2f} € ({float(resume.get('pv_pct') or 0):+.2f}%)",
        "",
        "--- Allocation par enveloppe ---",
        f"PEA     : {float(_pea.get('valeur_actuelle') or 0):.2f} € ({_pea.get('pct', 0)}%)"
        f"  |  PV {float(_pea.get('pv_euros') or 0):+.2f} € ({float(_pea.get('pv_pct') or 0):+.2f}%)",
        f"CTO     : {float(_cto.get('valeur_actuelle') or 0):.2f} € ({_cto.get('pct', 0)}%)"
        f"  |  PV {float(_cto.get('pv_euros') or 0):+.2f} € ({float(_cto.get('pv_pct') or 0):+.2f}%)",
        f"Or      : {float(_or.get('valeur_actuelle') or 0):.2f} € ({_or.get('pct', 0)}%)"
        f"  |  PV {float(_or.get('pv_euros') or 0):+.2f} € ({float(_or.get('pv_pct') or 0):+.2f}%)",
        f"Livrets : {float(_liv.get('valeur_actuelle') or 0):.2f} € ({_liv.get('pct', 0)}%)",
        f"Assurance vie : {float(_av.get('valeur_actuelle') or 0):.2f} € ({_av.get('pct', 0)}%)",
    ]

    dividendes_total = float((resume.get("dividendes") or {}).get("total") or 0)
    if dividendes_total:
        lignes.append(f"Dividendes encaissés : {dividendes_total:.2f} €")

    if profil:
        lignes.append(_profil_prompt_block(profil))

    if actifs:
        cours_manquants = [a.get("nom") for a in actifs if not a.get("cours_ok")]
        if cours_manquants:
            lignes.append(f"ATTENTION : cours indisponibles pour {', '.join(cours_manquants)} — PV non calculables pour ces positions.")
        lignes.extend(["", "--- Positions ---"])
        for a in actifs:
            cours = f"{a.get('cours_actuel', '?')} {a.get('devise', '€')}" if a.get("cours_ok") else "cours indisponible"
            pv    = f"{a.get('pv_euros', 0):+.2f} € ({a.get('pv_pct', 0):+.2f}%)" if a.get("cours_ok") else "—"
            tri = a.get("tri")
            tri_txt = f" | TRI:{tri:.1f}%" if isinstance(tri, (int, float)) else ""
            lignes.append(
                f"  [{a.get('enveloppe')}] {a.get('nom')} ({a.get('ticker', '—')}) | "
                f"type:{a.get('type')} cat:{a.get('categorie')} | "
                f"qté:{a.get('quantite')} PRU:{a.get('pru'):.2f}€ | "
                f"cours:{cours} | PV:{pv}{tri_txt}"
            )

    return "\n".join(lignes)


def _construire_prompt_systeme(type_analyse: str, tier: str) -> str:
    """Assemble socle + module métier pour un tier et un type d'analyse donnés."""
    socle = _SOCLES[tier]
    module = _MODULES_METIER.get(type_analyse, "")
    return f"{socle}\n\n{module}" if module else socle


def analyser(type_analyse: str, resume: dict, actifs: list, tier: str = "free") -> str:
    """
    Appelle l'API Grok et retourne la réponse textuelle.
    Sauvegarde l'analyse en base via db.save_analyse().

    Args:
        type_analyse : "performance" | "arbitrage" | "risques"
        resume       : dict retourné par calcul_resume()
        actifs       : liste enrichie retournée par prices.enrichir_actifs()
        tier         : "free" | "tomino_plus"

    Returns:
        Tuple (texte, usage_dict) — texte de l'analyse (ou "[ERREUR]…") et
        {"prompt_tokens": int, "completion_tokens": int} depuis l'API.
    """
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        return "[ERREUR] Clé API XAI_API_KEY manquante. Ajoutez-la dans le fichier .env."

    if type_analyse not in _MODULES_METIER:
        return f"[ERREUR] Type d'analyse inconnu : {type_analyse!r}. Valeurs acceptées : performance, arbitrage, risques."

    tier = _tier_valide(tier)
    max_tokens = _MAX_TOKENS_PAR_TIER[tier]

    profil = db.get_profil()
    contexte = _construire_contexte(resume, actifs, profil)
    prompt_systeme = _construire_prompt_systeme(type_analyse, tier)

    messages = [
        {"role": "system", "content": prompt_systeme},
        {"role": "user", "content": contexte},
    ]

    usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}
    try:
        morceaux = []
        for _ in range(_MAX_CONTINUATIONS + 1):
            payload = {
                "model": _MODEL,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": max_tokens,
            }

            r = requests.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=45,
            )
            r.raise_for_status()

            data = r.json()
            usage = data.get("usage") or {}
            usage_total["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
            usage_total["completion_tokens"] += int(usage.get("completion_tokens") or 0)
            usage_total["cached_tokens"] += int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)

            choice = data["choices"][0]
            chunk = ((choice.get("message") or {}).get("content") or "").strip()
            finish_reason = choice.get("finish_reason", "")

            morceaux.append(chunk)

            if finish_reason != "length":
                break

            messages.append({"role": "assistant", "content": chunk})
            messages.append({
                "role": "user",
                "content": "Continue exactement où tu t'es arrêté, sans répéter ce qui précède.",
            })

        reponse = "\n\n".join(morceaux).strip()
    except requests.exceptions.HTTPError as exc:
        r_ref = exc.response
        code = r_ref.status_code if r_ref is not None else '?'
        body = r_ref.text[:300] if r_ref is not None else ''
        reponse = f"[ERREUR] Réponse HTTP {code} de l'API xAI : {body}"
    except requests.exceptions.RequestException as e:
        reponse = f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except (KeyError, IndexError, ValueError) as e:
        reponse = f"[ERREUR] Réponse inattendue de l'API : {e}"

    if not reponse.startswith("[ERREUR]"):
        db.save_analyse(type_analyse, contexte, reponse)
    return reponse, usage_total


def _construire_prompt_chat(resume: dict, profil: dict, actifs: list | None = None, tier: str = "free") -> str:
    """Prompt système pour le chat conversationnel."""
    contexte = _construire_contexte_chat_compact(resume, profil, actifs=actifs, tier=tier)
    return (
        "Tu es Tomino Intelligence, un assistant d'analyse patrimoniale conversationnel.\n"
        "Tu apportes un regard extérieur, pédagogique et factuel sur le patrimoine décrit.\n"
        "Tu n'es pas conseiller financier. Tu ne fournis ni conseil personnalisé, "
        "ni ordre d'achat, ni ordre de vente.\n"
        "Réponds en français, de façon claire, concise et rigoureuse.\n"
        "Tu peux expliquer des notions, identifier des points d'attention et signaler des risques.\n"
        "N'affirme pas de certitudes quand les données sont insuffisantes.\n"
        "N'invente aucune donnée.\n"
        "La conversation est continue: n'écris pas de formule d'accueil (ex: Bonjour) "
        "si l'échange est déjà en cours.\n"
        "Vas directement au fond de la réponse.\n\n"
        f"Snapshot patrimonial actuel :\n{contexte}"
    )


def _construire_contexte_chat_compact(resume: dict, profil: dict, actifs: list | None = None, tier: str = "free") -> str:
    """Contexte compact pour le chat afin de limiter les tokens envoyés à chaque tour.

    Les positions sont triées par valeur décroissante et limitées selon le tier :
      free        → top 5
      tomino_plus → toutes
    """
    secteurs = profil.get("secteurs_exclus") or []
    pays = profil.get("pays_exclus") or []
    secteurs_txt = ", ".join(str(s) for s in secteurs) if isinstance(secteurs, list) and secteurs else "Aucun"
    pays_txt = ", ".join(str(p) for p in pays) if isinstance(pays, list) and pays else "Aucun"

    lignes = [
        "=== SNAPSHOT COMPACT ===",
        f"Total: {float(resume.get('total') or 0):.2f} € | Investi: {float(resume.get('total_investi') or 0):.2f} € | PV: {float(resume.get('pv_total') or 0):+.2f} € ({float(resume.get('pv_pct') or 0):+.2f}%)",
        f"PEA: {float((resume.get('pea') or {}).get('valeur_actuelle') or 0):.2f} € ({float((resume.get('pea') or {}).get('pct') or 0):.1f}%)",
        f"CTO: {float((resume.get('cto') or {}).get('valeur_actuelle') or 0):.2f} € ({float((resume.get('cto') or {}).get('pct') or 0):.1f}%)",
        f"Or: {float((resume.get('or') or {}).get('valeur_actuelle') or 0):.2f} € ({float((resume.get('or') or {}).get('pct') or 0):.1f}%)",
        f"Livrets: {float((resume.get('livrets') or {}).get('valeur_actuelle') or 0):.2f} € ({float((resume.get('livrets') or {}).get('pct') or 0):.1f}%)",
        f"Assurance vie: {float((resume.get('assurance_vie') or {}).get('valeur_actuelle') or 0):.2f} € ({float((resume.get('assurance_vie') or {}).get('pct') or 0):.1f}%)",
        "--- Profil ---",
        f"Horizon: {profil.get('horizon', 'long')} | Risque: {profil.get('risque', 'equilibre')} | Objectif: {profil.get('objectif', 'croissance')} | Strategie: {profil.get('strategie', 'mixte')}",
        f"Exclusions secteurs: {secteurs_txt}",
        f"Exclusions pays: {pays_txt}",
        f"Benchmark: {profil.get('benchmark', 'CW8.PA')}",
    ]

    if actifs:
        positions = sorted(actifs, key=lambda a: float(a.get("valeur_actuelle") or 0), reverse=True)
        max_pos = _CHAT_MAX_POSITIONS_PAR_TIER.get(tier)
        shown = positions if max_pos is None else positions[:max_pos]
        total_positions = len(positions)

        lignes.append("--- Positions ---")
        for a in shown:
            pv_txt = (
                f"{a.get('pv_euros', 0):+.2f} € ({a.get('pv_pct', 0):+.2f}%)"
                if a.get("cours_ok") else "—"
            )
            lignes.append(
                f"  [{a.get('enveloppe')}] {a.get('nom')} ({a.get('ticker', '—')}) | "
                f"{float(a.get('valeur_actuelle') or 0):.2f} € | PV:{pv_txt}"
            )
        if max_pos is not None and total_positions > max_pos:
            lignes.append(f"  ... et {total_positions - max_pos} autre(s) position(s) non affichée(s).")

    return "\n".join(lignes)


def chat(historique_messages: list, resume: dict, actifs: list | None = None, tier: str = "free") -> str:
    """
    Chat éphémère avec Grok sans persistance DB.

    Args:
        historique_messages: liste de messages {"role": "user"|"assistant", "content": "..."}
        resume: dict retourné par calcul_resume()
        actifs: liste enrichie retournée par prices.enrichir_actifs() (optionnel)
        tier: "free" | "tomino_plus"

    Returns:
        Texte de réponse Grok, ou "[ERREUR] ..."
    """
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        return "[ERREUR] Clé API XAI_API_KEY manquante. Ajoutez-la dans le fichier .env."

    if not isinstance(historique_messages, list):
        return "[ERREUR] Format invalide: 'historique_messages' doit être une liste."

    tier = _tier_valide(tier)
    nb_messages = _CHAT_HISTORIQUE_PAR_TIER[tier]
    max_tokens = _CHAT_MAX_TOKENS_PAR_TIER[tier]

    historique_messages = historique_messages[-nb_messages:]

    profil = db.get_profil()
    prompt_systeme = _construire_prompt_chat(resume, profil, actifs=actifs, tier=tier)

    messages = [{"role": "system", "content": prompt_systeme}]
    for m in historique_messages:
        if not isinstance(m, dict):
            continue
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        messages.append({"role": role, "content": content})

    if len(messages) == 1:
        return "[ERREUR] Aucun message utilisateur à traiter."

    usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}
    try:
        morceaux = []
        for _ in range(_MAX_CONTINUATIONS + 1):
            payload = {
                "model": _MODEL,
                "messages": messages,
                "temperature": 0.65,
                "max_tokens": max_tokens,
            }

            r = requests.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=45,
            )
            r.raise_for_status()

            data = r.json()
            usage = data.get("usage") or {}
            usage_total["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
            usage_total["completion_tokens"] += int(usage.get("completion_tokens") or 0)
            usage_total["cached_tokens"] += int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)

            choice = data["choices"][0]
            chunk = (choice["message"].get("content") or "").strip()
            finish_reason = choice.get("finish_reason", "")

            if chunk:
                morceaux.append(chunk)

            if finish_reason != "length":
                break

            if not chunk:
                break

            messages.append({"role": "assistant", "content": chunk})
            messages.append({
                "role": "user",
                "content": "Continue exactement où tu t'es arrêté, sans répéter ce qui précède. Termine proprement ta réponse.",
            })

        reponse = "\n\n".join(morceaux).strip()
        if not reponse:
            return "[ERREUR] Réponse vide de l'API xAI.", usage_total
        return reponse, usage_total
    except requests.exceptions.HTTPError as exc:
        r_ref = exc.response
        code = r_ref.status_code if r_ref is not None else '?'
        body = r_ref.text[:300] if r_ref is not None else ''
        return f"[ERREUR] Réponse HTTP {code} de l'API xAI : {body}", {}
    except requests.exceptions.RequestException as e:
        return f"[ERREUR] Impossible de joindre l'API xAI : {e}", {}
    except (KeyError, IndexError, ValueError) as e:
        return f"[ERREUR] Réponse inattendue de l'API : {e}", {}


def chat_stream(historique_messages: list, resume: dict, actifs: list | None = None, tier: str = "free", conv_id: str | None = None):
    """
    Chat éphémère en streaming : génère des morceaux de texte au fil de l'eau.

    Args:
        historique_messages: liste de messages {"role": "user"|"assistant", "content": "..."}
        resume: dict retourné par calcul_resume()
        actifs: liste enrichie retournée par prices.enrichir_actifs() (optionnel)
        tier: "free" | "tomino_plus"

    Yields:
        Chunks de texte (str), ou un seul message "[ERREUR] ...".
    """
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        yield "[ERREUR] Clé API XAI_API_KEY manquante. Ajoutez-la dans le fichier .env."
        return

    if not isinstance(historique_messages, list):
        yield "[ERREUR] Format invalide: 'historique_messages' doit être une liste."
        return

    tier = _tier_valide(tier)
    nb_messages = _CHAT_HISTORIQUE_PAR_TIER[tier]
    max_tokens = _CHAT_MAX_TOKENS_PAR_TIER[tier]

    historique_messages = historique_messages[-nb_messages:]

    profil = db.get_profil()
    prompt_systeme = _construire_prompt_chat(resume, profil, actifs=actifs, tier=tier)

    messages = [{"role": "system", "content": prompt_systeme}]
    for m in historique_messages:
        if not isinstance(m, dict):
            continue
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        messages.append({"role": role, "content": content})

    if len(messages) == 1:
        yield "[ERREUR] Aucun message utilisateur à traiter."
        return

    usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}
    req_headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if conv_id:
        req_headers["x-grok-conv-id"] = conv_id

    try:
        for iteration in range(_MAX_CONTINUATIONS + 4):  # +4 pour les iterations tool_calls
            payload = {
                "model": _MODEL,
                "messages": messages,
                "temperature": 0.65,
                "max_tokens": max_tokens,
                "stream": True,
                "stream_options": {"include_usage": True},
                "tools": [_SEARCH_TOOL],
                "tool_choice": "auto",
            }

            chunk_parts = []
            finish_reason = ""
            tool_call_acc: dict = {}

            with requests.post(_API_URL, headers=req_headers, json=payload, timeout=60, stream=True) as r:
                r.raise_for_status()
                for raw_line in r.iter_lines(decode_unicode=False):
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        evt = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    if evt.get("usage") and not evt.get("choices"):
                        u = evt["usage"]
                        usage_total["prompt_tokens"] += int(u.get("prompt_tokens") or 0)
                        usage_total["completion_tokens"] += int(u.get("completion_tokens") or 0)
                        usage_total["cached_tokens"] += int((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
                        continue
                    choices = evt.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    delta = choice.get("delta") or {}
                    if delta.get("content"):
                        text = str(delta["content"])
                        chunk_parts.append(text)
                        yield text
                    for tc in (delta.get("tool_calls") or []):
                        _accumulate_tool_call(tool_call_acc, tc)
                    fr = choice.get("finish_reason")
                    if fr:
                        finish_reason = str(fr)

            chunk = "".join(chunk_parts).strip()

            if finish_reason == "tool_calls":
                _apply_tool_calls(messages, tool_call_acc)
                continue  # Relancer pour obtenir la réponse finale

            if finish_reason == "length" and chunk:
                if iteration >= _MAX_CONTINUATIONS:
                    yield "\n\n[Réponse tronquée]"
                    break
                messages.append({"role": "assistant", "content": chunk})
                messages.append({"role": "user", "content": "Continue exactement où tu t'es arrêté, sans répéter ce qui précède. Termine proprement ta réponse."})
                continue

            break  # finish_reason == "stop" ou autre → terminé

    except requests.exceptions.HTTPError as exc:
        r_ref = exc.response
        code = r_ref.status_code if r_ref is not None else '?'
        body = r_ref.text[:300] if r_ref is not None else ''
        yield f"[ERREUR] Réponse HTTP {code} de l'API xAI : {body}"
    except requests.exceptions.RequestException as e:
        yield f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except Exception as e:
        yield f"[ERREUR] Flux inattendu de l'API : {e}"

    # Sentinel final avec les vrais compteurs de tokens
    yield {"__usage__": usage_total}


def stock_chat_stream(
    historique_messages: list,
    stock_data: dict,
    history_data: dict | None = None,
    investment_score: dict | None = None,
    tier: str = "free",
    conv_id: str | None = None,
):
    """
    Chat en streaming contextualisé sur une action.
    stock_data : dict retourné par prices.get_stock_fundamentals()
    """
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        yield "[ERREUR] Clé API XAI_API_KEY manquante."
        return

    tier = _tier_valide(tier)
    max_tokens = _CHAT_MAX_TOKENS_PAR_TIER[tier]
    nb_messages = _CHAT_HISTORIQUE_PAR_TIER[tier]
    historique_messages = historique_messages[-nb_messages:]

    profil = db.get_profil()
    ton = profil.get("ton_ia", "informel")
    style = profil.get("style_ia", "detaille")

    nom = stock_data.get("nom") or stock_data.get("ticker", "cette action")
    ticker = stock_data.get("ticker", "")

    def pct(v):
        return f"{v*100:.1f}%" if v is not None else "N/D"
    def val(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "N/D"
    def eur_m(v):
        if v is None: return "N/D"
        if v >= 1e12: return f"{v/1e12:.1f} T"
        if v >= 1e9:  return f"{v/1e9:.1f} Md"
        if v >= 1e6:  return f"{v/1e6:.0f} M"
        return str(v)

    anomalies = []

    def _num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def _check_range(label, key, min_v=None, max_v=None):
        val_n = _num(stock_data.get(key))
        if val_n is None:
            return
        if min_v is not None and val_n < min_v:
            anomalies.append(f"{label}: {val_n} hors plage ({min_v} .. {max_v if max_v is not None else '∞'})")
            return
        if max_v is not None and val_n > max_v:
            anomalies.append(f"{label}: {val_n} hors plage ({min_v if min_v is not None else '-∞'} .. {max_v})")

    _check_range("variation_jour", "variation_jour", -0.8, 0.8)
    _check_range("marge_brute", "marge_brute", -0.5, 1.0)
    _check_range("marge_operationnelle", "marge_operationnelle", -0.5, 0.8)
    _check_range("marge_nette", "marge_nette", -0.8, 0.6)
    _check_range("roe", "roe", -2.0, 3.0)
    _check_range("roa", "roa", -1.0, 1.0)
    _check_range("roic", "roic", -1.0, 1.0)
    _check_range("croissance_ca", "croissance_ca", -0.9, 5.0)
    _check_range("croissance_benefices", "croissance_benefices", -0.99, 10.0)
    _check_range("rendement_div", "rendement_div", 0.0, 0.5)
    _check_range("taux_distribution", "taux_distribution", 0.0, 3.0)
    _check_range("beta", "beta", -2.0, 8.0)
    _check_range("current_ratio", "current_ratio", 0.0, 20.0)
    _check_range("quick_ratio", "quick_ratio", 0.0, 20.0)
    _check_range("altman_z", "altman_z", -10.0, 20.0)

    cours = _num(stock_data.get("cours"))
    bas_52w = _num(stock_data.get("cours_52w_bas"))
    haut_52w = _num(stock_data.get("cours_52w_haut"))
    if cours is not None and bas_52w is not None and haut_52w is not None:
        if haut_52w < bas_52w:
            anomalies.append("Incohérence 52 semaines: le haut est inférieur au bas")
        if cours < 0:
            anomalies.append("Cours négatif impossible")

    score_block = ""
    if isinstance(investment_score, dict) and investment_score:
        total = investment_score.get("total")
        details = investment_score.get("details") if isinstance(investment_score.get("details"), dict) else {}
        score_block = (
            "\n\nSCORE D'INVESTISSEMENT TOMINO (calcul front)\n"
            f"Score global: {total if total is not None else 'N/D'}/100\n"
            f"Valorisation: {details.get('valorisation', 'N/D')}/25 | "
            f"Rentabilité: {details.get('rentabilite', 'N/D')}/30 | "
            f"Santé financière: {details.get('sante', 'N/D')}/25 | "
            f"Croissance: {details.get('croissance', 'N/D')}/20\n"
            "Tu dois critiquer ce score: dire s'il est cohérent avec les métriques brutes, "
            "où il peut sur/sous-pondérer, et proposer une note corrigée argumentée si nécessaire."
        )

    anomalies_block = "\n".join(f"- {a}" for a in anomalies) if anomalies else "- Aucune anomalie évidente détectée par les règles heuristiques"

    history_block = ""
    if isinstance(history_data, dict):
        annees = history_data.get("annees") or []
        if isinstance(annees, list) and annees:
            def hist_val(key, idx):
                arr = history_data.get(key) or []
                if not isinstance(arr, list) or idx >= len(arr):
                    return None
                return arr[idx]

            lignes_hist = []
            start_idx = max(0, len(annees) - 5)
            for i in range(start_idx, len(annees)):
                annee = annees[i]
                ca = hist_val("ca", i)
                rn = hist_val("resultat_net", i)
                fcf = hist_val("fcf", i)
                mn = hist_val("marge_nette", i)
                lignes_hist.append(
                    f"{annee}: CA {eur_m(ca)} | RN {eur_m(rn)} | FCF {eur_m(fcf)} | Marge nette {pct(mn)}"
                )

            if lignes_hist:
                history_block = "\n\nHISTORIQUE FINANCIER (5 ans)\n" + "\n".join(lignes_hist)

    context = f"""Tu es un assistant d'analyse boursière intégré à Tomino, application de gestion de patrimoine.
Tu analyses l'action suivante et tu réponds aux questions de l'utilisateur à son sujet.
Ton : {"décontracté mais précis" if ton == "informel" else "professionnel et rigoureux"}.
Style : {"détaillé avec explications" if style == "detaille" else "synthétique"}.

=== ACTION ANALYSÉE : {nom} ({ticker}) ===
Secteur : {stock_data.get("secteur") or "N/D"} | Industrie : {stock_data.get("industrie") or "N/D"} | Pays : {stock_data.get("pays") or "N/D"}
Cours actuel : {val(stock_data.get("cours"))} {stock_data.get("devise","")} | Variation jour : {pct(stock_data.get("variation_jour"))}
52 semaines — Haut : {val(stock_data.get("cours_52w_haut"))} | Bas : {val(stock_data.get("cours_52w_bas"))}
Capitalisation : {eur_m(stock_data.get("capitalisation"))} | Bêta : {val(stock_data.get("beta"))} | Volume moyen : {eur_m(stock_data.get("volume_moyen"))}

VALORISATION
P/E trailing : {val(stock_data.get("pe_trailing"))} | P/E forward : {val(stock_data.get("pe_forward"))}
P/B : {val(stock_data.get("pb"))} | P/S : {val(stock_data.get("ps"))} | EV/EBITDA : {val(stock_data.get("ev_ebitda"))} | PEG : {val(stock_data.get("peg"))}

FLUX DE TRÉSORERIE
Price/FCF : {val(stock_data.get("price_fcf"))} | FCF TTM : {eur_m(stock_data.get("fcf_ttm"))} | FCF/action : {val(stock_data.get("fcf_par_action"))}

SANTÉ FINANCIÈRE
Marge brute : {pct(stock_data.get("marge_brute"))} | Marge nette : {pct(stock_data.get("marge_nette"))} | Marge opérationnelle : {pct(stock_data.get("marge_operationnelle"))}
ROIC : {pct(stock_data.get("roic"))} | ROE : {pct(stock_data.get("roe"))} | ROA : {pct(stock_data.get("roa"))}
Dette/Capitaux : {val(stock_data.get("dette_capitaux"))} | Dette nette/EBITDA : {val(stock_data.get("dette_nette_ebitda"))}
Current ratio : {val(stock_data.get("current_ratio"))} | Quick ratio : {val(stock_data.get("quick_ratio"))} | Altman Z-Score : {val(stock_data.get("altman_z"))}

CROISSANCE
CA (YoY) : {pct(stock_data.get("croissance_ca"))} | Bénéfices (YoY) : {pct(stock_data.get("croissance_benefices"))}

DIVIDENDE
Rendement : {pct(stock_data.get("rendement_div"))} | Dividende/action : {val(stock_data.get("dividende_par_action"))} | Taux distribution : {pct(stock_data.get("taux_distribution"))}

CONSENSUS ANALYSTES ({stock_data.get("nb_analystes", 0)} analystes)
Recommandation : {stock_data.get("recommandation") or "N/D"}
Objectif moyen : {val(stock_data.get("objectif_moyen"))} | Haut : {val(stock_data.get("objectif_haut"))} | Bas : {val(stock_data.get("objectif_bas"))}

PROFIL INVESTISSEUR
Horizon : {profil.get("horizon","N/D")} | Risque : {profil.get("risque","N/D")} | Objectif : {profil.get("objectif","N/D")}

DESCRIPTION ENTREPRISE
{(stock_data.get("description") or "N/D")[:900]}

{history_block}

{score_block}

CONTRÔLE DE COHÉRENCE (valeurs aberrantes)
{anomalies_block}

Si des valeurs semblent aberrantes, explicite pourquoi, propose une interprétation prudente et une correction plausible (ou une plage plausible), sans inventer des certitudes.

Règle de réponse : sois bref et direct, comme dans un message à un collègue. 2 à 4 phrases maximum par défaut — sauf si l'utilisateur dit explicitement "développe" ou "explique en détail". Pas d'introduction, pas de reformulation de la question. Va droit au fait.
Si l'utilisateur demande une opinion d'investissement, rappelle en une phrase que tu n'es pas conseiller financier.
"""

    messages = [{"role": "system", "content": context}]
    for m in historique_messages:
        if not isinstance(m, dict):
            continue
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        messages.append({"role": role, "content": content})

    if len(messages) == 1:
        yield "[ERREUR] Aucun message à traiter."
        return

    req_headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if conv_id:
        req_headers["x-grok-conv-id"] = conv_id
    usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}

    try:
        for iteration in range(_MAX_CONTINUATIONS + 4):
            payload = {
                "model": _MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "stream": True,
                "stream_options": {"include_usage": True},
                "tools": [_SEARCH_TOOL],
                "tool_choice": "auto",
            }
            r = requests.post(_API_URL, json=payload, headers=req_headers, stream=True, timeout=60)
            r.raise_for_status()
            chunk_parts = []
            finish = None
            tool_call_acc: dict = {}
            for line in r.iter_lines():
                if not line:
                    continue
                text = line.decode("utf-8") if isinstance(line, bytes) else line
                if not text.startswith("data:"):
                    continue
                raw = text[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    evt = json.loads(raw)
                except Exception:
                    continue
                if evt.get("usage") and not evt.get("choices"):
                    u = evt["usage"]
                    usage_total["prompt_tokens"] += int(u.get("prompt_tokens") or 0)
                    usage_total["completion_tokens"] += int(u.get("completion_tokens") or 0)
                    usage_total["cached_tokens"] += int((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
                    continue
                choices = evt.get("choices") or []
                if not choices:
                    continue
                choice = choices[0]
                delta = choice.get("delta") or {}
                if delta.get("content"):
                    t = str(delta["content"])
                    chunk_parts.append(t)
                    yield t
                for tc in (delta.get("tool_calls") or []):
                    _accumulate_tool_call(tool_call_acc, tc)
                fr = choice.get("finish_reason")
                if fr:
                    finish = fr

            chunk = "".join(chunk_parts).strip()

            if finish == "tool_calls":
                _apply_tool_calls(messages, tool_call_acc)
                continue

            if finish == "length" and chunk:
                if iteration >= _MAX_CONTINUATIONS:
                    yield "\n\n[Réponse tronquée]"
                    break
                messages.append({"role": "assistant", "content": chunk})
                messages.append({"role": "user", "content": "Continue."})
                continue

            break

    except requests.exceptions.HTTPError as exc:
        r_ref = exc.response
        code = r_ref.status_code if r_ref is not None else "?"
        yield f"[ERREUR] HTTP {code} depuis l'API xAI."
    except requests.exceptions.RequestException as e:
        yield f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except Exception as e:
        yield f"[ERREUR] {e}"

    yield {"__usage__": usage_total}


# ── Memo d'investissement proactif ────────────────────────

def generer_memo_action(stock_data: dict, history_data: dict | None = None) -> tuple[str, dict]:
    """
    Génère un mémo d'investissement structuré sur une action.
    Non-streaming — retourne (texte_markdown, usage_dict).

    Sections : Thèse haussière / Thèse baissière / Risques clés /
               Catalyseurs potentiels / Verdict
    """
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        return "[ERREUR] Clé API XAI_API_KEY manquante.", {}

    def _fmt(v, suffix=""):
        if v is None: return "N/D"
        if abs(v) >= 1e9: return f"{v/1e9:.1f} Md{suffix}"
        if abs(v) >= 1e6: return f"{v/1e6:.0f} M{suffix}"
        return f"{v:.2f}{suffix}"
    def _pct(v):
        return f"{v*100:.1f}%" if v is not None else "N/D"

    d = stock_data
    nom = d.get("nom") or d.get("ticker", "?")
    ticker = d.get("ticker", "")
    devise = d.get("devise", "€")

    ctx_lines = [
        f"Action : {nom} ({ticker}) — {d.get('secteur','N/D')}, {d.get('pays','N/D')}",
        f"Cours : {d.get('cours')} {devise} | Capi : {_fmt(d.get('capitalisation'))} {devise}",
        f"P/E trailing : {d.get('pe_trailing')} | P/E forward : {d.get('pe_forward')} | PEG : {d.get('peg')}",
        f"EV/EBITDA : {d.get('ev_ebitda')} | P/B : {d.get('pb')} | P/S : {d.get('ps')}",
        f"Price/FCF : {d.get('price_fcf')} | FCF TTM : {_fmt(d.get('fcf_ttm'))} {devise}",
        f"ROIC : {_pct(d.get('roic'))} | ROE : {_pct(d.get('roe'))} | ROA : {_pct(d.get('roa'))}",
        f"Marge nette : {_pct(d.get('marge_nette'))} | Marge op. : {_pct(d.get('marge_operationnelle'))} | Marge brute : {_pct(d.get('marge_brute'))}",
        f"Croissance CA : {_pct(d.get('croissance_ca'))} | Croissance bénéfices : {_pct(d.get('croissance_benefices'))}",
        f"Dette nette/EBITDA : {d.get('dette_nette_ebitda')} | Current ratio : {d.get('current_ratio')}",
        f"Altman Z-Score : {d.get('altman_z')} | Bêta : {d.get('beta')}",
        f"Rendement dividende : {_pct(d.get('rendement_div'))} | Taux distribution : {_pct(d.get('taux_distribution'))}",
        f"Consensus : {d.get('recommandation')} | Objectif moyen : {d.get('objectif_moyen')} {devise} ({d.get('nb_analystes',0)} analystes)",
    ]
    if d.get("description"):
        ctx_lines.append(f"Description : {str(d['description'])[:400]}")
    if history_data and history_data.get("annees"):
        yrs = history_data.get("annees", [])
        ctx_lines.append("Historique CA : " + " | ".join(
            f"{y}: {_fmt(v)}" for y, v in zip(yrs, history_data.get("ca", [])) if v is not None))
        ctx_lines.append("Historique Résultat net : " + " | ".join(
            f"{y}: {_fmt(v)}" for y, v in zip(yrs, history_data.get("resultat_net", [])) if v is not None))
        ctx_lines.append("Historique FCF : " + " | ".join(
            f"{y}: {_fmt(v)}" for y, v in zip(yrs, history_data.get("fcf", [])) if v is not None))

    system_prompt = (
        "Tu es un analyste financier senior. Tu rédiges des mémos d'investissement denses, nuancés et utiles.\n"
        "Tu ne donnes jamais de conseil d'achat ou de vente.\n"
        "Sois direct, sans introduction ni conclusion générique.\n\n"
        "Règles impératives :\n"
        "- Chaque argument doit expliquer le POURQUOI, pas juste citer un chiffre. "
        "Exemple interdit : 'ROE 35%'. Exemple correct : 'ROE 35% reflète un avantage compétitif structurel sur la distribution, peu capitalistique par nature.'\n"
        "- Si une donnée semble incohérente ou hors-norme (rendement dividende >15%, Altman Z >30, P/E négatif sur une entreprise profitable...), "
        "signale-la explicitement plutôt que de l'utiliser comme argument.\n"
        "- Les risques et catalyseurs doivent être spécifiques à l'entreprise et au secteur, pas génériques ('risque macro', 'hausse des taux').\n"
        "- Le verdict doit identifier le principal point de tension entre haussiers et baissiers, pas une synthèse molle.\n\n"
        "Produis un mémo en Markdown avec exactement ces 5 sections :\n"
        "## Thèse haussière\n3 arguments, chacun ancré dans les données ET expliqué (moat, position concurrentielle, tendance structurelle).\n"
        "## Thèse baissière\n3 arguments, chacun ancré dans les données ET expliqué (pourquoi c'est un vrai risque, pas juste un chiffre élevé).\n"
        "## Risques clés\n2-3 risques spécifiques à cette entreprise/secteur, avec leur mécanisme de transmission au cours.\n"
        "## Catalyseurs potentiels\n2-3 éléments concrets et datables qui pourraient débloquer ou détruire de la valeur.\n"
        "## Verdict\n1-2 phrases qui nomment le principal désaccord entre bulls et bears sur ce titre. "
        "Terminer par : *Analyse factuelle — pas un conseil financier.*"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "\n".join(ctx_lines)},
    ]

    usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0}
    try:
        r = requests.post(
            _API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": _MODEL, "messages": messages, "temperature": 0.3, "max_tokens": 1100},
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        usage = data.get("usage") or {}
        usage_total["prompt_tokens"] = int(usage.get("prompt_tokens") or 0)
        usage_total["completion_tokens"] = int(usage.get("completion_tokens") or 0)
        usage_total["cached_tokens"] = int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        texte = data["choices"][0]["message"]["content"]
        profil = db.get_profil()
        tier = profil.get("tier", "tomino_plus")
        db.add_ia_usage({
            "endpoint": "memo_action",
            "tier": tier,
            "input_tokens": usage_total["prompt_tokens"],
            "output_tokens": usage_total["completion_tokens"],
            "total_tokens": usage_total["prompt_tokens"] + usage_total["completion_tokens"],
            "cost_eur": 0.0,
        })
        return texte, usage_total
    except requests.exceptions.HTTPError as exc:
        code = exc.response.status_code if exc.response is not None else "?"
        return f"[ERREUR] HTTP {code} depuis l'API xAI.", usage_total
    except Exception as e:
        return f"[ERREUR] {e}", usage_total
