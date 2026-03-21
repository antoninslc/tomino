import os
import resend

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM = os.getenv("RESEND_FROM_EMAIL", "Tomino <noreply@tomino.app>")


def _send(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY or not to:
        return False
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({"from": RESEND_FROM, "to": [to], "subject": subject, "html": html})
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Email non envoyé (%s): %s", to, e)
        return False


def send_welcome(to: str, tier_label: str) -> bool:
    return _send(
        to,
        subject="Bienvenue sur Tomino",
        html=f"""
        <p>Bonjour,</p>
        <p>Votre compte Tomino est activé avec le forfait <strong>{tier_label}</strong>.</p>
        <p>Vous pouvez dès maintenant accéder à votre tableau de bord et synchroniser
        votre patrimoine entre vos appareils.</p>
        <p>Pour gérer votre abonnement (factures, annulation), rendez-vous dans
        <strong>Paramètres → Synchronisation cloud</strong>.</p>
        <p>— L'équipe Tomino</p>
        <hr/>
        <p style="color:#888;font-size:12px;">
        Vous pouvez annuler à tout moment depuis votre espace Paramètres, sans frais.
        </p>
        """,
    )


def send_payment_confirmed(to: str, amount_eur: str, period_end: str) -> bool:
    return _send(
        to,
        subject=f"Paiement Tomino+ confirmé — {amount_eur}",
        html=f"""
        <p>Bonjour,</p>
        <p>Votre paiement de <strong>{amount_eur}</strong> pour Tomino+ a bien été encaissé.</p>
        <p>Votre abonnement est actif jusqu'au <strong>{period_end}</strong>.</p>
        <p>Pour consulter vos factures ou annuler, rendez-vous dans
        <strong>Paramètres → Synchronisation cloud → Gérer l'abonnement</strong>.</p>
        <p>— L'équipe Tomino</p>
        <hr/>
        <p style="color:#888;font-size:12px;">
        Annulation possible à tout moment, sans frais, avec effet à la fin de la période en cours.
        </p>
        """,
    )


def send_payment_failed(to: str, next_attempt: str | None = None) -> bool:
    next_msg = f"Une nouvelle tentative aura lieu le <strong>{next_attempt}</strong>." if next_attempt else ""
    return _send(
        to,
        subject="Échec de paiement Tomino+",
        html=f"""
        <p>Bonjour,</p>
        <p>Nous n'avons pas pu encaisser votre paiement Tomino+.</p>
        {next_msg}
        <p>Pour mettre à jour votre moyen de paiement, rendez-vous dans
        <strong>Paramètres → Synchronisation cloud → Gérer l'abonnement</strong>.</p>
        <p>Sans régularisation, votre abonnement sera suspendu automatiquement.</p>
        <p>— L'équipe Tomino</p>
        """,
    )


def send_cancellation_confirmed(to: str, period_end: str) -> bool:
    return _send(
        to,
        subject="Annulation Tomino+ confirmée",
        html=f"""
        <p>Bonjour,</p>
        <p>Votre abonnement Tomino+ a bien été annulé.</p>
        <p>Vous conservez l'accès Tomino+ jusqu'au <strong>{period_end}</strong>,
        date de fin de votre période en cours.</p>
        <p>Après cette date, votre compte basculera automatiquement en mode Gratuit.
        Toutes vos données restent accessibles localement.</p>
        <p>— L'équipe Tomino</p>
        <hr/>
        <p style="color:#888;font-size:12px;">
        Vos données vous appartiennent. Export disponible à tout moment dans Paramètres → Export.
        </p>
        """,
    )


def send_password_reset(to: str, reset_url: str) -> bool:
    return _send(
        to,
        subject="Réinitialisation de votre mot de passe Tomino",
        html=f"""
        <p>Bonjour,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p><a href="{reset_url}" style="color:#c9a84c;">Cliquer ici pour réinitialiser</a></p>
        <p>Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande,
        ignorez cet email.</p>
        <p>— L'équipe Tomino</p>
        """,
    )
