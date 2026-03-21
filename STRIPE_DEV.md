# Stripe en développement local

## Problème
Stripe ne peut pas envoyer de webhooks vers localhost.
Sans webhook, le tier utilisateur ne se met jamais à jour après paiement.

## Solution : Stripe CLI

### Installation
https://docs.stripe.com/stripe-cli

### Commandes à lancer (dans un 3e terminal, en plus de Flask et Vite)
stripe login
stripe listen --forward-to localhost:5000/api/billing/webhook

Astuce : `start.bat` contient une ligne optionnelle commentée pour lancer
Stripe CLI automatiquement en 3e terminal.

### Important
Le secret affiché par "stripe listen" (whsec_...) est DIFFÉRENT
de celui dans le dashboard Stripe.
Copie-le dans .env :
STRIPE_WEBHOOK_SECRET=whsec_xxxxx_celui_du_cli

### Vérification
Après paiement test (carte 4242 4242 4242 4242), le terminal Flask
doit afficher :
  WEBHOOK STRIPE reçu — type: checkout.session.completed
  WEBHOOK tier mis à jour — user_id: 1 tier: tomino_plus

### Carte de test Stripe
Numéro : 4242 4242 4242 4242
Date    : n'importe quelle date future
CVC     : n'importe quoi (ex: 123)

## Emails en développement

Resend n'envoie des emails qu'avec une clé API valide.
En dev, si RESEND_API_KEY est vide, les emails sont ignorés
silencieusement (log WARNING dans Flask).

Pour tester les emails en dev, deux options :
1. Créer un compte Resend gratuit (3 000 emails/mois)
  et utiliser un domaine vérifié ou le domaine de test Resend.
2. Utiliser Resend en mode "test" avec l'adresse onboarding@resend.dev
  comme destinataire pour voir les emails sans domaine vérifié.
