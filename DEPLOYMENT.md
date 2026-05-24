# Deployment simple - WalletBRED v:2

Esta guia es para publicar, probar y mantener la app sin confundirse con previews protegidas ni URLs temporales.

## Links importantes

Usa siempre la URL estable:

```txt
https://wallet-glow-link-wallet.vercel.app
```

Chat IA:

```txt
https://wallet-glow-link-wallet.vercel.app/ai
```

Webhook de Stripe:

```txt
https://wallet-glow-link-wallet.vercel.app/api/public/stripe/webhook
```

Webhook de Telegram:

```txt
https://wallet-glow-link-wallet.vercel.app/api/public/telegram/webhook
```

No uses URLs tipo:

```txt
https://wallet-glow-link-wallet-xxxxx-fabian-br-ed-s-projects.vercel.app
```

Esas son URLs internas de deployment/preview y pueden pedir login de Vercel.

## Abrir el proyecto en VS Code

La carpeta preparada esta en:

```txt
/Users/fabianhonoriogonzalezandrade/Downloads/WalletBRED v:2
```

Comandos para trabajar localmente:

```bash
npm install
npm run dev
```

## Automatizacion

El proyecto trae un script principal:

```bash
npm run release
```

Ese comando hace:

1. Revisa variables de Vercel.
2. Aplica/verifica la migracion de Supabase.
3. Instala dependencias si falta `node_modules`.
4. Ejecuta lint.
5. Hace build para Vercel.
6. Publica en produccion.
7. Verifica las URLs publicas.

Comandos separados:

```bash
npm run check:env
npm run migrate:supabase
npm run stripe:setup-webhook
npm run deploy:prod
npm run verify:prod
```

Si Supabase pide login:

```bash
npx supabase login
npm run release
```

Para revisar antes de publicar:

```bash
npm run lint
npm run build
```

El lint puede mostrar warnings de Fast Refresh en componentes UI. Eso no bloquea el deployment si no hay errores.

## Publicar en Vercel

Desde la carpeta del proyecto:

```bash
VERCEL=1 npm run build
npx vercel deploy --prebuilt --prod --yes --scope team_ochFGBnFLgoXTgbQ79qH4MJP
```

Despues de publicar, verifica:

```bash
curl -I "https://wallet-glow-link-wallet.vercel.app/"
curl -I "https://wallet-glow-link-wallet.vercel.app/ai"
```

Debe responder `HTTP/2 200`.

## Variables de Vercel

En Vercel deben existir estas variables en Production:

```env
APP_URL=https://wallet-glow-link-wallet.vercel.app

TELEGRAM_BOT_TOKEN=...
# Opcional: si quieres un secreto fijo para validar el webhook de Telegram.
TELEGRAM_WEBHOOK_SECRET=...
ADMIN_IDS=91147095
ADMIN_TELEGRAM_USER_ID=91147095
ADMIN_WEB_ACCESS_KEY=...

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_VIP_BASIC=...
STRIPE_PRICE_VIP_PRO=...
STRIPE_PRICE_VIP_ELITE=...
STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID=...
STRIPE_TREASURY_CONNECTED_ACCOUNT_ID=acct_1TaQwi2camyZi7do
MARKETPLACE_PLATFORM_FEE_BPS=1500
MARKETPLACE_DEFAULT_COUNTRY=MX
MARKETPLACE_DEFAULT_CURRENCY=MXN

SUPABASE_URL=https://nshutjhqgnsclvbhuxty.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=https://nshutjhqgnsclvbhuxty.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=nshutjhqgnsclvbhuxty

AI_PROVIDER=groq
GROQ_API_KEY=...
AI_CHAT_MODEL=llama-3.1-8b-instant
```

Notas:

- Las variables `VITE_*` son publicas para el navegador.
- Nunca pongas `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GROQ_API_KEY` ni `TELEGRAM_BOT_TOKEN` en codigo.
- Si pegas una clave en un chat o documento, conviene rotarla.

Para ver variables configuradas en Vercel:

```bash
npx vercel env ls production --scope team_ochFGBnFLgoXTgbQ79qH4MJP
```

## Telegram

En BotFather usa la URL estable:

```txt
https://wallet-glow-link-wallet.vercel.app
```

Configura:

1. `/newbot` si aun no existe el bot.
2. `/newapp` para crear la Mini App.
3. Menu Button con la URL estable.

Si el bot ya apunta a `https://wallet-glow-link-wallet.vercel.app`, no hay que cambiarlo cada vez que se actualiza Vercel.

Webhook del bot:

```txt
https://wallet-glow-link-wallet.vercel.app/api/public/telegram/webhook
```

El servidor valida `X-Telegram-Bot-Api-Secret-Token` con `TELEGRAM_WEBHOOK_SECRET` si existe. Si no existe, usa un secreto derivado de `TELEGRAM_BOT_TOKEN`.

## Stripe

En Stripe Dashboard crea o revisa:

1. Productos VIP mensuales.
2. Precios o montos para:
   - `STRIPE_PRICE_VIP_BASIC`
   - `STRIPE_PRICE_VIP_PRO`
   - `STRIPE_PRICE_VIP_ELITE`
3. Webhook endpoint:

```txt
https://wallet-glow-link-wallet.vercel.app/api/public/stripe/webhook
```

Eventos a activar:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
payment_intent.succeeded
payment_intent.payment_failed
payment_method.attached
```

Copia el signing secret del webhook (`whsec_...`) en Vercel como:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Prueba con Stripe CLI:

```bash
stripe listen --forward-to https://wallet-glow-link-wallet.vercel.app/api/public/stripe/webhook
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
```

Si da `400 Invalid signature`, el `STRIPE_WEBHOOK_SECRET` no corresponde a ese endpoint.

### Automatizar webhook de Stripe

Si tienes `STRIPE_SECRET_KEY` en `.env.local`, puedes crear/reusar el webhook y guardar el `whsec_...` en Vercel con:

```bash
npm run stripe:setup-webhook
```

Para crear/reusar los productos VIP de WalletBRED en Stripe, guardar los `price_...` en Vercel, sincronizar `vip_plans` en Supabase y configurar el webhook:

```bash
npm run stripe:bootstrap
```

Ese comando requiere una `STRIPE_SECRET_KEY` real en `.env.production.local`, `.env.local` o `.env`. Si la variable existe en Vercel pero esta vacia, Stripe no puede crear productos ni precios.

Ese comando usa esta URL:

```txt
https://wallet-glow-link-wallet.vercel.app/api/public/stripe/webhook
```

Notas importantes:

- No pegues claves de Stripe en archivos versionados.
- Si usas un ZIP de ejemplo de Stripe, tomalo solo como referencia. No copies claves hardcodeadas al proyecto.
- El webhook de produccion debe usar una clave de produccion y un `whsec_...` del endpoint de produccion.

## Supabase

Proyecto:

```txt
nshutjhqgnsclvbhuxty
```

URL:

```txt
https://nshutjhqgnsclvbhuxty.supabase.co
```

Tablas usadas por la app:

```txt
subscriptions
stripe_webhook_events
wallet_movements
```

La tabla `wallet_movements` debe tener la columna:

```txt
stripe_payment_intent_id
```

Para aplicar migraciones con Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref nshutjhqgnsclvbhuxty --yes
npx supabase db query --linked --file supabase/migrations/20260522093000_add_stripe_payment_intent_to_movements.sql
```

Verificar esquema:

```bash
npx supabase db lint --linked --level warning
```

## IA con Groq

La app usa Groq como proveedor de IA gratis:

```env
AI_PROVIDER=groq
AI_CHAT_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=...
```

Prueba:

```txt
https://wallet-glow-link-wallet.vercel.app/ai
```

Si responde error de proveedor, revisa:

1. `GROQ_API_KEY` en Vercel.
2. `AI_PROVIDER=groq`.
3. `AI_CHAT_MODEL=llama-3.1-8b-instant`.

## Guardar cambios en Git

Despues de editar:

```bash
git status --short
git add .
git commit -m "Describe el cambio"
```

El ultimo commit guardado antes de esta guia fue:

```txt
43bf049 - Update AI provider and Stripe webhook
```

## Checklist rapido

Antes de decir que esta listo:

- [ ] `npm run build` pasa.
- [ ] `npm run lint` no tiene errores.
- [ ] Vercel deploy queda `READY`.
- [ ] `https://wallet-glow-link-wallet.vercel.app/` responde `200`.
- [ ] `https://wallet-glow-link-wallet.vercel.app/ai` responde `200`.
- [ ] BotFather usa la URL estable.
- [ ] Stripe webhook usa la URL estable.
- [ ] Supabase tiene la columna `stripe_payment_intent_id`.
