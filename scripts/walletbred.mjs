#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const APP_URL = "https://wallet-glow-link-wallet.vercel.app";
const TEAM_SCOPE = "team_ochFGBnFLgoXTgbQ79qH4MJP";
const VERCEL_PROJECT = "wallet-glow-link-wallet";
const SUPABASE_PROJECT_REF = "nshutjhqgnsclvbhuxty";
const PAYMENT_INTENT_MIGRATION =
  "supabase/migrations/20260522093000_add_stripe_payment_intent_to_movements.sql";
const WALLET_WEB_USER_MIGRATION =
  "supabase/migrations/20260522201000_add_web_user_id_to_wallet_movements.sql";
const BANKING_PREPARATION_MIGRATION =
  "supabase/migrations/20260523061000_add_banking_preparation.sql";
const WEB_WALLET_REGISTRATION_MIGRATION =
  "supabase/migrations/20260524150007_add_web_wallet_registration.sql";

const requiredVercelEnv = [
  "APP_URL",
  "TELEGRAM_BOT_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_VIP_BASIC",
  "STRIPE_PRICE_VIP_PRO",
  "STRIPE_PRICE_VIP_ELITE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "AI_PROVIDER",
  "GROQ_API_KEY",
  "AI_CHAT_MODEL",
];

const recommendedVercelEnv = [
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID",
  "STRIPE_TREASURY_CONNECTED_ACCOUNT_ID",
];
const privateAccessEnv = ["ADMIN_TELEGRAM_USER_ID", "ADMIN_WEB_ACCESS_KEY"];

const stripeWebhookUrl = `${APP_URL}/api/public/stripe/webhook`;
const stripeWebhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_method.attached",
  "treasury.outbound_transfer.created",
  "treasury.outbound_transfer.posted",
  "treasury.outbound_transfer.failed",
  "treasury.outbound_transfer.canceled",
  "treasury.outbound_transfer.returned",
];

const stripeVipPlans = [
  {
    planId: "basic",
    envName: "STRIPE_PRICE_VIP_BASIC",
    name: "WalletBRED VIP Basic",
    description: "Acceso inicial VIP",
    unitAmount: 10000,
    currency: "usd",
    perks: ["Sin anuncios", "Acceso basico", "Soporte por email"],
  },
  {
    planId: "pro",
    envName: "STRIPE_PRICE_VIP_PRO",
    name: "WalletBRED VIP Pro",
    description: "Plan recomendado para usuarios frecuentes",
    unitAmount: 25000,
    currency: "usd",
    perks: ["Todo Basic", "Contenido premium", "Soporte prioritario"],
  },
  {
    planId: "elite",
    envName: "STRIPE_PRICE_VIP_ELITE",
    name: "WalletBRED VIP Elite",
    description: "Acceso completo y prioridad maxima",
    unitAmount: 50000,
    currency: "usd",
    perks: ["Todo Pro", "Acceso temprano", "Atencion privada"],
  },
];

const commands = {
  "check-env": checkEnv,
  deploy: deploy,
  "migrate-supabase": migrateSupabase,
  release: release,
  "stripe-bootstrap": bootstrapStripe,
  "stripe-webhook": setupStripeWebhook,
  verify: verify,
};

const command = process.argv[2] ?? "help";
const strict = process.argv.includes("--strict");

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (!commands[command]) {
  console.error(`Comando desconocido: ${command}`);
  printHelp();
  process.exit(1);
}

await commands[command]();

function printHelp() {
  console.log(`
WalletBRED automation

Uso:
  npm run check:env
  npm run migrate:supabase
  npm run deploy:prod
  npm run verify:prod
  npm run release
  npm run stripe:setup-webhook
  node scripts/walletbred.mjs stripe-bootstrap

Comandos directos:
  node scripts/walletbred.mjs check-env [--strict]
  node scripts/walletbred.mjs migrate-supabase
  node scripts/walletbred.mjs deploy
  node scripts/walletbred.mjs verify
  node scripts/walletbred.mjs release
  node scripts/walletbred.mjs stripe-bootstrap
  node scripts/walletbred.mjs stripe-webhook
`);
}

async function checkEnv() {
  console.log("Revisando variables de Vercel Production...");
  ensureVercelLinked();
  const result = run("npx", ["vercel", "env", "ls", "production", "--scope", TEAM_SCOPE], {
    allowFailure: true,
  });

  if (result.status !== 0) {
    console.error("No pude leer las variables de Vercel. Revisa login de Vercel.");
    if (result.stderr) console.error(result.stderr.trim());
    if (result.stdout) console.error(result.stdout.trim());
    process.exit(1);
  }

  const output = result.stdout + result.stderr;
  const missingRequired = requiredVercelEnv.filter((name) => !hasEnvName(output, name));
  const missingRecommended = recommendedVercelEnv.filter((name) => !hasEnvName(output, name));
  const missingPrivateAccess = privateAccessEnv.filter((name) => !hasEnvName(output, name));

  if (missingRequired.length === 0) {
    console.log("Variables requeridas: OK");
  } else {
    console.log("Variables requeridas faltantes:");
    for (const name of missingRequired) console.log(`- ${name}`);
  }

  if (missingRecommended.length > 0) {
    console.log("Variables recomendadas faltantes:");
    for (const name of missingRecommended) console.log(`- ${name}`);
  }

  if (missingPrivateAccess.length > 0) {
    console.log("Variables de acceso privado recomendadas:");
    for (const name of missingPrivateAccess) console.log(`- ${name}`);
  }

  if (
    strict &&
    (missingRequired.length > 0 || missingRecommended.length > 0 || missingPrivateAccess.length > 0)
  ) {
    process.exit(1);
  }

  if (missingRequired.length > 0) {
    console.log("Continuo sin fallar porque check-env no esta en modo --strict.");
  }
}

async function migrateSupabase() {
  console.log("Aplicando migracion Supabase idempotente...");
  const migrations = [
    PAYMENT_INTENT_MIGRATION,
    WALLET_WEB_USER_MIGRATION,
    BANKING_PREPARATION_MIGRATION,
    WEB_WALLET_REGISTRATION_MIGRATION,
  ];
  for (const migration of migrations) {
    if (!existsSync(migration)) {
      console.error(`No existe el archivo: ${migration}`);
      process.exit(1);
    }
  }

  run("npx", ["supabase", "link", "--project-ref", SUPABASE_PROJECT_REF, "--yes"]);
  for (const migration of migrations) {
    run("npx", ["supabase", "db", "query", "--linked", "--file", migration]);
  }
  run("npx", ["supabase", "db", "lint", "--linked", "--level", "warning"]);

  console.log("Supabase: migracion y lint completados.");
}

async function deploy() {
  console.log("Compilando para Vercel...");
  ensureVercelLinked();
  ensureDependencies();
  run("npm", ["run", "lint"]);
  run("npm", ["run", "build"], {
    env: {
      VERCEL: "1",
    },
  });

  console.log("Publicando en Vercel Production...");
  run("npx", ["vercel", "deploy", "--prebuilt", "--prod", "--yes", "--scope", TEAM_SCOPE]);
}

async function verify() {
  console.log("Verificando URLs publicas...");
  await checkUrl(APP_URL);
  await checkUrl(`${APP_URL}/ai`);
  console.log("Verificacion publica: OK");
}

async function release() {
  await checkEnv();

  try {
    await migrateSupabase();
  } catch (error) {
    console.error("No se pudo completar Supabase.");
    console.error("Ejecuta `npx supabase login` y vuelve a correr `npm run release`.");
    throw error;
  }

  await deploy();
  await verify();

  console.log("");
  console.log("Release completo.");
  console.log(`URL: ${APP_URL}`);
  console.log(`Chat IA: ${APP_URL}/ai`);
}

async function bootstrapStripe() {
  console.log("Preparando Stripe para WalletBRED...");
  ensureVercelLinked();
  await loadLocalEnvFiles([".env.production.local", ".env.local", ".env"]);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !/^(sk|rk)_(test|live)_/.test(stripeKey)) {
    console.error("Falta STRIPE_SECRET_KEY valida en .env.production.local, .env.local o .env.");
    console.error("No se imprimen ni se guardan claves en codigo.");
    process.exit(1);
  }

  const createdPrices = [];
  for (const plan of stripeVipPlans) {
    const product = await ensureStripeProduct(stripeKey, plan);
    const price = await ensureStripeMonthlyPrice(stripeKey, product.id, plan);
    createdPrices.push({ ...plan, productId: product.id, priceId: price.id });

    upsertVercelEnv(plan.envName, price.id);
    console.log(`${plan.envName}: ${price.id}`);
  }

  await syncSupabaseVipPlans(createdPrices);
  await setupStripeWebhook();
  console.log("Stripe listo: productos, precios, webhook y variables actualizadas.");
}

async function setupStripeWebhook() {
  console.log("Configurando webhook de Stripe...");
  ensureVercelLinked();
  await loadLocalEnvFiles([".env.production.local", ".env.local", ".env"]);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("Falta STRIPE_SECRET_KEY en tu terminal, .env.local o .env.");
    console.error(
      "No puedo leer claves sensitive desde Vercel. Ponla temporalmente en .env.local y repite.",
    );
    process.exit(1);
  }

  if (!/^(sk|rk)_(test|live)_/.test(stripeKey)) {
    console.error("STRIPE_SECRET_KEY no parece una clave valida de Stripe.");
    process.exit(1);
  }

  const existing = await stripeRequest("/v1/webhook_endpoints?limit=100", {
    stripeKey,
    method: "GET",
  });
  const current = existing.data?.find(
    (endpoint) => endpoint.url === stripeWebhookUrl && endpoint.status !== "disabled",
  );

  let endpoint = current;
  if (endpoint) {
    console.log(`Webhook existente: ${endpoint.id}`);
    endpoint = await stripeRequest(`/v1/webhook_endpoints/${endpoint.id}`, {
      stripeKey,
      method: "GET",
    });
    if (!endpoint.secret?.startsWith("whsec_")) {
      console.log("Stripe no muestra el secreto de webhooks existentes; creo uno nuevo.");
      const disableBody = new URLSearchParams();
      disableBody.set("disabled", "true");
      await stripeRequest(`/v1/webhook_endpoints/${endpoint.id}`, {
        stripeKey,
        method: "POST",
        body: disableBody,
      });
      endpoint = null;
    }
  }

  if (!endpoint) {
    const body = new URLSearchParams();
    body.set("url", stripeWebhookUrl);
    body.set("description", "WalletBRED production webhook");
    for (const event of stripeWebhookEvents) body.append("enabled_events[]", event);

    endpoint = await stripeRequest("/v1/webhook_endpoints", {
      stripeKey,
      method: "POST",
      body,
    });
    console.log(`Webhook creado: ${endpoint.id}`);
  }

  if (!endpoint.secret?.startsWith("whsec_")) {
    console.error("Stripe no devolvio el signing secret del webhook.");
    console.error(
      "Abre Stripe Dashboard > Developers > Webhooks > Signing secret y agregalo manualmente.",
    );
    process.exit(1);
  }

  upsertVercelEnv("STRIPE_WEBHOOK_SECRET", endpoint.secret);
  console.log("STRIPE_WEBHOOK_SECRET guardado en Vercel Production.");
  await checkEnv();
}

async function ensureStripeProduct(stripeKey, plan) {
  const products = await stripeRequest("/v1/products?active=true&limit=100", {
    stripeKey,
    method: "GET",
  });
  const current = products.data?.find(
    (product) => product.metadata?.walletbred_plan_id === plan.planId,
  );

  if (current) return current;

  const body = new URLSearchParams();
  body.set("name", plan.name);
  body.set("description", plan.description);
  body.set("metadata[walletbred_plan_id]", plan.planId);
  body.set("metadata[app]", "walletbred");

  return stripeRequest("/v1/products", {
    stripeKey,
    method: "POST",
    body,
  });
}

async function ensureStripeMonthlyPrice(stripeKey, productId, plan) {
  const prices = await stripeRequest(`/v1/prices?active=true&limit=100&product=${productId}`, {
    stripeKey,
    method: "GET",
  });
  const current = prices.data?.find(
    (price) =>
      price.currency === plan.currency &&
      price.unit_amount === plan.unitAmount &&
      price.recurring?.interval === "month",
  );

  if (current) return current;

  const body = new URLSearchParams();
  body.set("product", productId);
  body.set("currency", plan.currency);
  body.set("unit_amount", String(plan.unitAmount));
  body.set("recurring[interval]", "month");
  body.set("metadata[walletbred_plan_id]", plan.planId);
  body.set("metadata[app]", "walletbred");

  return stripeRequest("/v1/prices", {
    stripeKey,
    method: "POST",
    body,
  });
}

async function syncSupabaseVipPlans(plans) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    console.log("Supabase: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY; omito sync de planes.");
    return;
  }

  for (const plan of plans) {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/vip_plans?plan_id=eq.${encodeURIComponent(
        plan.planId,
      )}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          name: plan.name.replace("WalletBRED VIP ", ""),
          description: plan.description,
          amount_cents: plan.unitAmount,
          currency: plan.currency,
          stripe_price_id: plan.priceId,
          perks: plan.perks,
          active: true,
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase no pudo actualizar ${plan.planId}: ${message}`);
    }
  }

  console.log("Supabase: vip_plans sincronizado con Stripe.");
}

async function checkUrl(url) {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`${url} respondio ${response.status}`);
  }
  console.log(`${url} -> ${response.status}`);
}

function hasEnvName(output, name) {
  return new RegExp(`(^|\\n)\\s*${escapeRegExp(name)}\\s+Encrypted\\s+Production\\b`).test(output);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    input: options.input,
    stdio: options.allowFailure ? "pipe" : "inherit",
  });

  if (options.allowFailure) return result;

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} fallo con codigo ${result.status}`);
  }

  return result;
}

function upsertVercelEnv(name, value) {
  const current = run("npx", ["vercel", "env", "ls", "production", "--scope", TEAM_SCOPE], {
    allowFailure: true,
  });
  const output = current.stdout + current.stderr;

  if (hasEnvName(output, name)) {
    run("npx", ["vercel", "env", "rm", name, "production", "--yes", "--scope", TEAM_SCOPE]);
  }

  run("npx", [
    "vercel",
    "env",
    "add",
    name,
    "production",
    "--yes",
    "--sensitive",
    "--scope",
    TEAM_SCOPE,
    "--value",
    value,
  ]);
}

async function stripeRequest(path, { stripeKey, method, body }) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${stripeKey}:`).toString("base64")}`,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";

  const response = await fetch(`https://api.stripe.com${path}`, { method, headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Stripe respondio ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function loadLocalEnvFiles(files) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = await readFile(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

function ensureVercelLinked() {
  if (existsSync(".vercel/project.json")) return;

  console.log("Vinculando carpeta local con el proyecto de Vercel...");
  run("npx", ["vercel", "link", "--yes", "--scope", TEAM_SCOPE, "--project", VERCEL_PROJECT]);
}

function ensureDependencies() {
  if (existsSync("node_modules/.bin/vite") && existsSync("node_modules/.bin/eslint")) return;

  console.log("Instalando dependencias locales...");
  run("npm", ["install"]);
}
