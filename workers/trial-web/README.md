# Hosted trial frontend (tester-gated)

This Worker serves the built Vite app for the isolated Workers AI trial. It is
separate from production and from the trial API Worker.

- URL: `https://dotcomseekr-discovery-trial-web.mike-f16.workers.dev`
- Gate: `/login`; every app route requires a signed, HttpOnly session cookie.
- Access codes are posted to `/__auth`, checked against SHA-256 hashes in
  `FRONTEND_ACCESS_HASHES`, and never placed in a URL, HTML, source file or log.
- The login page stores the accepted code in this tab's `sessionStorage` under
  the existing trial key, so the wizard can send it to the trial API. A new tab
  asks for the code again.
- `/__logout` clears the gate cookie. This is a tester gate, not a user account
  system; there is no login, billing or identity.

## Build

The Worker requires `apps/web/dist` built with the trial API URL:

```bash
VITE_DISCOVERY_TRIAL_URL=https://dotcomseekr-discovery-trial.mike-f16.workers.dev \
  npm run build -w @dotcomseekr/web
```

The production `.env.production` still points dictionary and availability calls
at the existing Supabase functions; only variation generation goes to the
isolated Workers AI trial.

## Secrets

Set both only on the isolated Worker:

```bash
# Comma-separated SHA-256 hashes of the tester codes. Never the codes.
npx wrangler secret put FRONTEND_ACCESS_HASHES \
  --config workers/trial-web/wrangler.jsonc

# Random HMAC key for the signed gate cookie.
npx wrangler secret put SESSION_SECRET \
  --config workers/trial-web/wrangler.jsonc
```

Use `.trial/` (gitignored) for local secret files. Never commit the codes or the
HMAC key.

## Deploy and test

```bash
npx wrangler deploy --config workers/trial-web/wrangler.jsonc
```

The trial API's `TRIAL_ALLOWED_ORIGINS` must include the frontend origin above.
The gate is checked before assets are served; the app's trial calls still carry
the tester code and pseudonymous session to the API Worker, where the existing
usage caps and accounting apply.
