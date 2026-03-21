# Tomino — Évolutions à finaliser avant distribution

Date: 2026-03-17

## Objectif
Ce document liste ce qu'il faut consolider/ajouter avant une distribution publique, puis propose une frontière claire entre l'offre Free et Tomino +.
La logique produit retenue est un compromis: local-first par défaut (fiabilité, confidentialité, simplicité) avec synchronisation multi-appareils optionnelle pour répondre au besoin PC + téléphone.

## Vision de compromis (local-first + multi-appareils)
- Mode par défaut: données locales sur l'appareil (offline-first).
- Option Tomino +: synchronisation cloud chiffrée de bout en bout (PC + téléphone).
- Portabilité garantie: export/import disponible pour tous, sans verrouillage propriétaire.
- Dégradation maîtrisée: en cas de panne réseau/cloud, l'app reste utilisable localement.

## 1) À consolider avant distribution (priorité haute)

### Fiabilité et sécurité des données
- ✅ Export/import complet de la base via Settings (format `.tomino-backup`), avec validation d'intégrité (manifest + SHA-256 + contrôle de schéma SQLite).
- ✅ Sauvegarde automatique locale en place (rotation: 7 sauvegardes quotidiennes + 4 hebdomadaires).
- ✅ Mode restauration guidée en place: vérification préalable (intégrité + compatibilité) puis confirmation explicite avant écrasement.
- ✅ Erreurs critiques avec messages actionnables en place (base verrouillée, fichier corrompu, clé API absente) + affichage en modale fermable.
- ✅ Chiffrement optionnel des sauvegardes exportées par mot de passe local (export chiffré + vérification/import avec mot de passe).
- ✅ Moteur de synchronisation par événements en place (journal local `sync_events` + API de polling/apply + résolution de conflits horodatée type last-write-wins).
- Chiffrer les données synchronisées côté client (chiffrement de bout en bout, clé dérivée du mot de passe utilisateur).
- Prévoir un mode "pause de sync" et une reprise sûre sans perte de données.

### Qualité logicielle
- Étendre la suite de tests backend (quotas IA, alertes, benchmark, onboarding, routes fiscalité).
- Ajouter des tests de non-régression frontend sur les flux critiques (ajout actif, édition mouvement, analyse IA, chat).
- Ajouter un pipeline CI minimal: lint + tests backend + build frontend.
- Ajouter une stratégie de migration base de données versionnée (script de migration à chaque changement de schéma).

### Distribution et expérience d'installation
- Produire un installeur Windows simple (dépendances, création du `.env`, vérification ports).
- Ajouter un mode “diagnostic” dans l'app (version, état API, état DB, état clé IA, derniers logs).
- Documenter une procédure de mise à jour sans perte de données.
- Préparer une expérience mobile minimale (web responsive d'abord, puis app dédiée selon traction).

### Confiance utilisateur
- Afficher partout une preuve claire: données locales, aucune connexion bancaire automatique.
- Ajouter un écran "Confidentialité et sécurité" dans les paramètres.
- Ajouter un consentement explicite pour l'usage IA et la consommation de quota.
- Ajouter une transparence sync: date de dernière sync, nombre d'appareils connectés, taille des données synchronisées.

## 2) À ajouter pour augmenter la valeur perçue

### Valeur métier
- ✅ Export PDF patrimonial (résumé, allocation, performances, commentaires IA).
- ✅ Export CSV des mouvements/dividendes/fiscalité.
- Rapport mensuel automatique (snapshot + variations + points de vigilance).
- Simulateur simple “et si ?” (renfort, vente partielle, impact allocation).

### UX
- Améliorer les états vides (guidage concret, CTA pertinents).
- Ajouter un centre de notifications (alertes déclenchées, IA indisponible, sauvegarde réussie).
- Ajouter un onboarding “2 minutes” avec données d'exemple réinitialisables.

### Performance
- Ajouter pagination/virtualisation sur listes longues (mouvements, dividendes, historiques).
- Ajouter cache côté frontend pour les routes les plus consultées, avec invalidation contrôlée.

### Roadmap de transition vers le multi-appareils
- Phase 1: local-first renforcé (backup, restore, export/import, diagnostics).
- Phase 2: sync optionnelle Tomino + sur un backend simple (compte, appareils, réplication chiffrée).
- Phase 3: expérience mobile complète (notifications, consultation/édition rapide, continuité parfaite avec desktop).

## 3) Frontière produit Free vs Tomino + (proposition)

## Principes
- Free doit être réellement utile au quotidien, pas une démo frustrante.
- Tomino + doit accélérer la prise de décision et le gain de temps.
- Les données de base (saisie, consultation, export minimal) restent côté Free.
- La mobilité (PC + téléphone) est une valeur Tomino +, mais la propriété des données reste universelle.

### Règle d'accès (actée)
- Free: accès Tomino via l'application desktop locale uniquement (local-first, sans cloud).
- Tomino +: accès multi-appareils (desktop + web/mobile) via synchronisation cloud chiffrée.
- Le site web public (landing, compte, facturation) reste accessible à tous, mais l'accès au portefeuille via web est réservé à Tomino +.

## Free (gratuit)
- Suivi patrimonial complet: PEA, CTO, Or, Livrets, Assurance vie.
- CRUD complet actifs/mouvements/dividendes/alertes.
- Dashboard, répartition, benchmark simple.
- Fiscalité de base: vue annuelle et données déclaratives.
- IA limitée: quota hebdomadaire bas + profondeur "Éco" uniquement.
- Export CSV basique (données brutes).
- Sauvegarde manuelle locale.
- Utilisation locale offline-first sur un appareil principal.

## Tomino + (3$/mois)
- IA avancée: tiers Standard + Approfondi, plus de contexte et historique plus long.
- Rapports IA Tomino +: rapport mensuel prêt à lire + checklist d'actions.
- Simulateur "et si ?" multi-scénarios avec comparaison avant/après.
- Export PDF Tomino + (mise en page soignée, partage imprimable).
- Assistant fiscal avancé (rappels et contrôles supplémentaires).
- Sauvegarde automatique planifiée + restauration guidée enrichie.
- Synchronisation cloud chiffrée multi-appareils (PC + téléphone).
- Gestion des appareils (connexion/déconnexion, dernier accès, révocation).
- Priorité sur nouvelles fonctionnalités et support prioritaire léger.

## 4) Garde-fous anti-frustration
- Pas de blocage des fonctionnalités cœur en Free (saisie, historique, consultation).
- Ne jamais masquer les données de l'utilisateur derrière un paywall.
- Montrer clairement la valeur Tomino + avec exemples concrets, pas seulement "plus de tokens".
- Garantir à tous l'export complet pour pouvoir quitter le service sans friction.

## 5) Go-live checklist minimale
- Sauvegarde/restauration testée sur machine vierge.
- 0 bug bloquant sur ajout/édition/suppression de mouvements.
- Tests backend verts + build frontend vert.
- Page de tarification lisible en moins de 20 secondes.
- Messages d'erreur relus en français utilisateur.
- Politique de confidentialité et mentions légales accessibles.
- Scénario validé: utilisateur commence en local, active Tomino +, retrouve ses données sur mobile.
- Scénario validé: perte d'un appareil sans perte de patrimoine (restauration/sync cohérente).

## 6) KPI à suivre après lancement
- Activation J1: utilisateur qui ajoute au moins 1 actif + 1 livret.
- Rétention J7: retour et consultation dashboard.
- Conversion Tomino +: passage Free -> Tomino + à 30 jours.
- Valeur IA: pourcentage d'utilisateurs qui relancent une analyse dans la semaine.
- Support: taux de tickets "perte de données" (doit tendre vers 0).

## 7) Positionnement produit (version courte)
Tomino est le copilote patrimonial des investisseurs autonomes français.
Vous gardez le contrôle: suivi clair de votre patrimoine, sans connexion bancaire imposée.
Le mode local-first garantit une app rapide, fiable et utilisable hors ligne.
Tomino + ajoute la continuité multi-appareils (PC + téléphone) via une synchronisation chiffrée.
L'IA reste un accélérateur, jamais une obligation.
Objectif: vous faire gagner du temps, réduire le bruit, et améliorer vos décisions.
Vos données restent exportables à tout moment, sans verrouillage.

## 8) Plan d'implémentation compte & auth (Free sans compte)

Principe produit retenu:
- Free: aucun compte requis (local-first complet, offline, export/import et backup local).
- Sync cloud Tomino +: compte requis (auth + appareils + journal de sync côté serveur).

### Phase A — Base auth minimale (backend)
- ✅ Implémentation initiale en place: tables `users` + `user_sessions`, endpoints `register/login/logout/me`, sessions tokenisées, et protection des endpoints de sync par authentification.
- ✅ Créer table `users` (email unique, password_hash, tier, created_at, updated_at).
- ✅ Créer table `user_sessions` (token, user_id, expires_at, revoked_at, device_label).
- ✅ Ajouter endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- ✅ Hash mot de passe côté serveur (PBKDF2) + règles minimales (longueur, format email).
- ✅ Ajouter middleware d'auth pour endpoints Tomino + uniquement (pas de blocage des routes Free locales).

Critères d'acceptation:
- ✅ Un utilisateur Free peut utiliser toute l'app locale sans compte.
- ✅ Un utilisateur non authentifié ne peut pas appeler les endpoints sync cloud.
- ✅ Un utilisateur authentifié peut ouvrir/fermer session sans perte des données locales (validé via test E2E API automatisé).

### Phase B — Appareils et contrôle d'accès sync
- ✅ Créer table `devices` (user_id, device_id, nom appareil, last_seen_at, revoked_at).
- ✅ Associer chaque session à un `device_id` stable (accepté côté API, généré si absent).
- ✅ Ajouter endpoints: `GET /api/devices`, `POST /api/devices/revoke`, `POST /api/sync/pause`, `POST /api/sync/resume`.
- ✅ Stocker un état de sync côté user/device (actif/en pause + dernier curseur sync + last_seen).

Critères d'acceptation:
- ✅ L'utilisateur peut voir et révoquer un appareil distant.
- ✅ La pause sync empêche push/pull sans impacter l'usage local.
- ✅ La reprise sync redémarre proprement depuis le dernier curseur connu.

### Phase C — Brancher le journal de sync existant au modèle user
- ✅ Étendre `sync_events` avec `user_id` et `device_id`.
- ✅ Filtrer `GET /api/sync/events` et `POST /api/sync/events/apply` par `user_id` authentifié.
- ✅ Déduplication par (`user_id`, `event_uid`) + conservation de la logique `stale_event`.
- ✅ Ajouter migration de schéma non destructive + fallback sûr pour instances locales sans cloud activé.

Critères d'acceptation:
- ✅ Aucun mélange d'événements entre utilisateurs.
- ✅ Le moteur de conflits horodatés reste inchangé fonctionnellement.
- ✅ Les utilisateurs Free locaux continuent de fonctionner sans migration bloquante.

### Phase D — UX d'activation progressive (sans friction Free)
- ✅ Dans Settings, bouton "Activer la synchronisation cloud" (CTA Tomino +).
- ✅ Si non connecté: modal simple "Créer un compte / Se connecter".
- ✅ Si connecté: écran état sync (dernière sync, appareils connectés, pause/reprise).
- ✅ Messages explicites: "Le compte est requis uniquement pour la sync cloud."

Critères d'acceptation:
- ✅ Onboarding Free inchangé (aucune obligation d'inscription).
- ✅ Activation Tomino + en moins de 2 minutes avec guidage clair.
- ✅ Retour arrière possible: désactiver sync et rester en local-first.

### Phase E — Durcissement sécurité et conformité
- ✅ Limiter les tentatives login (rate limit) + journaux d'audit auth.
- ✅ Rotation/expiration des sessions + invalidation côté serveur.
- ✅ Réinitialisation mot de passe implémentée (`POST /api/auth/password-reset/request` + `POST /api/auth/password-reset/confirm`) avec invalidation des sessions actives après succès.
- ✅ Documentation claire: quelles données partent au cloud et lesquelles restent locales (voir `.github/confidentialite-sync.md`).

### Phase F — Forfaits & facturation Tomino +
- ✅ Renommage UX des libellés vers "Tomino +" dans l'application.
- ✅ Mise en place d'un contrôle d'accès serveur: endpoints sync/devices bloqués en Free (`HTTP 403`, entitlement Tomino + requis).
- ✅ Ajout des endpoints forfait: `GET /api/plans`, `GET /api/billing/subscription`, `POST /api/billing/change-plan`.
- ✅ Mode local opérationnel: changement de forfait immédiat (sans prestataire de paiement).
- ✅ Intégration Stripe prête: `POST /api/billing/checkout-session` + `POST /api/billing/webhook`.
- ✅ Portail client Stripe ajouté: `POST /api/billing/portal-session` (gestion abonnement côté Stripe).
- ✅ Persistance abonnement: table `user_subscriptions` (provider, status, tier, période, IDs fournisseur).
- ✅ UX Settings Sync: choix du forfait, redirection checkout Stripe si paiement requis, retour `billing=success|cancel` géré.
- ✅ Sidebar: badge `+` doré affiché à côté de Tomino quand Tomino + est actif.

### Phase G — Préparation transition Auth provider (future-proof)
- ✅ Schéma `users` préparé pour mode hybride: `auth_provider` + `provider_user_id`.
- ✅ Réponses auth (`register/login/me`) enrichies avec `auth_provider`.
- ✅ Endpoint de transition ajouté: `POST /api/auth/provider/link` (liaison compte local -> identité provider).
- ✅ Compatibilité conservée: comptes existants restent en `local` sans migration forcée.
- ✅ Référentiel des services tiers ajouté: `.github/services.md`.

Critères d'acceptation:
- ✅ Endpoints auth/sync protégés contre abus basiques.
- ✅ Traçabilité minimale des connexions et révocations.
- ✅ Politique de confidentialité alignée avec le comportement réel.
