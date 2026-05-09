const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";

export function claudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaudeJson<T>(args: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: args.maxTokens ?? 1200,
      temperature: 0,
      system: `${args.system}\nReturn structured JSON only. No prose, no markdown.`,
      messages: [{ role: "user", content: args.prompt }],
    }),
  });

  if (!res.ok) {
    console.error("claude request failed", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = await res.json();
  const text = json?.content?.find?.((c: { type?: string }) => c.type === "text")?.text;
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("claude json parse failed", err);
    return null;
  }
}
