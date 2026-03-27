# Tomino — Instructions pour GitHub Copilot

> Source de vérité unique pour toutes les sessions Copilot.
> Lire ce fichier ENTIÈREMENT avant toute modification du projet.

---

## Vision produit

Tomino est un outil de **supervision de patrimoine financier personnel**.
- L'IA (Grok) est additionnelle, jamais obligatoire
- Pas de connexion bancaire automatique — saisie manuelle uniquement
- Données 100% locales (SQLite sur le PC de l'utilisateur)
- Cible : investisseurs autonomes français (PEA, CTO, Or, Livrets)

---

## Stack technique

### Backend
| Composant | Technologie | Version |
|---|---|---|
| Serveur | Python + Flask | 3.x |
| Base de données | SQLite (natif `sqlite3`) | — |
| Cours financiers | Yahoo Finance HTTP direct | — |
| IA | Grok API (xAI) — format OpenAI | grok-3 |
| Emails transactionnels | Resend API | — |
| Calculs financiers | Module `calculs.py` maison | — |
| CORS | flask-cors | — |
| Timezone | `zoneinfo` (stdlib Python 3.9+) | — |

### Frontend
| Composant | Technologie | Version |
|---|---|---|
| Framework | React | 18.3 |
| Routing | React Router DOM | 6.23 |
| Build | Vite | 5.2 |
| CSS | Tailwind CSS | 3.4 |
| Graphiques | Recharts | 2.12 |
| Markdown | marked | 17.x |

---

## Structure des fichiers

```
tomino_track/
├── app.py              ← API Flask pure JSON, schedulers, helpers
├── database.py         ← SQLite init + toutes les fonctions CRUD
├── prices.py           ← Cours Yahoo Finance, cache, benchmark, alertes
├── grok.py             ← Appels API xAI (analyser, chat, chat_stream)
├── emails.py           ← Envoi emails transactionnels (Resend)
├── calculs.py          ← TRI (Newton-Raphson, stdlib uniquement)
├── requirements.txt    ← Dépendances Python
├── start.bat           ← Lance Flask + Vite en un double-clic
├── STRIPE_DEV.md       ← Procédure Stripe CLI + tests webhooks en local
├── .env                ← XAI_API_KEY (ne jamais committer)
├── .gitignore          ← .venv, __pycache__, patrimoine.db, .env, node_modules
    ├── build_desktop.bat   ← Build React + Tauri + installeur Windows
    ├── INSTALLATION.md     ← Guide installation, prérequis, update/désinstall
│
└── front/
    ├── package.json
    ├── vite.config.js  ← proxy /api → localhost:5000
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx         ← routing, onboarding check, Topbar
        ├── api.js          ← client HTTP centralisé (get/post/put/del)
        ├── index.css       ← Tailwind + classes custom (card, stat, tbl-wrap...)
        ├── components/
        │   ├── Sidebar.jsx      ← navigation, statut marché temps réel
        │   ├── Topbar.jsx       ← barre supérieure (intégrée dans App.jsx)
        │   ├── DemoBanner.jsx   ← bandeau démo (visible si is_demo=1), bouton quitter la démo
        │   └── CustomSelect.jsx ← menu déroulant custom (style unifié, sans select natif)
        └── pages/
            ├── Welcome.jsx        ← accueil 1er lancement (Créer / Visite libre / Connexion)
            ├── Dashboard.jsx      ← vue d'ensemble, historique, allocation
            ├── Portefeuille.jsx   ← PEA/CTO/Or avec benchmark et TRI
            ├── ActifForm.jsx      ← ajout/modification actif, autocomplete ticker
            ├── Livrets.jsx        ← livrets réglementés
            ├── AssuranceVie.jsx   ← contrats assurance vie (fonds euros / UC / mixte)
            ├── Dividendes.jsx     ← suivi des dividendes reçus
            ├── Alertes.jsx        ← alertes sur seuils de prix
            ├── Repartition.jsx    ← répartition géographique/sectorielle
            ├── AnalyseIA.jsx      ← 3 modes d'analyse Grok
            ├── Chat.jsx           ← chat streaming avec Grok
            ├── Onboarding.jsx     ← questionnaire 5 étapes (accessible depuis Welcome)
            └── Settings.jsx       ← paramètres profil investisseur + assistant fiscal 3916
```

---

## Prérequis build desktop Windows

Pour compiler ou packager Tomino Desktop (Tauri), il faut les outils C++ MSVC (link.exe).
Installer via :

    winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --nocache --installPath C:\BuildTools --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

Après installation, ferme/réouvre le terminal avant de relancer le build.

## Base de données SQLite

### Table `actifs`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
enveloppe TEXT NOT NULL          -- "PEA" | "CTO" | "OR"
nom TEXT NOT NULL
ticker TEXT                      -- ticker Yahoo Finance (ex: AIR.PA)
quantite REAL NOT NULL DEFAULT 0
pru REAL NOT NULL DEFAULT 0      -- Prix de Revient Unitaire
type TEXT DEFAULT 'action'       -- "action" | "etf" | "or"
categorie TEXT DEFAULT 'coeur'   -- "coeur" | "satellite" (PEA uniquement)
date_achat TEXT                  -- format YYYY-MM-DD
notes TEXT
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))
```

### Table `livrets`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
nom TEXT NOT NULL
capital REAL NOT NULL DEFAULT 0
taux REAL NOT NULL DEFAULT 0     -- taux annuel en %
date_maj TEXT
notes TEXT
created_at TEXT, updated_at TEXT
```

### Table `historique`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
date TEXT NOT NULL               -- format YYYY-MM-DD, un seul snapshot/jour
valeur_totale REAL
valeur_pea REAL
valeur_cto REAL
valeur_or REAL
valeur_livrets REAL
```

### Table `analyses`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
date TEXT DEFAULT (datetime('now'))
type_analyse TEXT                -- "performance" | "arbitrage" | "risques"
contexte TEXT                    -- snapshot patrimonial envoyé à Grok
reponse TEXT                     -- réponse Markdown de Grok
```

### Table `profil`
```sql
id INTEGER PRIMARY KEY DEFAULT 1  -- toujours 1 seule ligne (INSERT OR REPLACE)
horizon TEXT DEFAULT 'long'        -- "court" | "moyen" | "long"
risque TEXT DEFAULT 'equilibre'    -- "prudent" | "equilibre" | "dynamique" | "speculatif"
objectif TEXT DEFAULT 'croissance' -- "croissance" | "revenus" | "preservation"
strategie TEXT DEFAULT 'mixte'     -- "passive" | "mixte" | "active"
style_ia TEXT DEFAULT 'detaille'   -- "concis" | "detaille"  ← forme de la réponse Grok
ton_ia TEXT DEFAULT 'informel'     -- "formel" | "informel"  ← forme de la réponse Grok
secteurs_exclus TEXT DEFAULT '[]'  -- JSON array
pays_exclus TEXT DEFAULT '[]'      -- JSON array
benchmark TEXT DEFAULT 'CW8.PA'   -- ticker Yahoo du benchmark
tier TEXT DEFAULT 'free'           -- "free" | "tier1" | "tier2" ← niveau de prompt Grok
is_demo INTEGER DEFAULT 0          -- 1 = mode découverte actif (données fictives injectées)
```

### Table `dividendes`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
ticker TEXT
nom TEXT NOT NULL
montant REAL NOT NULL
montant_brut REAL                 -- montant brut encaissé
retenue_source REAL               -- retenue à la source prélevée
montant_net REAL                  -- montant net encaissé
pays_source TEXT                  -- pays de la source
devise_source TEXT DEFAULT 'EUR'  -- devise de source
date_versement TEXT NOT NULL     -- format YYYY-MM-DD
enveloppe TEXT
notes TEXT
created_at TEXT DEFAULT (datetime('now'))
```

### Table `alertes`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
ticker TEXT NOT NULL
nom TEXT
type_alerte TEXT NOT NULL        -- "hausse" | "baisse"
seuil REAL NOT NULL
active INTEGER DEFAULT 1         -- 1 = active, 0 = déclenchée
declenchee_le TEXT
created_at TEXT DEFAULT (datetime('now'))
```

### Table `ia_usage`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
endpoint TEXT NOT NULL           -- "chat" | "analyse"
tier TEXT NOT NULL               -- "free" | "tier1" | "tier2"
input_tokens INTEGER DEFAULT 0
output_tokens INTEGER DEFAULT 0
total_tokens INTEGER DEFAULT 0
cost_eur REAL DEFAULT 0
created_at TEXT DEFAULT (datetime('now'))
```

### Table `assurance_vie`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
nom TEXT NOT NULL
assureur TEXT
type_support TEXT DEFAULT 'mixte'  -- "fonds_euros" | "uc" | "mixte"
versements REAL NOT NULL DEFAULT 0
valeur_actuelle REAL NOT NULL DEFAULT 0
date_maj TEXT
notes TEXT
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))
```

### Table `users`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
email TEXT NOT NULL UNIQUE
password_hash TEXT NOT NULL
auth_provider TEXT NOT NULL DEFAULT 'local' -- "local" | "supabase" | "oidc"
provider_user_id TEXT                        -- id utilisateur côté provider (NULL en local)
tier TEXT NOT NULL DEFAULT 'free'   -- "free" | "tier1" | "tier2"
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))
```

### Table `user_sessions`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL
token_hash TEXT NOT NULL UNIQUE
device_id TEXT
device_label TEXT
created_at TEXT DEFAULT (datetime('now'))
expires_at TEXT NOT NULL
revoked_at TEXT
```

### Table `password_reset_tokens`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL
token_hash TEXT NOT NULL UNIQUE
expires_at TEXT NOT NULL
used_at TEXT
created_at TEXT DEFAULT (datetime('now'))
```

### Table `devices`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL
device_id TEXT NOT NULL
device_label TEXT
sync_paused INTEGER NOT NULL DEFAULT 0
last_sync_cursor INTEGER NOT NULL DEFAULT 0
last_seen_at TEXT
revoked_at TEXT
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))
```

### Table `user_subscriptions`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER NOT NULL
provider TEXT NOT NULL                    -- "local" | "stripe"
provider_customer_id TEXT
provider_subscription_id TEXT
tier TEXT NOT NULL DEFAULT 'free'         -- "free" | "tier1" | "tier2"
status TEXT NOT NULL DEFAULT 'active'     -- ex: active, trialing, canceled, past_due
current_period_end TEXT
metadata_json TEXT
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))
```

### Table `sync_events`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
user_id INTEGER                     -- utilisateur propriétaire de l'événement (NULL en local pur)
device_id TEXT                      -- appareil source de l'événement
event_uid TEXT NOT NULL             -- identifiant d'événement (déduplication scoped user)
entity_type TEXT NOT NULL           -- table métier (actifs, livrets, ...)
entity_id TEXT NOT NULL             -- id de l'entité concernée
operation TEXT NOT NULL             -- "upsert" | "delete"
payload TEXT NOT NULL               -- snapshot JSON de la ligne
event_at TEXT NOT NULL              -- horodatage UTC (ISO-8601)
source TEXT NOT NULL DEFAULT 'local'-- origine (local / appareil distant)
applied INTEGER NOT NULL DEFAULT 1  -- 1=appliqué, 0=ignoré (conflit)
conflict_reason TEXT                -- ex: "stale_event"
created_at TEXT DEFAULT (datetime('now'))
```

---

## Routes API Flask (toutes retournent du JSON)

### Système
| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des endpoints disponibles |
| GET | `/api/status` | Statut marché, dernière MAJ, prochaine MAJ |
| POST | `/api/rafraichir` | Vide cache + sauvegarde snapshot |

### Authentification
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Crée un compte (email + mot de passe) et ouvre une session |
| POST | `/api/auth/login` | Ouvre une session utilisateur |
| POST | `/api/auth/password-reset/request` | Demande une réinitialisation de mot de passe |
| POST | `/api/auth/password-reset/confirm` | Confirme la réinitialisation avec token |
| POST | `/api/auth/provider/link` | Lie un compte local à une identité provider (`supabase`/`oidc`) |
| POST | `/api/auth/logout` | Révoque la session courante |
| POST | `/api/auth/logout-all` | Révoque toutes les autres sessions de l'utilisateur connecté |
| GET | `/api/auth/me` | Retourne l'utilisateur connecté |

### Appareils & contrôle sync
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/devices` | Liste les appareils connectés de l'utilisateur |
| POST | `/api/devices/rename` | Renomme l'étiquette d'un appareil |
| POST | `/api/devices/revoke` | Révoque un appareil distant |
| POST | `/api/sync/pause` | Met en pause la synchronisation pour un appareil |
| POST | `/api/sync/resume` | Reprend la synchronisation pour un appareil |

### Forfaits & facturation
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/plans` | Liste des forfaits Free / Tomino + et état provider |
| GET | `/api/billing/subscription` | Abonnement courant de l'utilisateur connecté |
| POST | `/api/billing/change-plan` | Changement de forfait (mode local direct, downgrade Stripe) |
| POST | `/api/billing/checkout-session` | Crée une session Stripe Checkout pour Tomino + |
| POST | `/api/billing/portal-session` | Crée une session Stripe Customer Portal pour gérer l'abonnement |
| POST | `/api/billing/webhook` | Webhook Stripe (activation, mise à jour/résiliation, paiements facture + emails transactionnels) |

### Synchronisation
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/sync/events?since=0&limit=200` | Polling des événements de sync (journal local) |
| POST | `/api/sync/events/apply` | Applique un lot d'événements distants (résolution horodatée) |

### Actifs
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/actifs?env=PEA` | Actifs enrichis + stats + coeur/satellite |
| GET | `/api/actifs/all` | Tous les actifs toutes enveloppes |
| POST | `/api/actifs` | Crée (ou fusionne si ticker existant) |
| PUT | `/api/actifs/<id>` | Modifie un actif |
| DELETE | `/api/actifs/<id>` | Supprime un actif |
| GET | `/api/position_existante?ticker=X&env=PEA` | Vérifie si position existe |
| GET | `/api/search?q=airbus` | Autocomplete Yahoo Finance |

### Livrets
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/livrets` | Liste + total + stats intérêts |
| POST | `/api/livrets` | Crée un livret |
| PUT | `/api/livrets/<id>` | Modifie |
| DELETE | `/api/livrets/<id>` | Supprime |

### Assurance vie
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/assurance-vie` | Liste des contrats + stats globales |
| POST | `/api/assurance-vie` | Crée un contrat |
| PUT | `/api/assurance-vie/<id>` | Modifie un contrat |
| DELETE | `/api/assurance-vie/<id>` | Supprime un contrat |

### Dividendes
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/dividendes` | Liste + stats (total année, total all, par mois) |
| POST | `/api/dividendes` | Ajoute un versement |
| PUT | `/api/dividendes/<id>` | Modifie un versement |
| GET | `/api/dividendes/sync` | Importe automatiquement les dividendes Yahoo |
| DELETE | `/api/dividendes/<id>` | Supprime |

### Alertes
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/alertes` | Toutes les alertes (actives + déclenchées) |
| POST | `/api/alertes` | Crée une alerte |
| DELETE | `/api/alertes/<id>` | Supprime |
| GET | `/api/alertes/check` | Vérifie les alertes, retourne les déclenchées |

### Fiscalité (comptes étrangers)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/comptes-etrangers` | Liste complète des comptes étrangers |
| POST | `/api/comptes-etrangers` | Ajoute un compte étranger |
| PUT | `/api/comptes-etrangers/<id>` | Modifie un compte étranger |
| DELETE | `/api/comptes-etrangers/<id>` | Supprime un compte étranger |
| GET | `/api/comptes-etrangers/declaration?annee=2025` | Comptes à déclarer pour le formulaire 3916 (année fiscale) |
| GET | `/api/fiscal?annee=2025` | Récapitulatif fiscal : dividendes bruts et PV/MV réalisées par année |

### Finance
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/resume` | Résumé patrimonial complet |
| GET | `/api/historique` | 90 derniers snapshots |
| GET | `/api/cours/<ticker>` | Cours actuel d'un ticker |
| GET | `/api/benchmark?ticker=CW8.PA&depuis=2024-01-01` | Perf benchmark |
| GET | `/api/repartition?env=PEA` | Répartition géo/sectorielle |

### Profil, IA & Démo
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/profil` | Retourne le profil investisseur (inclut `is_demo`) |
| POST | `/api/profil` | Sauvegarde profil — efface les données démo si `is_demo=1` avant de sauver |
| GET | `/api/ia/quota` | Consommation IA hebdomadaire (chat + analyse) |
| POST | `/api/grok/analyser` | Lance une analyse (body: `{type_analyse}`) |
| GET | `/api/grok/historique` | 20 dernières analyses |
| POST | `/api/chat` | Chat simple (non-streaming) |
| POST | `/api/chat/stream` | Chat streaming SSE |
| POST | `/api/demo/inject` | Injecte les données fictives de démo (actifs PEA, livrets, 30 jours d'historique) et passe `is_demo=1` |
| POST | `/api/demo/reset` | Purge toutes les données métier et remet `is_demo=0` (retour à l'état vierge) |

---

## Conventions de code

### Backend Python
- **Pas d'ORM** — SQL brut uniquement via `sqlite3`
- **Pas de yfinance** — appels HTTP directs à Yahoo Finance via `prices.py` (session HTTP thread-local)
- **Enrichissement actifs** : toujours passer par `prices.enrichir_actifs()` puis `calculs.tri_position()` via `_enrichir_avec_tri()` dans app.py
- **Helpers app.py** : utiliser `_clean_env()`, `_to_float()`, `_actif_payload()` etc.
- **Profil injecté dans Grok** : `grok.analyser()`, `grok.chat()` et `grok.chat_stream()` appellent `db.get_profil()` automatiquement
- **Tier Grok** : lu depuis `db.get_profil()["tier"]` côté serveur uniquement — jamais depuis le client. Valeurs : `"free"` | `"tier1"` | `"tier2"`. `save_profil()` valide et refuse tout tier inconnu.
- **Édition des mouvements** : `PUT /api/mouvements/<id>` supporte l'édition des **achats et ventes** avec recalcul de la position et de la PV réalisée pour les ventes.
- **Quota IA hebdomadaire** : budget global chat + analyse = **0,25 € / semaine** (fenêtre lundi 00:00 → lundi suivant, timezone Paris).
- **Blocage quota** : les routes `/api/grok/analyser`, `/api/chat` et `/api/chat/stream` refusent les appels en **HTTP 429** quand le budget est atteint, avec message de reprise (`next_reset`).
- **Tracking IA** : chaque appel IA réussi enregistre une ligne dans `ia_usage` (tokens estimés entrée/sortie + coût estimé).
- **Tarif estimé** : coût basé sur `XAI_COST_EUR_PER_1K_TOKENS` (défaut `0.002`) ; ajustable via `.env`.
- Snapshot journalier automatique à 17h30 via `_snapshot_scheduler()`
- Rafraîchissement des cours toutes les 2 min pendant heures de marché via `_cours_scheduler()`
- Purge cache prix sélective: suppression des entrées > 60 secondes via `prices.vider_cache_ancien(max_age=60)`
- Fetch des cours en batch parallèle avec déduplication des tickers via `prices.get_prix_many()`
- Cache court du résumé patrimonial (`calcul_resume`) pendant 30 secondes avec invalidation ciblée sur les routes de mutation
- Backups `.tomino-backup` : inclure `manifest.json` avec `format`, `version`, `schema_version`, `db_sha256` et `db_size`.
- Import backup : vérifier l'intégrité (ZIP + manifest + SHA-256 + tables métiers) **et** la compatibilité de schéma.
- Compatibilité de schéma : refuser un backup dont `schema_version` est supérieur à la version supportée par l'app ; appliquer `init_db()` après import pour exécuter les migrations non destructives vers le schéma courant.
- Source de vérité du schéma : `database.SCHEMA_VERSION` et `database.SCHEMA_MIN_IMPORT_VERSION` + méta-table `tomino_meta` (`schema_version`).
- Chiffrement backup optionnel : `POST /api/export/backup` avec `password` chiffre la sauvegarde ; vérification/import nécessitent le même mot de passe (`/api/import/backup/verify` et `/api/import/backup`).
- Sync événements : chaque mutation métier enregistre un événement dans `sync_events` avec snapshot JSON.
- Résolution de conflits sync : last-write-wins horodaté (`event_at`) ; un événement plus ancien est conservé avec `applied=0` et `conflict_reason="stale_event"`.
- Auth Phase A : sync cloud protégée par token de session (header `Authorization: Bearer <token>` ou `X-Auth-Token`).
- Free local-first : aucun compte requis pour les routes locales ; auth nécessaire uniquement pour les routes sync cloud.
- Entitlements Tomino + : les routes sync/appareils sont refusées en `HTTP 403` si `users.tier="free"`.
- Facturation : provider configurable via `TOMINO_BILLING_PROVIDER` (`local` par défaut, `stripe` si activé).
- Stripe (optionnel) : config via `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TIER1`, `STRIPE_PRICE_TIER2`, `STRIPE_PORTAL_RETURN_URL` (+ URLs success/cancel).
- Emails transactionnels (optionnel) : config via `RESEND_API_KEY` et `RESEND_FROM_EMAIL` ; envoi via `emails.py`.
- Webhooks Stripe gérés : `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- `checkout.session.completed` : met à jour le tier + abonnement et envoie un email de bienvenue (`emails.send_welcome`).
- `invoice.payment_succeeded` : envoie un email de confirmation de paiement (`emails.send_payment_confirmed`).
- `invoice.payment_failed` : envoie un email d'échec de paiement (`emails.send_payment_failed`).
- `customer.subscription.deleted` : conserve la logique de downgrade existante et ajoute l'email de confirmation d'annulation (`emails.send_cancellation_confirmed`).
- Helper DB utilisé pour les webhooks facture : `database.get_user_subscription_by_provider_customer(provider, customer_id)`.
- Si `RESEND_API_KEY` est vide/invalide : les emails sont ignorés avec un log WARNING côté Flask.
- Mode local billing : `POST /api/billing/change-plan` applique immédiatement le tier (sans paiement).
- Phase B devices : sessions liées à `device_id`, listing/révocation d'appareils, pause/reprise sync par appareil, et blocage des endpoints sync si l'appareil est en pause.
- Phase C scoping sync : `sync_events` scindé par `user_id` + `device_id`, polling/apply filtrés par utilisateur authentifié, déduplication par (`user_id`, `event_uid`).
- Phase E sécurité auth : rate limit login en mémoire (fenêtre glissante + blocage temporaire), audit minimal des événements auth (`auth_audit_logs`), endpoint `POST /api/auth/logout-all`, et rotation des sessions actives côté serveur.
- Reset mot de passe : endpoint `POST /api/auth/password-reset/request` (réponse générique anti-énumération) + `POST /api/auth/password-reset/confirm` (token expirant + invalidation des sessions).
- Préparation migration auth provider : le schéma `users` expose `auth_provider` et `provider_user_id` pour une transition progressive sans casser les comptes `local`.
- Endpoint de liaison provider : `POST /api/auth/provider/link` pour associer un compte local à une identité `supabase`/`oidc`.
- Pour les tests backend, désactiver les tâches de fond au boot avec `TOMINO_DISABLE_STARTUP_TASKS=1`
- Timezone Paris via `zoneinfo.ZoneInfo("Europe/Paris")`

### Qualité backend (tests)
- Répertoire de tests : `tests/` (suite `unittest` stdlib)
- Exécution recommandée : `.venv\Scripts\python.exe -m unittest discover -s tests -v`
- Raccourci Windows : `start.bat test`
- État actuel de la suite : les tests backend auth/devices/sync sont verts (23 tests ciblés).
- Fichiers de tests en place :
    - `tests/test_backend_api.py` : validation API dividendes (création invalide + mise à jour)
    - `tests/test_database_fiscal.py` : calculs fiscaux (`get_fiscal_summary`) + rapprochement IFU
    - `tests/test_actifs_resume_cache.py` : opérations actifs/mouvements + non-régression cache `/api/resume`
    - `tests/test_sync_events.py` : journal sync + polling + résolution de conflits horodatée
    - `tests/test_auth_api.py` : flux auth (register/login/me/logout), rate limit login, logout-all, audit auth, rotation des sessions
    - `tests/test_devices_api.py` : gestion des appareils (liste/révocation) + pause/reprise sync
- Couverture minimale attendue sur les évolutions backend :
    - validation API (codes HTTP + messages d'erreur)
    - calculs fiscaux (`database.get_fiscal_summary`)
    - mutations actifs/mouvements (quantité, PRU, PV réalisée)
    - édition/suppression de mouvements (cas nominal + cas d'échec métier)
    - non-régression cache résumé (`/api/resume` + invalidation ciblée)

### Logique tiers IA (grok.py)

Grok ne se présente jamais comme un conseiller financier. Il apporte un **regard extérieur**.
Chaque réponse se termine par un rappel court : regard extérieur, pas un conseil financier.

| Tier | Rôle produit | Tokens max analyse | Tokens max chat | Historique chat |
|---|---|---|---|---|
| `free` | Ultra-compact — consommation minimale | 512 | 400 | 4 messages |
| `tier1` | Compact — bon équilibre profondeur / crédits | 800 | 700 | 8 messages |
| `tier2` | Complet — analyse riche, limites explicitées | 1200 | 1000 | 12 messages |

Continuité anti-troncature :
- `analyser()`, `chat()` et `chat_stream()` gèrent les réponses coupées (`finish_reason="length"`) avec continuation automatique contrôlée (`_MAX_CONTINUATIONS`).

Structure du prompt pour chaque appel :
1. **Socle système** — rôle non-conseil + règles de forme (varie selon tier)
2. **Module métier** — objectif spécifique selon type d'analyse (identique pour tous les tiers)
3. **Bloc profil** — horizon, risque, objectif, stratégie, style, ton, exclusions, benchmark (injecté dans le contexte patrimonial)
4. **Contexte patrimonial** — snapshot chiffré structuré

Règles de séparation des responsabilités du profil :
- `horizon`, `risque`, `objectif`, `strategie`, `secteurs_exclus`, `pays_exclus` → influencent le **fond** (cohérence du patrimoine)
- `style_ia`, `ton_ia` → conservés en base pour compatibilité, **non exposés dans l'UI** (supprimés car redondants avec `tier`)
- `tier` → détermine la **profondeur maximale** autorisée
- `benchmark` → utilisé pour évaluation comparative de performance

Dans Settings.jsx, les niveaux non autorisés sont affichés **grisés et verrouillés** avec `🔒 Tomino +`,
mais la vraie contrainte est appliquée **côté serveur** dans `save_profil()` et dans les routes Grok.

### Frontend React
- **Client HTTP centralisé** : toujours utiliser `api.get/post/put/del` depuis `src/api.js`
- **Proxy Vite** : `/api/*` → `localhost:5000` — ne jamais mettre l'URL complète
- **Formatage monétaire** : `new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'})` 
- **Cleanup useEffect** : toujours retourner une fonction cleanup avec `mounted = false`
- **Recharts** pour les graphiques — pas Chart.js côté React
- **marked** pour le rendu Markdown des réponses Grok
- **Tailwind + classes custom** : voir `index.css` pour `.card`, `.stat`, `.tbl-wrap`, `.badge`, `.btn`, etc.
- **Menus déroulants** : utiliser `src/components/CustomSelect.jsx` pour garantir le style cross-plateforme
- **Sélecteurs natifs HTML** : éviter `<select>` en UI principale (rendu natif Windows non maîtrisable)
- **JAMAIS d'émojis sur le site** : AUCUN emoji dans aucune UI (boutons, labels, modales, texte). Les émojis manquent de lisibilité sur fond sombre et en mode responsive. Remplacer par du texte simple (ex: « Gratuit » au lieu de « 🏠 Gratuit ») ou utiliser des CSS badges/icônes si nécessaire.
- **Assistant fiscal 3916** : dans `Settings.jsx`, calcul par année fiscale via `/api/comptes-etrangers/declaration`
- **Règle fiscale utilisée** : compte retenu si ouvert avant fin d'année et non clôturé avant le 1er janvier de l'année
- **Portefeuille UX** : dans `Portefeuille.jsx`, les positions à quantité `0` sont masquées de la liste.
- **Historique PEA UX** : clic sur une ligne d'historique ouvre le modal de renfort/cession en mode édition (achat **ou** vente).
- **Livrets UX** : `Livrets.jsx` permet l'édition d'un livret existant (préremplissage + `PUT /api/livrets/<id>`).
- **Assurance vie UX** : `AssuranceVie.jsx` permet la gestion CRUD des contrats (nom, assureur, support, versements, valeur actuelle) avec édition inline.
- **Chat UX** : `Chat.jsx` affiche une colonne d'historique des conversations à droite, un bouton icône `+` pour démarrer une nouvelle conversation (sans suppression d'historique), un indicateur rond d'utilisation IA (tooltip au hover), et un état « Tomino réfléchit » en texte surbrillant (sans points animés).
- **Analyse UX** : `AnalyseIA.jsx` ne montre pas la consommation ; le blocage quota est affiché dans le bouton `Obtenir un rapport` avec compte à rebours de disponibilité.
- **Branding UX** : `Sidebar.jsx` affiche `Tomino+` en un seul mot quand l'abonnement Tomino + est actif, avec le `+` en doré.

### Accueil et mode découverte
- **Page Welcome** (`Welcome.jsx`) : présentée systématiquement aux nouveaux utilisateurs (profil absent ou vierge). Trois choix : « Créer mon espace » → `/onboarding`, « Visite libre » → injecte données démo via `POST /api/demo/inject` puis recharge, « J'ai un compte » → `/settings/sync`.
- **Mode démo** : activé via `is_demo=1` sur le profil. Injecte un PEA fictif (LVMH, Air Liquide, CW8), deux livrets, et 30 jours d'historique.
- **DemoBanner** (`DemoBanner.jsx`) : bandeau fixe en bas de l'écran, visible uniquement si `is_demo=1`. Affiche un avertissement et un bouton « Quitter la démo et commencer » qui appelle `POST /api/demo/reset` puis redirige vers `/welcome`.
- **Routing onboarding** : `App.jsx` redirige vers `/welcome` si le profil est absent ou vierge (et que la session n'est pas déjà sur `/onboarding` ou `/settings/sync`). Quitter le mode démo retourne à `/welcome`.
- **Sortie du mode démo par onboarding** : `POST /api/profil` détecte `is_demo=1` et appelle `reset_all_data()` avant de sauvegarder le vrai profil, pour garantir que les données fictives sont purgées.

### Accueil et mode découverte
- **Page Welcome** (`Welcome.jsx`) : présentée systématiquement aux nouveaux utilisateurs (profil absent ou vierge). Trois choix : « Créer mon espace » → `/onboarding`, « Visite libre » → injecte données démo via `POST /api/demo/inject` puis recharge, « J'ai un compte » → `/settings/sync`.
- **Mode démo** : activé via `is_demo=1` sur le profil. Injecte un PEA fictif (LVMH, Air Liquide, CW8), deux livrets, et 30 jours d'historique.
- **DemoBanner** (`DemoBanner.jsx`) : bandeau fixe en bas de l'écran, visible uniquement si `is_demo=1`. Affiche un avertissement et un bouton « Quitter la démo et commencer » qui appelle `POST /api/demo/reset` puis redirige vers `/welcome`.
- **Routing onboarding** : `App.jsx` redirige vers `/welcome` si le profil est absent ou vierge (et que la session n'est pas déjà sur `/onboarding` ou `/settings/sync`). Quitter le mode démo retourne à `/welcome`.
- **Sortie du mode démo par onboarding** : `POST /api/profil` détecte `is_demo=1` et appelle `reset_all_data()` avant de sauvegarder le vrai profil, pour garantir que les données fictives sont purgées.

---

## Design system

### Couleurs (CSS variables dans `index.css`)
```css
--bg:     #0a0a0a   /* fond principal */
--bg1:    #111111   /* sidebar, cards */
--bg2:    #161616   /* inputs, bg secondaire */
--bg3:    #1c1c1c   /* hover, bg tertiaire */
--line:   #242424   /* bordures */
--gold:   #c9a84c   /* accent unique — or pâle */
--green:  #4a9e6a   /* positif */
--red:    #9e4a4a   /* négatif */
--text:   #e8e3dc   /* texte principal */
--text2:  #8a8480   /* texte secondaire */
--text3:  #4a4744   /* texte tertiaire / labels */
```

### Typographie
```css
--serif: 'Instrument Serif', Georgia, serif    /* grands chiffres */
--mono:  'IBM Plex Mono', monospace            /* données, labels */
--sans:  'IBM Plex Sans', system-ui, sans-serif /* UI générale */
```

### Classes utilitaires custom
- `.card` — conteneur avec fond bg1 et bordure
- `.stat` — stat card avec label + valeur
- `.stat-value` — grand chiffre serif
- `.stat-pv.pos/.neg/.neu` — badge +/- value
- `.tbl-wrap` — wrapper tableau scrollable
- `.badge`, `.badge-gold`, `.badge-green`, `.badge-dim`
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`
- `.fade-up`, `.fade-up-2`, `.fade-up-3` — animations d'entrée
- `.hero-strip`, `.hero-title`, `.hero-kicker`, `.hero-subtitle`
- `.g4`, `.g3`, `.g2`, `.g2-3` — grilles responsive
- `.form-input`, `.form-label`, `.form-group`, `.form-row`
- `CustomSelect.jsx` — dropdown custom avec fond sombre, bordure verte au survol, fermeture clic extérieur/Échap

---

## Ce qu'il NE FAUT PAS faire

- ❌ **Utiliser des émojis** — JAMAIS d'émojis sur le site (lisibilité insuffisante sur fond sombre). Utiliser du texte simple à la place.
- ❌ Utiliser `yfinance` — remplacé par HTTP direct dans `prices.py`
- ❌ Utiliser un ORM (SQLAlchemy etc.) — SQL brut uniquement
- ❌ Utiliser `render_template()` dans `app.py` — API JSON pure
- ❌ Mettre des URLs absolues (`http://localhost:5000`) dans le frontend — utiliser le proxy `/api`
- ❌ Modifier `prices.py` sans raison — le SESSION et les headers sont calibrés pour contourner le blocage Yahoo
- ❌ Ajouter des dépendances npm lourdes sans vérifier d'abord si Recharts ou marked couvrent le besoin
- ❌ Utiliser `"{:,.0f}".format()` côté Python dans des templates — il n'y a plus de templates Jinja
- ❌ Committer le fichier `.env` ou `patrimoine.db`
- ❌ Inclure `node_modules` dans les ZIPs ou commits

---

## Prochaines features prévues

- [x] **Export PDF** patrimonial (résumé + allocation + performances + positions + dernier commentaire IA)
- [ ] **Migration SaaS** : SQLite → PostgreSQL, ajout auth (Flask-Login ou Supabase), Stripe

## Références internes
- Catalogue services tiers recommandé : `.github/services.md`

---

## Lancement du projet

```bash
# Terminal 1 — Backend
cd tomino_track
.venv\Scripts\activate
python app.py
# → http://localhost:5000

# Terminal 2 — Frontend
cd tomino_track/front
npm run dev
# → http://localhost:5173

# Terminal 3 — Stripe CLI (optionnel en dev)
stripe login
stripe listen --forward-to localhost:5000/api/billing/webhook

# Ou en un clic :
start.bat
```