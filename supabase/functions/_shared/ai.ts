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
): Promise<ModelReply> {
  if (provider === "gemini") {
    const body: any = {
      model: modelName(),
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
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  const provider = pickAIProvider();
  if (!provider) throw new Error("No AI key configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)");
  const { text } = await requestModel(provider, system, [{ role: "user", content: user }], [], maxTokens);
  return (text || "").trim();
}
