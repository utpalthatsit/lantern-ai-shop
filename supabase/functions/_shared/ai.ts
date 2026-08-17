/* ============================================================
   ShopSathi — _shared/ai.ts
   Provider-agnostic AI client. Prefers Google Gemini (free tier)
   when GEMINI_API_KEY is set; falls back to Anthropic Claude
   when ANTHROPIC_API_KEY is set. Never requires both.
   ============================================================ */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type AIProvider = "gemini" | "anthropic" | null;

export function pickAIProvider(): AIProvider {
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  return null;
}

export function modelName(): string {
  return pickAIProvider() === "gemini"
    ? (Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest")
    : (Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5");
}

/** Known-good free Gemini models, tried in order when the configured model is quota-limited or overloaded. */
const GEMINI_MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

/** Models to try for Gemini: configured one first (or GEMINI_MODELS="a,b,c"), then known-good free models. */
export function geminiModelList(): string[] {
  const raw = (Deno.env.get("GEMINI_MODELS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const configured = raw.length ? raw : [Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest"];
  const list: string[] = [];
  for (const m of [...configured, ...GEMINI_MODEL_FALLBACKS]) {
    if (!list.includes(m)) list.push(m);
  }
  return list;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string; // JSON string of arguments
  signature?: string; // Gemini thinking models: thought_signature to echo back
}

export interface ModelReply {
  text: string | null;
  toolCalls: ToolCall[];
}

/**
 * One model round. `tools` are in Anthropic format ({name, description, input_schema}).
 * Messages are OpenAI-compatible for Gemini; Anthropic-compatible for Claude —
 * use pushAssistantTurn / pushToolResults to extend them safely.
 */
export async function requestModel(
  provider: AIProvider,
  system: string,
  messages: any[],
  tools: any[],
  maxTokens = 1024,
  modelOverride?: string,
): Promise<ModelReply> {
  if (provider === "gemini") {
    const body: any = {
      model: modelOverride || modelName(),
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: maxTokens,
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
      body.tool_choice = "auto";
    }
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("GEMINI_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err: any = new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls || []).map((tc: any) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: tc.function?.name || "",
      args: typeof tc.function?.arguments === "string" ? tc.function.arguments : "{}",
      signature: tc.extra_content?.google?.thought_signature || undefined,
    }));
    return { text: typeof msg?.content === "string" ? msg.content : null, toolCalls };
  }

  if (provider === "anthropic") {
    const body: any = {
      model: modelName(),
      max_tokens: maxTokens,
      system,
      messages,
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = { type: "auto" };
    }
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err: any = new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const blocks: any[] = data.content || [];
    const toolCalls: ToolCall[] = blocks
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({ id: b.id, name: b.name, args: JSON.stringify(b.input || {}) }));
    const textBlock = blocks.find((b: any) => b.type === "text");
    return { text: textBlock?.text || null, toolCalls };
  }

  throw new Error("No AI key configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)");
}

/** Append the assistant's tool-call turn (provider-aware). */
export function pushAssistantTurn(messages: any[], provider: AIProvider, reply: ModelReply): void {
  if (provider === "gemini") {
    messages.push({
      role: "assistant",
      content: reply.text,
      tool_calls: reply.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
        ...(tc.signature ? { extra_content: { google: { thought_signature: tc.signature } } } : {}),
      })),
    });
  } else {
    messages.push({
      role: "assistant",
      content: reply.toolCalls.map((tc) => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.args || "{}"),
      })),
    });
  }
}

/** Append tool results (provider-aware). */
export function pushToolResults(messages: any[], provider: AIProvider, results: { toolCallId: string; content: string }[]): void {
  if (provider === "gemini") {
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
  } else {
    messages.push({
      role: "user",
      content: results.map((r) => ({ type: "tool_result", tool_use_id: r.toolCallId, content: r.content })),
    });
  }
}

/** One-shot text completion (business summaries, marketing drafts). */
export async function completeText(system: string, user: string, maxTokens = 500): Promise<string> {
  const { reply } = await requestModelWithFallback(system, [{ role: "user", content: user }], [], maxTokens);
  return (reply.text || "").trim();
}

/* ---------- Provider failover + retry ---------- */
const RETRYABLE_STATUS = new Set([429, 503]);

function retryDelayMs(attempt: number): number {
  return 800 * attempt + Math.floor(Math.random() * 300);
}

/**
 * One model round with provider failover + retry:
 *  1. prefers the configured provider (Gemini first, then Anthropic)
 *  2. retries quota/overload errors (429/503) and network failures
 *  3. on persistent failure, tries the other configured provider
 * Returns the provider actually used so the caller can format turns.
 */
export async function requestModelWithFallback(
  system: string,
  messages: any[],
  tools: any[],
  maxTokens = 1024,
): Promise<{ reply: ModelReply; provider: AIProvider }> {
  const primary = pickAIProvider();
  if (!primary) throw new Error("No AI key configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)");
  const fallback: AIProvider =
    primary === "gemini" && Deno.env.get("ANTHROPIC_API_KEY") ? "anthropic"
    : primary === "anthropic" && Deno.env.get("GEMINI_API_KEY") ? "gemini"
    : null;
  const order: AIProvider[] = fallback ? [primary, fallback] : [primary];
  let lastError: Error | null = null;

  for (const provider of order) {
    let providerError: Error | null = null;
    // Model-level fallback: Gemini free-tier quota/overload errors are often
    // per-model, so try the next free model before giving up on this provider.
    const models = provider === "gemini" ? geminiModelList() : [modelName()];
    for (const model of models) {
      let modelError: Error | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const reply = await requestModel(provider, system, messages, tools, maxTokens, model);
          return { reply, provider };
        } catch (e: any) {
          modelError = e instanceof Error ? e : new Error(String(e));
          const status = Number((modelError as any).status) || 0;
          const retryable = RETRYABLE_STATUS.has(status) || status === 0;
          if (!retryable || attempt === 2) break;
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
        }
      }
      providerError = modelError || providerError;
      // Only key/auth errors are model-independent — a 400/404 can mean a bad model
      // name, so keep trying the next model. 429/503 already moved us here.
      const status = Number((modelError as any).status) || 0;
      if (status === 401 || status === 403) break;
    }
    lastError = providerError || lastError;
  }
  throw lastError || new Error("AI request failed");
}
