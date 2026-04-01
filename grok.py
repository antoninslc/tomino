"""
Module d'analyse patrimoniale via l'API Grok (xAI).
Compatible format OpenAI — utilise requests, pas de SDK.

Niveaux de prompt (tier) :
  "free"   → ultra-compact  : résumé minimal, réponse très courte
  "tier1"  → compact        : bon équilibre profondeur / crédits (défaut payant)
    "tomino_plus"  → complet  : analyse riche, limites explicitées
"""

import json
import os

import requests
from dotenv import load_dotenv

import database as db

load_dotenv()

_API_URL = "https://api.x.ai/v1/chat/completions"
_MODEL   = "grok-3"
_MAX_CONTINUATIONS = 3

# Tokens max par tier (system + user + réponse)
_MAX_TOKENS_PAR_TIER = {
    "free":  512,
    "tier1": 800,
    "tomino_plus": 1200,
}
_CHAT_MAX_TOKENS_PAR_TIER = {
    "free":  400,
    "tier1": 700,
    "tomino_plus": 1000,
}

# Nombre de messages chat conservés par tier
_CHAT_HISTORIQUE_PAR_TIER = {
    "free":  4,
    "tier1": 8,
    "tomino_plus": 12,
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

_SOCLE_TIER1 = (
    "Tu es Tomino Intelligence, un assistant d'analyse patrimoniale.\n"
    "Tu apportes un regard extérieur, critique, pédagogique et factuel sur le patrimoine décrit, "
    "uniquement à partir des données fournies.\n"
    "Tu n'es pas conseiller financier. Tu ne fournis ni conseil personnalisé en investissement, "
    "ni ordre d'achat, ni ordre de vente.\n"
    "Réponds en français de manière claire, structurée et utile.\n"
    "Identifie les points forts, fragilités, concentrations, incohérences éventuelles "
    "et questions à approfondir.\n"
    "N'invente aucune donnée. Signale explicitement les limites ou données manquantes.\n"
    "Adapte la forme au style et au ton demandés par l'utilisateur.\n"
    "Utilise un langage non prescriptif : parle de vigilance, hypothèses, "
    "pistes d'analyse et éléments à examiner.\n"
    "Termine par une phrase courte rappelant qu'il s'agit d'un regard extérieur "
    "et non d'un conseil financier."
)

_SOCLE_TIER2 = (
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

_SOCLES = {"free": _SOCLE_FREE, "tier1": _SOCLE_TIER1, "tomino_plus": _SOCLE_TIER2}

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

# Tiers autorisés (ordre de priorité décroissante)
TIERS_VALIDES = ("free", "tier1", "tomino_plus")


def _tier_valide(tier: str) -> str:
    """Normalise et valide le tier. Replie sur 'free' si inconnu."""
    if tier == "tier2":
        return "tomino_plus"
    return tier if tier in TIERS_VALIDES else "free"


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
    lignes = [
        "=== SNAPSHOT PATRIMONIAL ===",
        f"Valeur totale     : {resume['total']:.2f} €",
        f"Montant investi   : {resume['total_investi']:.2f} €",
        f"Plus-value totale : {resume['pv_total']:+.2f} € ({resume['pv_pct']:+.2f}%)",
        "",
        "--- Allocation par enveloppe ---",
        f"PEA     : {resume['pea']['valeur_actuelle']:.2f} € ({resume['pea']['pct']}%)"
        f"  |  PV {resume['pea']['pv_euros']:+.2f} € ({resume['pea']['pv_pct']:+.2f}%)",
        f"CTO     : {resume['cto']['valeur_actuelle']:.2f} € ({resume['cto']['pct']}%)"
        f"  |  PV {resume['cto']['pv_euros']:+.2f} € ({resume['cto']['pv_pct']:+.2f}%)",
        f"Or      : {resume['or']['valeur_actuelle']:.2f} € ({resume['or']['pct']}%)"
        f"  |  PV {resume['or']['pv_euros']:+.2f} € ({resume['or']['pv_pct']:+.2f}%)",
        f"Livrets : {resume['livrets']['valeur_actuelle']:.2f} € ({resume['livrets']['pct']}%)",
    ]

    if profil:
        lignes.append(_profil_prompt_block(profil))

    if actifs:
        lignes.extend(["", "--- Positions ---"])
        for a in actifs:
            cours = f"{a.get('cours_actuel', '?')} {a.get('devise', '€')}" if a.get("cours_ok") else "cours indisponible"
            pv    = f"{a.get('pv_euros', 0):+.2f} € ({a.get('pv_pct', 0):+.2f}%)" if a.get("cours_ok") else "—"
            tri   = a.get("tri")
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
        tier         : "free" | "tier1" | "tomino_plus" (alias entrant: "tier2")

    Returns:
        Texte de l'analyse, ou message d'erreur préfixé par "[ERREUR]".
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
            choice = data["choices"][0]
            chunk = choice["message"]["content"].strip()
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
    except requests.exceptions.HTTPError:
        reponse = f"[ERREUR] Réponse HTTP {r.status_code} de l'API xAI : {r.text[:300]}"
    except requests.exceptions.RequestException as e:
        reponse = f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except (KeyError, IndexError, ValueError) as e:
        reponse = f"[ERREUR] Réponse inattendue de l'API : {e}"

    db.save_analyse(type_analyse, contexte, reponse)
    return reponse


def _construire_prompt_chat(resume: dict, profil: dict) -> str:
    """Prompt système pour le chat conversationnel."""
    contexte = _construire_contexte_chat_compact(resume, profil)
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


def _construire_contexte_chat_compact(resume: dict, profil: dict) -> str:
    """Contexte compact pour le chat afin de limiter les tokens envoyés à chaque tour."""
    secteurs = profil.get("secteurs_exclus") or []
    pays = profil.get("pays_exclus") or []
    secteurs_txt = ", ".join(str(s) for s in secteurs) if isinstance(secteurs, list) and secteurs else "Aucun"
    pays_txt = ", ".join(str(p) for p in pays) if isinstance(pays, list) and pays else "Aucun"

    return "\n".join([
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
    ])


def chat(historique_messages: list, resume: dict, tier: str = "free") -> str:
    """
    Chat éphémère avec Grok sans persistance DB.

    Args:
        historique_messages: liste de messages {"role": "user"|"assistant", "content": "..."}
        resume: dict retourné par calcul_resume()
        tier: "free" | "tier1" | "tomino_plus" (alias entrant: "tier2")

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
    prompt_systeme = _construire_prompt_chat(resume, profil)

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
            return "[ERREUR] Réponse vide de l'API xAI."
        return reponse
    except requests.exceptions.HTTPError:
        return f"[ERREUR] Réponse HTTP {r.status_code} de l'API xAI : {r.text[:300]}"
    except requests.exceptions.RequestException as e:
        return f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except (KeyError, IndexError, ValueError) as e:
        return f"[ERREUR] Réponse inattendue de l'API : {e}"


def chat_stream(historique_messages: list, resume: dict, tier: str = "free"):
    """
    Chat éphémère en streaming : génère des morceaux de texte au fil de l'eau.

    Args:
        historique_messages: liste de messages {"role": "user"|"assistant", "content": "..."}
        resume: dict retourné par calcul_resume()
        tier: "free" | "tier1" | "tomino_plus" (alias entrant: "tier2")

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
    prompt_systeme = _construire_prompt_chat(resume, profil)

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

    try:
        for continuation_idx in range(_MAX_CONTINUATIONS + 1):
            payload = {
                "model": _MODEL,
                "messages": messages,
                "temperature": 0.4,
                "max_tokens": max_tokens,
                "stream": True,
            }

            chunk_parts = []
            finish_reason = ""

            with requests.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60,
                stream=True,
            ) as r:
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

                    choices = evt.get("choices") or []
                    if not choices:
                        continue

                    choice = choices[0]
                    delta = (choice.get("delta") or {}).get("content")
                    if delta:
                        text = str(delta)
                        chunk_parts.append(text)
                        yield text

                    fr = choice.get("finish_reason")
                    if fr:
                        finish_reason = str(fr)

            chunk = "".join(chunk_parts).strip()

            if finish_reason != "length":
                break

            if not chunk:
                break

            if continuation_idx >= _MAX_CONTINUATIONS:
                yield "\n\n[Réponse tronquée: limite de longueur atteinte.]"
                break

            messages.append({"role": "assistant", "content": chunk})
            messages.append({
                "role": "user",
                "content": "Continue exactement où tu t'es arrêté, sans répéter ce qui précède. Termine proprement ta réponse.",
            })

    except requests.exceptions.HTTPError:
        yield f"[ERREUR] Réponse HTTP {r.status_code} de l'API xAI : {r.text[:300]}"
    except requests.exceptions.RequestException as e:
        yield f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except Exception as e:
        yield f"[ERREUR] Flux inattendu de l'API : {e}"


def stock_chat_stream(historique_messages: list, stock_data: dict, tier: str = "free"):
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

    context = f"""Tu es un assistant d'analyse boursière intégré à Tomino, application de gestion de patrimoine.
Tu analyses l'action suivante et tu réponds aux questions de l'utilisateur à son sujet.
Ton : {"décontracté mais précis" if ton == "informel" else "professionnel et rigoureux"}.
Style : {"détaillé avec explications" if style == "detaille" else "synthétique"}.

=== ACTION ANALYSÉE : {nom} ({ticker}) ===
Secteur : {stock_data.get("secteur") or "N/D"} | Industrie : {stock_data.get("industrie") or "N/D"} | Pays : {stock_data.get("pays") or "N/D"}
Cours actuel : {val(stock_data.get("cours"))} {stock_data.get("devise","")} | Variation jour : {pct(stock_data.get("variation_jour"))}
52 semaines — Haut : {val(stock_data.get("cours_52w_haut"))} | Bas : {val(stock_data.get("cours_52w_bas"))}
Capitalisation : {eur_m(stock_data.get("capitalisation"))} | Bêta : {val(stock_data.get("beta"))}

VALORISATION
P/E trailing : {val(stock_data.get("pe_trailing"))} | P/E forward : {val(stock_data.get("pe_forward"))}
P/B : {val(stock_data.get("pb"))} | P/S : {val(stock_data.get("ps"))} | EV/EBITDA : {val(stock_data.get("ev_ebitda"))} | PEG : {val(stock_data.get("peg"))}

SANTÉ FINANCIÈRE
Marge nette : {pct(stock_data.get("marge_nette"))} | Marge opérationnelle : {pct(stock_data.get("marge_operationnelle"))}
ROE : {pct(stock_data.get("roe"))} | ROA : {pct(stock_data.get("roa"))}
Dette/Capitaux : {val(stock_data.get("dette_capitaux"))} | Current ratio : {val(stock_data.get("current_ratio"))}

CROISSANCE
CA (YoY) : {pct(stock_data.get("croissance_ca"))} | Bénéfices (YoY) : {pct(stock_data.get("croissance_benefices"))}

DIVIDENDE
Rendement : {pct(stock_data.get("rendement_div"))} | Taux distribution : {pct(stock_data.get("taux_distribution"))}

CONSENSUS ANALYSTES ({stock_data.get("nb_analystes", 0)} analystes)
Recommandation : {stock_data.get("recommandation") or "N/D"}
Objectif moyen : {val(stock_data.get("objectif_moyen"))} | Haut : {val(stock_data.get("objectif_haut"))} | Bas : {val(stock_data.get("objectif_bas"))}

PROFIL INVESTISSEUR
Horizon : {profil.get("horizon","N/D")} | Risque : {profil.get("risque","N/D")} | Objectif : {profil.get("objectif","N/D")}

Réponds aux questions sur cette action. Si l'utilisateur demande une opinion d'investissement, rappelle toujours que tu n'es pas conseiller financier et que c'est sa décision finale.
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

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        for continuation_idx in range(_MAX_CONTINUATIONS + 1):
            payload = {"model": _MODEL, "messages": messages, "max_tokens": max_tokens, "stream": True}
            r = requests.post(_API_URL, json=payload, headers=headers, stream=True, timeout=60)
            r.raise_for_status()
            chunk = ""
            for line in r.iter_lines():
                if not line:
                    continue
                text = line.decode("utf-8") if isinstance(line, bytes) else line
                if text.startswith("data:"):
                    raw = text[5:].strip()
                    if raw == "[DONE]":
                        return
                    try:
                        delta = json.loads(raw)["choices"][0]["delta"].get("content", "")
                        chunk += delta
                        yield delta
                    except Exception:
                        continue
            finish = None
            try:
                finish = json.loads(raw)["choices"][0].get("finish_reason")
            except Exception:
                pass
            if finish != "length":
                return
            if continuation_idx >= _MAX_CONTINUATIONS:
                yield "\n\n[Réponse tronquée]"
                break
            messages.append({"role": "assistant", "content": chunk})
            messages.append({"role": "user", "content": "Continue."})
    except requests.exceptions.HTTPError as exc:
        r_ref = exc.response
        code = r_ref.status_code if r_ref is not None else "?"
        yield f"[ERREUR] HTTP {code} depuis l'API xAI."
    except requests.exceptions.RequestException as e:
        yield f"[ERREUR] Impossible de joindre l'API xAI : {e}"
    except Exception as e:
        yield f"[ERREUR] {e}"
