# Tomino — Confidentialité et portée cloud/local

Date: 2026-03-18

## Principe produit
- Mode par défaut: local-first (usage desktop sans compte).
- Le cloud est optionnel et réservé au mode Tomino + de synchronisation multi-appareils.
- L'IA est additionnelle et n'est jamais obligatoire.

## Données qui restent locales (mode Free sans sync cloud)
- Données patrimoniales SQLite locales (`patrimoine.db`): actifs, mouvements, livrets, assurance vie, dividendes, alertes, profil.
- Historique local et sauvegardes locales (dont `.tomino-backups`).
- Paramètres d'interface stockés localement dans le navigateur/app.

## Données envoyées au cloud quand la sync Tomino + est activée
- Événements de synchronisation (`sync_events`) associés à l'utilisateur authentifié:
  - `entity_type`, `entity_id`, `operation`, `payload`, `event_at`, `event_uid`, `device_id`.
- Métadonnées de compte/sessions:
  - `users` (email, tier, auth_provider, provider_user_id),
  - `user_subscriptions` (provider, status, tier, période de facturation, IDs provider),
  - `user_sessions` (jeton haché, appareil, expiration/révocation),
  - `password_reset_tokens` (hash token, expiration, usage),
  - `devices` (device_id, label, état pause/reprise, horodatages),
  - `auth_audit_logs` (événement auth, succès/échec, raison, IP, horodatage).

## Données envoyées au prestataire de paiement (si Stripe activé)
- Création de session checkout: email, `user_id` interne, tier demandé, URLs de retour.
- Création de session portail client Stripe: `provider_customer_id` + URL de retour.
- Événements webhook Stripe traités côté serveur:
  - `checkout.session.completed`,
  - `customer.subscription.updated`,
  - `customer.subscription.deleted`.
- Ces événements mettent à jour le niveau d'abonnement local (`users.tier` + `user_subscriptions`).

## Données envoyées aux services tiers
- Yahoo Finance: requêtes de cours/tickers depuis `prices.py`.
- xAI (Grok), uniquement si l'utilisateur utilise les fonctionnalités IA:
  - contexte patrimonial nécessaire à la réponse,
  - message utilisateur pour chat/analyse,
  - estimation de consommation IA enregistrée localement (`ia_usage`).

## Sécurité actuellement implémentée
- Mot de passe haché en PBKDF2 côté serveur.
- Sessions par jeton opaque; seul le haché SHA-256 du jeton est persisté.
- Expiration de session + invalidation explicite (`logout`, `logout-all`, révocation appareil).
- Réinitialisation mot de passe avec token à durée de vie limitée, usage unique, et invalidation des sessions après succès.
- Limitation des tentatives de login (fenêtre glissante + blocage temporaire).
- Journal d'audit minimal des événements d'authentification.

## Limites connues (à clarifier côté offre SaaS)
- Chiffrement de bout en bout des événements de sync: prévu, non activé actuellement.

## Engagement de portabilité
- Export/import backup disponible.
- L'utilisateur garde la propriété et l'exportabilité de ses données.
