# Tomino — Suivi de patrimoine local-first

> Application desktop de gestion patrimoniale personnelle. Gratuit, local-first, sans abonnement obligatoire.

---

## Pourquoi Tomino ?

La plupart des outils de suivi patrimonial sont des SaaS : vos données partent dans le cloud dès l'ouverture du compte. Tomino fonctionne à l'inverse — **toutes vos données restent sur votre machine**. Pas de compte requis, pas de connexion bancaire, pas d'import de fichiers sensibles.

---

## Fonctionnalités

**Suivi multi-supports**
- Actions, ETF, fonds (cours temps réel via Yahoo Finance)
- Livrets (LEP, LDD, PEL, Livret A…) avec calcul des intérêts
- Assurance vie
- Or physique (cotation en temps réel)
- Comptes en devises étrangères

**Analyse et visualisation**
- Tableau de bord : valeur totale, performance globale, allocation
- Graphiques d'évolution, répartition par classe d'actifs
- Benchmark vs MSCI World / CAC 40 / S&P 500
- Suivi des dividendes

**Outils**
- Alertes de cours (seuils haut/bas par actif)
- Analyse IA du portefeuille (via Grok / xAI — nécessite une clé API)
- Récapitulatif fiscal annuel (plus-values, dividendes)
- Aide à la déclaration des comptes étrangers (formulaire 3916)
- Export PDF patrimonial, CSV mouvements/dividendes/fiscal
- Sauvegarde/restauration locale (`.tomino-backup`)

**Confidentialité**
- 100% local par défaut — aucune donnée ne quitte votre appareil
- Pas de connexion bancaire, tout est saisi manuellement
- Synchronisation cloud optionnelle (Tomino+) avec chiffrement bout en bout

---

## Téléchargement

👉 **[Releases GitHub](../../releases/latest)** — Windows x64 (`.exe` NSIS installer)

Aucun compte requis pour utiliser l'application. L'installeur ne nécessite pas de droits administrateur.

> **Note SmartScreen :** Windows peut afficher un avertissement "éditeur inconnu" car l'exécutable n'est pas encore signé. Cliquez sur "Informations complémentaires" → "Exécuter quand même". Le code source est entièrement disponible ici pour vérification.

---

## Stack technique

| Composant | Technologie |
|---|---|
| UI | React 18 + Tailwind CSS |
| Desktop | Tauri v1 (Rust) |
| Backend | Python 3.11 + Flask |
| Base de données | SQLite (locale, fichier `patrimoine.db`) |
| Cours boursiers | Yahoo Finance (HTTP public) |
| IA | xAI Grok (optionnel, clé API personnelle) |
| Paiement | Stripe (pour Tomino+ uniquement) |

---

## Lancer en mode développement

**Prérequis :** Python 3.11+, Node.js 18+, Rust

```bash
# Backend
pip install -r requirements.txt
python app.py

# Frontend (dans un autre terminal)
cd front
npm install
npm run dev
```

Copier `.env.example` en `.env` et renseigner les clés nécessaires (seul `XAI_API_KEY` est requis pour les fonctionnalités IA).

Pour compiler l'installeur Windows, voir [INSTALLATION.md](INSTALLATION.md).

---

## Licence

Source available — usage personnel libre. Usage commercial interdit sans autorisation. Voir [LICENSE](LICENSE).
