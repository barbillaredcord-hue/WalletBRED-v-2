import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWalletUser } from "./telegram-auth.middleware";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const inputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
  demo: z.boolean().optional(),
});

type ResponsesApiTextPart = {
  type?: string;
  text?: string;
};

type ResponsesApiOutputItem = {
  type?: string;
  content?: ResponsesApiTextPart[];
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: ResponsesApiOutputItem[];
  error?: {
    message?: string;
    code?: string | null;
  };
};

function extractText(payload: ResponsesApiResponse) {
  if (payload.output_text) return payload.output_text.trim();

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return text || "No pude generar una respuesta en este momento.";
}

function getAiConfig() {
  const provider = process.env.AI_PROVIDER === "groq" ? "groq" : "openai";

  if (provider === "groq") {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY,
      apiKeyName: "GROQ_API_KEY",
      endpoint: "https://api.groq.com/openai/v1/responses",
      model:
        process.env.AI_CHAT_MODEL ??
        process.env.GROQ_CHAT_MODEL ??
        process.env.OPENAI_CHAT_MODEL ??
        "openai/gpt-oss-20b",
    };
  }

  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY,
    apiKeyName: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/responses",
    model: process.env.AI_CHAT_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
  };
}

function formatAiError(provider: string, status: number, payload: ResponsesApiResponse) {
  const providerName = provider === "groq" ? "Groq" : "OpenAI";

  if (payload.error?.code === "insufficient_quota") {
    return [
      `No pude completar la respuesta con ${providerName} porque el proyecto no tiene cuota disponible.`,
      "Revisa billing/credits o usa otra API key con saldo activo.",
    ].join(" ");
  }

  return `No pude completar la respuesta con ${providerName} (${status}). ${
    payload.error?.message ?? "Intenta de nuevo."
  }`;
}

export const sendAiChatMessage = createServerFn({ method: "POST" })
  .middleware([requireWalletUser])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const aiConfig = getAiConfig();
    if (!aiConfig.apiKey) {
      throw new Response(`${aiConfig.apiKeyName} is not configured`, { status: 500 });
    }

    const userContext = [
      "Eres el asistente de configuración de Wallet Glow Link, una wallet para Telegram Mini App.",
      "Ayuda a configurar Telegram, webhooks, Supabase, Stripe, QR, transferencias y planes VIP.",
      "Responde en español, con pasos concretos y sin inventar credenciales.",
    ].join(" ");

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        instructions: userContext,
        input: data.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        max_output_tokens: 700,
      }),
    });

    const payload = (await response.json()) as ResponsesApiResponse;
    if (!response.ok) {
      return { text: formatAiError(aiConfig.provider, response.status, payload) };
    }

    return { text: extractText(payload) };
  });
