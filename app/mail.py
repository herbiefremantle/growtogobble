"""Sending email (password resets) through Resend (https://resend.com - free for 3,000 a month).

Set these on Railway:
  RESEND_API_KEY=re_...                        from resend.com > API Keys
  MAIL_FROM=Grow to Gobble <hello@yourdomain>  an address on a domain you've verified in Resend
  PUBLIC_URL=https://yourdomain                 optional: where reset links point (else RAILWAY_PUBLIC_DOMAIN)
Without a key nothing is sent: the app says so in the logs, and an admin can still make a reset link by hand.
"""
import logging
import os

import httpx

log = logging.getLogger("mail")


def configured():
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM"))


def public_url(request=None):
    """The site's address, for links in emails: PUBLIC_URL, else Railway's domain, else the request's own."""
    url = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
    if not url and os.environ.get("RAILWAY_PUBLIC_DOMAIN"):
        url = "https://" + os.environ["RAILWAY_PUBLIC_DOMAIN"]
    if not url and request is not None:
        url = str(request.base_url).rstrip("/")
    return url


def send(to, subject, text):
    """Send a plain-text email. Returns True if Resend accepted it."""
    if not configured():
        log.warning("Email is not set up (RESEND_API_KEY / MAIL_FROM), so nothing was sent to %s: %s", to, subject)
        return False
    try:
        r = httpx.post("https://api.resend.com/emails", timeout=10,
                       headers={"Authorization": "Bearer " + os.environ["RESEND_API_KEY"]},
                       json={"from": os.environ["MAIL_FROM"], "to": [to], "subject": subject, "text": text})
        if r.status_code in (200, 201):
            return True
        log.warning("Resend refused the email (%s): %s", r.status_code, r.text[:200])
    except Exception as e:
        log.warning("Sending email failed: %s", e)
    return False


def reset_email(name, link, hours):
    return ("Hi %s,\n\n"
            "Someone (hopefully you) asked to reset the password on your Grow to Gobble account.\n\n"
            "Set a new one here - the link works once, for %d hours:\n%s\n\n"
            "If you didn't ask for this, you can ignore this email: your password stays as it is.\n\n"
            "Happy growing,\nGrow to Gobble\n") % (name, hours, link)
