# Tomino — Services tiers recommandés

Date: 2026-03-19

## Objectif
Ce document définit les services tiers à utiliser pour Tomino en respectant le principe local-first et une montée en charge progressive vers le SaaS.

## Décisions recommandées

### 1) Paiement et abonnement
- Service: Stripe
- Usage:
  - Abonnements Tomino +
  - Customer Portal (gestion carte, annulation, changement de plan)
  - Webhooks pour synchroniser `users.tier` et `user_subscriptions`
- Pourquoi:
  - Intégration mature Flask/Python
  - Très bon support abonnement récurrent
  - Portail client prêt à l'emploi
- Statut projet:
  - Intégration backend en place (`checkout-session`, `portal-session`, `webhook`)
  - Mode local fallback toujours disponible

### 2) Email transactionnel
- Service: Resend
- Usage:
  - Envoi email reset mot de passe
  - Confirmations de compte
  - Notifications transactionnelles (optionnel)
- Pourquoi:
  - API simple
  - Bonne délivrabilité
  - Coût initial faible
- Statut projet:
  - Flux reset implémenté côté API
  - Envoi réel email à brancher

### 3) Monitoring erreurs
- Service: Sentry
- Usage:
  - Capture erreurs backend Flask
  - Capture erreurs frontend React
- Pourquoi:
  - Diagnostic rapide en production
  - Contexte stack trace + tags release
- Statut projet:
  - Non branché (prochaine étape recommandée)

### 4) Base cloud pour sync SaaS
- Service: PostgreSQL managé (Supabase DB ou Neon)
- Usage:
  - Stockage cloud des événements de sync pour usage multi-appareils
- Pourquoi:
  - Modèle `sync_events` déjà compatible SQL relationnel
  - Facile à opérer avec sauvegardes et observabilité
- Statut projet:
  - Architecture prête côté logique
  - Migration SQLite local -> PostgreSQL cloud non lancée

### 5) Hébergement backend
- Service: Railway (recommandation V1)
- Alternatives: Render, Fly.io
- Pourquoi:
  - Déploiement simple
  - Gestion des variables d'environnement
  - Coût initial raisonnable

## Authentification: stratégie
- Décision V1:
  - Conserver l'auth maison (déjà robuste et testée)
- Préparation migration future:
  - `users.auth_provider` + `users.provider_user_id` ajoutés au schéma
  - endpoint de liaison en place: `POST /api/auth/provider/link`
  - Modèle hybride possible: comptes `local` et comptes `supabase`/`oidc`
- Quand migrer vers un provider auth:
  - besoin OAuth/Magic Link/MFA avancé
  - pression conformité/ops auth plus forte

## Variables d'environnement à prévoir

### Stripe
- `TOMINO_BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `STRIPE_PRICE_TIER1=price_...`
- `STRIPE_PRICE_TIER2=price_...`
- `STRIPE_CHECKOUT_SUCCESS_URL=...`
- `STRIPE_CHECKOUT_CANCEL_URL=...`
- `STRIPE_PORTAL_RETURN_URL=...`

Activation locale rapide (Windows):
1. Renseigner les variables Stripe dans `.env` a la racine.
2. Lancer `start.bat` (le script charge automatiquement `.env`).
3. Installer Stripe CLI puis lancer le forward webhook vers `http://localhost:5000/api/billing/webhook`.
4. Copier le secret `whsec_...` du CLI dans `STRIPE_WEBHOOK_SECRET` puis relancer `start.bat`.

### Password reset / auth
- `TOMINO_AUTH_PASSWORD_RESET_TOKEN_MINUTES=30`
- `TOMINO_AUTH_PASSWORD_RESET_EXPOSE_TOKEN=0` (mettre `1` seulement en local/dev)

### Email (futur branchage)
- `RESEND_API_KEY=...`
- `RESEND_FROM_EMAIL=...`

### Monitoring (futur branchage)
- `SENTRY_DSN=...`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE=...`

## Ordre d'implémentation recommandé
1. Finaliser Stripe en mode test puis production
2. Brancher Resend sur le reset password
3. Ajouter Sentry backend + frontend
4. Préparer migration sync cloud vers PostgreSQL managé
5. Décider provider auth externe quand le besoin produit l'exige

## Règle produit à conserver
- Free: expérience locale complète, sans obligation de compte
- Tomino +: fonctionnalités cloud et multi-appareils
- L'IA reste optionnelle
