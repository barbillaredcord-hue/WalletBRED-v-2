## Goal

Stop trusting the `/_app` client guard as the sole identity check. Move Telegram `initData` HMAC verification to the server boundary so every sensitive server function and `/api/*` route validates the caller, regardless of how the request was made (Mini App, curl, replayed fetch, future clients).

## Architecture

Two reusable building blocks in `src/lib/telegram-auth.middleware.ts`:

1. **`requireTelegramUser`** — server function middleware (`createMiddleware({ type: "function" })`)
   - `.client()` phase: reads `window.Telegram.WebApp.initData`, attaches it as `Authorization: tma <initData>` header on the outgoing RPC. Falls back to no header during SSR.
   - `.server()` phase: reads the `Authorization` header via `getRequestHeader`, runs the existing HMAC validation logic (extracted from `telegram-auth.functions.ts` into a pure helper `verifyInitData(initData, botToken)`), enforces 24h freshness, throws `Response('Unauthorized', { status: 401 })` on failure, and on success calls `next({ context: { telegramUser: { id, username, firstName }, authDate } })`.

2. **`requireTelegramUserRoute`** — request middleware (`createMiddleware()`) for `/api/*` server routes that should also be Telegram-gated. Same server-side validation, no `.client()` phase. Used via the route's `server.middleware` array.

Shared helper: `src/lib/telegram-auth.server.ts` exporting `verifyInitData()` and `extractInitDataFromAuthHeader()`. Both middlewares import from here so the validation logic lives in exactly one place.

## Refactor existing code

- `src/lib/telegram-auth.functions.ts` — keep `verifyTelegramInitData` server function (still useful for the `/_app` mount-time check) but reimplement it on top of `verifyInitData()` from the shared helper. No behavior change for callers.
- `src/routes/_app.tsx` — unchanged. The client guard stays as a UX layer (shows "Access denied" instead of letting routes render and individually 401). Real enforcement now lives server-side.

## Apply the middleware

Add `.middleware([requireTelegramUser])` to every server function that reads or mutates user-scoped data. In the current codebase that's only `verifyTelegramInitData` itself (which intentionally stays public — it IS the verifier). When new server functions are added for wallet/transfers/QR/VIP, they MUST include this middleware.

For server routes: leave `/api/public/telegram/webhook` alone (it has its own `X-Telegram-Bot-Api-Secret-Token` check — Telegram, not a user, calls it). Any future `/api/*` route that acts on behalf of a user gets `requireTelegramUserRoute`.

Document the rule in a short `## Telegram auth` section at the top of `src/lib/telegram-auth.middleware.ts` so it's discoverable.

## Failure handling

- Missing `TELEGRAM_BOT_TOKEN` → 500 with generic message, server logs the misconfig.
- Missing/empty `Authorization` header → 401.
- Bad HMAC, stale `auth_date` (>24h), missing `user.id` → 401.
- All errors thrown as `Response` so TanStack returns proper status codes; client `useServerFn` callers can catch and surface a re-auth prompt.

## Out of scope

- No DB writes, no rate limiting, no nonce/replay store. (Replay within the 24h window is possible — flag for a future iteration if wallet operations become real.)
- No changes to the webhook secret scheme.
- No changes to `src/start.ts` global middleware — gating is opt-in per endpoint to keep public routes (landing, login) cheap.

## Files touched

- **new** `src/lib/telegram-auth.server.ts` — `verifyInitData`, `extractInitDataFromAuthHeader`
- **new** `src/lib/telegram-auth.middleware.ts` — `requireTelegramUser`, `requireTelegramUserRoute`
- **edit** `src/lib/telegram-auth.functions.ts` — delegate to shared helper
- **edit** `src/routes/_app.tsx` — no functional change; client now sends `Authorization: tma <initData>` via the middleware path when calling the verify fn (small refactor to use `useServerFn` so the middleware's `.client()` runs)
