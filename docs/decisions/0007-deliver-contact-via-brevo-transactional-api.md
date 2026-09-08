# 7. Deliver Contact Form via Brevo Transactional Email API

- **Status:** Approved
- **Deciders:** Sam, Gen
- **Date:** 2026-09-08

## Context and Problem Statement

The contact form needs serverless outbound email delivery that costs nothing to operate. The original decision routed submissions through Cloudflare Email Routing via a `send_email` binding, sending from `contact@samananias.is-a.dev`. In production every submission silently failed (`delivered: false` in the KV archive): the sending domain cannot support Email Routing at all.

`samananias.is-a.dev` is a free `is-a.dev` subdomain that resolves as a plain CNAME to `gebportfolio.pages.dev`. Email Routing requires the sending domain to be a zone in the Cloudflare account with provider-managed MX/SPF records, and:

1. Cloudflare only accepts subdomain zones on Enterprise plans.
2. is-a.dev restricts NS records, blocking the delegation workaround.
3. The CNAME the website depends on cannot coexist with the MX/TXT records any email provider (including third parties like Resend) would require on the same name.

## Decision Options

1. **Register a real domain**: cleanest fix, but violates the constraint that the portfolio remain totally free.
2. **Resend free tier**: domain verification needs DKIM/SPF DNS records (blocked by the CNAME conflict); without it, sending is locked to the `onboarding@resend.dev` test sender, which Resend documents as testing-only.
3. **Brevo transactional email API (free plan)**: 300 emails/day, no domain authentication required — a sender address is verified by email confirmation, so the author's Gmail works as the sender.

## Decision Outcome

**Brevo transactional email API** is selected. The API route sends via `fetch` to Brevo's `/v3/smtp/email` endpoint using the `BREVO_API_KEY` secret (stored in the Cloudflare dashboard, never committed), from the verified `samananiascases@gmail.com` sender, with the visitor's address in `Reply-To`. The `send_email` binding was removed from `wrangler.jsonc`. This supersedes the "No third-party form services" stance of the previous Cloudflare Email Routing approach; a third-party email relay is accepted as the price of a zero-cost domain.

## Consequences

- **Positive**: Zero cost, no DNS changes, delivery failures are now logged and reported honestly (502 with recovery copy) instead of silently archived as success; KV archival (`contact:inbox:*`) remains as a backup so no message is lost.
- **Negative**: Sending relies on a third-party provider and its free-tier quota (300/day, far above realistic contact volume); the From address is a Gmail identity relayed by Brevo, so deliverability depends on Brevo's reputation rather than an authenticated custom domain. The contact page privacy panel was rewritten to name Brevo truthfully.
