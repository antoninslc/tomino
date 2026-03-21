"""
Calculs financiers utilitaires (TRI / XIRR) sans dépendances externes.
"""

from datetime import datetime


def _parse_date(date_str: str):
    try:
        return datetime.strptime(str(date_str).strip(), "%Y-%m-%d").date()
    except Exception:
        return None


def tri(flux):
    """
    Calcule le TRI annualisé (%) par Newton-Raphson.

    Args:
        flux: liste de tuples (date_str "YYYY-MM-DD", montant float)
              montant < 0 = investissement, montant > 0 = encaissement/valeur.

    Returns:
        TRI en %, ou None si non convergent / données invalides.
    """
    if not flux or len(flux) < 2:
        return None

    parsed = []
    for date_str, montant in flux:
        d = _parse_date(date_str)
        if d is None:
            return None
        try:
            m = float(montant)
        except Exception:
            return None
        parsed.append((d, m))

    has_neg = any(m < 0 for _, m in parsed)
    has_pos = any(m > 0 for _, m in parsed)
    if not (has_neg and has_pos):
        return None

    parsed.sort(key=lambda x: x[0])
    t0 = parsed[0][0]

    # Temps en années pour une annualisation réaliste.
    cashflows = [((d - t0).days / 365.25, m) for d, m in parsed]

    def f(r):
        # Domaine valide: r > -1
        if r <= -0.999999:
            return float("inf")
        return sum(m / ((1.0 + r) ** t) for t, m in cashflows)

    def df(r):
        if r <= -0.999999:
            return float("inf")
        s = 0.0
        for t, m in cashflows:
            if t == 0:
                continue
            s += -t * m / ((1.0 + r) ** (t + 1.0))
        return s

    guesses = [0.10, 0.0, 0.25, -0.20]
    tolerance = 1e-7
    max_iter = 100

    for guess in guesses:
        r = guess
        try:
            for _ in range(max_iter):
                fr = f(r)
                dfr = df(r)

                if not (abs(fr) < float("inf") and abs(dfr) < float("inf")):
                    break
                if abs(dfr) < 1e-12:
                    break

                nxt = r - (fr / dfr)
                if nxt <= -0.999999 or nxt > 1000:
                    break

                if abs(nxt - r) < tolerance:
                    return round(nxt * 100.0, 2)

                r = nxt
        except Exception:
            continue

    return None


def tri_position(actif_enrichi):
    """
    TRI annualisé (%) d'une position à partir de:
    - flux initial: -quantite * pru à date_achat
    - flux final: +valeur_actuelle aujourd'hui
    """
    date_achat = str(actif_enrichi.get("date_achat") or "").strip()
    if not _parse_date(date_achat):
        return None

    try:
        qte = float(actif_enrichi.get("quantite") or 0)
        pru = float(actif_enrichi.get("pru") or 0)
        valeur_actuelle = float(actif_enrichi.get("valeur_actuelle") or 0)
    except Exception:
        return None

    investi = qte * pru
    if investi <= 0 or valeur_actuelle <= 0:
        return None

    today = datetime.now().date().isoformat()
    return tri([
        (date_achat, -investi),
        (today, valeur_actuelle),
    ])


def tri_enveloppe(actifs_enrichis):
    """
    TRI annualisé (%) global d'une enveloppe en agrégeant les flux de toutes les positions.
    """
    if not actifs_enrichis:
        return None

    flux_par_date = {}
    valeur_finale = 0.0

    for a in actifs_enrichis:
        date_achat = str(a.get("date_achat") or "").strip()
        if not _parse_date(date_achat):
            continue

        try:
            qte = float(a.get("quantite") or 0)
            pru = float(a.get("pru") or 0)
            valeur_actuelle = float(a.get("valeur_actuelle") or 0)
        except Exception:
            continue

        investi = qte * pru
        if investi <= 0 or valeur_actuelle <= 0:
            continue

        flux_par_date[date_achat] = flux_par_date.get(date_achat, 0.0) - investi
        valeur_finale += valeur_actuelle

    if not flux_par_date or valeur_finale <= 0:
        return None

    today = datetime.now().date().isoformat()
    flux = sorted(flux_par_date.items(), key=lambda x: x[0])
    flux.append((today, valeur_finale))
    return tri(flux)
