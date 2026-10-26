"""The Privacy Policy, Terms and Affiliate Disclosure pages (/privacy, /terms, /affiliate-disclosure).

Plain-language text, written to match what the app really does - if you change what it collects or which services it
uses, change it here too. Set CONTACT_EMAIL on Railway and it appears on every page as the way to reach you.
"""
import html
import os

UPDATED = "26 October 2026"


def contact():
    email = os.environ.get("CONTACT_EMAIL", "").strip()
    if email:
        e = html.escape(email)
        return '<a href="mailto:%s">%s</a>' % (e, e)
    return "the contact address given where you got this app"


PRIVACY = """
<h1>Privacy Policy</h1>
<p class="muted">Last updated %(updated)s</p>
<p>Grow to Gobble helps you plan and grow food. This page explains what we keep about you and why, in plain words.
We follow UK data protection law (UK GDPR).</p>

<h2>What we keep</h2>
<ul>
<li><b>Your account:</b> your first name, email address, and a scrambled (hashed) version of your password.
We can't read your password.</li>
<li><b>Your postcode district:</b> only the first part (like LS6), never your full address. We use it to fit planting
dates to your weather, and to find the rough latitude and longitude of that district.</li>
<li><b>Your garden:</b> the beds, pots, plants, jobs you tick off, badges, your quiz answers, and the shape of any garden
outline you trace. The spot on the map where you place it stays on your own device and is not sent to us.</li>
<li><b>Notifications:</b> if you switch them on, your phone's push address, so we can send reminders. You can switch
them off at any time.</li>
<li><b>A calendar link:</b> a secret link that shows your jobs in your own calendar app. Anyone with the link can see
your jobs, so don't share it.</li>
<li><b>Invites:</b> if you came from, or sent, an invite link, we keep who invited whom, to count sign-ups.</li>
</ul>

<h2>What we don't do</h2>
<ul>
<li>We don't sell your information.</li>
<li>We don't show adverts or use advertising or analytics trackers.</li>
<li>We use one cookie, to keep you logged in. It is needed for the app to work.</li>
</ul>

<h2>Who else sees some of it</h2>
<ul>
<li><b>Railway</b> hosts the app and its database.</li>
<li><b>postcodes.io</b> is asked for the location of your postcode district (nothing else is sent).</li>
<li><b>Open-Meteo</b> is sent that rough location to give frost, heat and dry-spell warnings.</li>
<li><b>Esri</b> supplies the satellite map pictures when you use the map. Like any website that loads images, it can see
your device's internet address and the part of the map you look at. Your garden plan isn't sent to it.</li>
<li><b>Google Fonts</b> and <b>cdnjs (Cloudflare)</b> supply the app's text style and map software, so they can see your
device's internet address too.</li>
<li><b>Resend</b> sends the password reset emails, so it sees your email address.</li>
<li><b>Shops we link to</b> (such as Amazon, Thompson &amp; Morgan, Suttons, B&amp;Q and Wickes). Once you tap through to a
shop, its own privacy policy applies. See the <a href="/affiliate-disclosure">Affiliate Disclosure</a>.</li>
</ul>

<h2>How long we keep it</h2>
<p>For as long as you have an account. If you delete your account (<b>Me</b> &rarr; delete account), your account and
garden are removed from our database straight away.</p>

<h2>Your rights</h2>
<p>You can ask to see, correct, or delete your information, or ask us to stop using it. You can change your name, email and
postcode, and delete your account, in the app under <b>Me</b>. For anything else, contact %(contact)s. If you're unhappy
with how we've handled your data, you can complain to the Information Commissioner's Office (ico.org.uk).</p>

<h2>Children</h2>
<p>The app is written to be simple for children. You need to be 13 or older to set up an account on your own. Younger
children should have a grown-up set it up with them, and that grown-up is responsible for the account.</p>

<h2>Changes</h2>
<p>If we change this page in a way that matters, we'll update the date at the top.</p>
"""

TERMS = """
<h1>Terms of Use</h1>
<p class="muted">Last updated %(updated)s</p>
<p>By making an account or using Grow to Gobble you agree to these terms.</p>

<h2>Using the app</h2>
<ul>
<li>Be 13 or older, or have a grown-up set it up with you.</li>
<li>Give a real email address and keep your password to yourself. You're responsible for what happens on your account.</li>
<li>Don't try to break the app, get into other people's accounts, or use it to do anything unlawful.</li>
</ul>

<h2>Advice is a guide, not a promise</h2>
<p>The planting dates, jobs, weather warnings and tips are general guidance for the UK. Weather, soil and luck vary, so
we can't promise a good harvest. Take care with tools, ladders and when building things from the Build guides, and
get a grown-up to help with anything sharp or heavy. Only eat plants you are sure are safe to eat, and wash what you
pick.</p>

<h2>Shop links</h2>
<p>Some links take you to shops. We may earn a commission if you buy (see the
<a href="/affiliate-disclosure">Affiliate Disclosure</a>). Prices, stock and delivery are the shop's responsibility, not
ours.</p>

<h2>Your content</h2>
<p>Your garden plans and notes belong to you. You let us store and show them back to you so the app works.</p>

<h2>Changes and ending</h2>
<p>The app is provided as it is, and may change or have downtime. You can delete your account at any time under
<b>Me</b>. We may close accounts that break these terms. To the extent the law allows, we aren't responsible for
losses from using the app, but nothing here limits rights you have by law.</p>

<h2>Contact</h2>
<p>Questions: %(contact)s.</p>
"""

AFFILIATE = """
<h1>Affiliate Disclosure</h1>
<p class="muted">Last updated %(updated)s</p>
<p>Grow to Gobble is free to use. Some of the buy links in the app, on plant pages, shopping lists and Build It
guides, are <b>affiliate links</b>. If you tap one and buy something, the shop may pay us a small commission.
<b>It doesn't cost you anything extra.</b></p>
<p>We link to a shop because it sells what you need. A link is never a promise that it is the cheapest or the best, so
it's worth comparing.</p>
<p><b>As an Amazon Associate we earn from qualifying purchases.</b> We also take part in the Awin affiliate network
for shops such as Thompson &amp; Morgan, Suttons, B&amp;Q and Wickes.</p>
<p>When you follow a link, the shop (or Awin) may set a cookie on your device to record that you came from us. That cookie
belongs to them and is covered by their policies. See also our <a href="/privacy">Privacy Policy</a>.</p>
<p>Questions: %(contact)s.</p>
"""

PAGES = {
    "privacy": ("Privacy Policy", PRIVACY),
    "terms": ("Terms of Use", TERMS),
    "affiliate": ("Affiliate Disclosure", AFFILIATE),
}

SHELL = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s - Grow to Gobble</title>
<meta name="robots" content="index,follow">
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(canon)s">
<link rel="icon" href="/static/icons/icon.svg" type="image/svg+xml">
<style>
:root { color-scheme: light dark; --bg:#f3f5f2; --fg:#1d2a1f; --muted:#5b6b5e; --green:#2f7d3a; }
@media (prefers-color-scheme: dark) { :root { --bg:#141a15; --fg:#e8efe9; --muted:#9fb0a3; --green:#7fd38a; } }
body { margin:0; background:var(--bg); color:var(--fg); font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:720px; margin:0 auto; padding:24px 20px 56px; }
h1 { font-size:2rem; line-height:1.2; margin:.4em 0 .2em; }
h2 { font-size:1.25rem; margin:1.6em 0 .4em; }
a { color:var(--green); }
.muted { color:var(--muted); font-size:.9rem; }
.top { font-weight:800; text-decoration:none; }
nav.foot { margin-top:40px; padding-top:16px; border-top:1px solid color-mix(in srgb, var(--muted) 35%%, transparent); }
nav.foot a { margin-right:16px; }
</style>
</head>
<body><main>
<a class="top" href="/">&larr; Grow to Gobble</a>
%(body)s
<nav class="foot"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
</main></body></html>
"""


def page(name):
    title, body = PAGES[name]
    path = {"privacy": "/privacy", "terms": "/terms", "affiliate": "/affiliate-disclosure"}[name]
    desc = {"privacy": "How Grow to Gobble handles your information, in plain words.",
            "terms": "The terms for using Grow to Gobble.",
            "affiliate": "How Grow to Gobble earns a small commission from some shop links, at no extra cost to you."}[name]
    canon = os.environ.get("SITE_URL", "https://www.growtogobble.co.uk").strip().rstrip("/") + path
    return SHELL % {"title": title, "desc": html.escape(desc), "canon": html.escape(canon),
                    "body": body % {"updated": UPDATED, "contact": contact()}}
