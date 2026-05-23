import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, SendHorizontal, Settings2, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/ui-bits";
import { sendAiChatMessage } from "@/lib/ai-chat.functions";

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const starters = [
  "Que me falta para publicar la Mini App en Telegram?",
  "Como configuro el webhook de Telegram?",
  "Ayudame a revisar variables para Stripe VIP",
];

function isDemoMode() {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1"
  );
}

function AiPage() {
  const sendMessage = useServerFn(sendAiChatMessage);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Listo. Puedo ayudarte a configurar Telegram, Supabase, Stripe, webhooks y el flujo VIP de esta wallet.",
    },
  ]);

  const quickActions = useMemo(() => starters, []);

  async function submitMessage(messageText: string) {
    const trimmed = messageText.trim();
    if (!trimmed || pending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const response = await sendMessage({
        data: {
          messages: nextMessages.slice(-10),
          demo: isDemoMode(),
        },
      });
      setMessages([...nextMessages, { role: "assistant", content: response.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo contactar la IA.");
      setMessages(nextMessages);
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage(input);
  }

  return (
    <div>
      <PageHeader title="Chat IA" subtitle="Asistente para configurar la wallet" />

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Configurador inteligente</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Usa IA desde el servidor para responder dudas de setup sin exponer la API key al
              navegador.
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {quickActions.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void submitMessage(prompt)}
            className="shrink-0 rounded-full border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="space-y-3 pb-36">
        {messages.map((message, index) => {
          const assistant = message.role === "assistant";
          return (
            <div
              key={`${message.role}-${index}`}
              className={`flex gap-2 ${assistant ? "justify-start" : "justify-end"}`}
            >
              {assistant && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
              )}
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-card ${
                  assistant ? "glass text-foreground" : "gradient-primary text-primary-foreground"
                }`}
              >
                {message.content}
              </div>
            </div>
          );
        })}

        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pensando...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="fixed bottom-24 left-1/2 z-40 flex w-[min(calc(100%-2rem),26rem)] -translate-x-1/2 gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Pregunta que quieres configurar..."
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm outline-none backdrop-blur focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-card disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <SendHorizontal className="h-5 w-5" />
          )}
        </button>
      </form>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Modelo configurable con <span className="font-mono">AI_CHAT_MODEL</span>.
      </div>
    </div>
  );
}
