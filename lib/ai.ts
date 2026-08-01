/**
 * Unified AI layer: Hack Club AI first (HC_API_KEY), Gemini fallback.
 * OpenAI-compatible chat at https://ai.hackclub.com/proxy/v1
 */

export type AiProvider = "hackclub" | "gemini";

export type AiResult = {
  text: string | null;
  error: string | null;
  model: string | null;
  provider: AiProvider | null;
};

const HC_BASE = "https://ai.hackclub.com/proxy/v1";

const HC_MODELS = [
  process.env.HC_MODEL?.trim(),
  "qwen/qwen3-32b",
  "google/gemini-3-flash-preview",
  "openai/gpt-5-mini",
  "moonshotai/kimi-k2.5",
].filter((value): value is string => Boolean(value));

export function getHackClubKey(): string | undefined {
  const key = process.env.HC_API_KEY?.trim();
  return key || undefined;
}

export function getGeminiKey(): string | undefined {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined;
  return key || undefined;
}

/** True when either Hack Club or Gemini credentials are configured. */
export function hasAiCredentials(): boolean {
  return Boolean(getHackClubKey() || getGeminiKey());
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function callHackClubChat(options: {
  system: string;
  user: string;
  json?: boolean;
  model: string;
}): Promise<AiResult> {
  const apiKey = getHackClubKey();
  if (!apiKey) {
    return {
      text: null,
      error: "HC_API_KEY is not set",
      model: null,
      provider: null,
    };
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: options.system },
    { role: "user", content: options.user },
  ];

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    temperature: options.json ? 0.55 : 0.3,
    max_tokens: 8192,
  };

  // Some OpenAI-compatible proxies honor response_format for JSON mode.
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${HC_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string } | string;
    model?: string;
  };

  if (!res.ok) {
    const message =
      (typeof data.error === "string"
        ? data.error
        : data.error?.message) || `Hack Club AI HTTP ${res.status}`;
    return {
      text: null,
      error: message,
      model: options.model,
      provider: "hackclub",
    };
  }

  const raw = data.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? stripThinkTags(raw) : null;
  if (!text) {
    return {
      text: null,
      error: "Hack Club AI returned an empty response",
      model: data.model || options.model,
      provider: "hackclub",
    };
  }

  return {
    text,
    error: null,
    model: data.model || options.model,
    provider: "hackclub",
  };
}

/** Optional Exa web search via Hack Club proxy (may require enable_exa). */
async function hackClubExaSearch(query: string): Promise<string | null> {
  const apiKey = getHackClubKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(`${HC_BASE}/exa/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults: 8,
        type: "auto",
        contents: { text: { maxCharacters: 1200 } },
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        text?: string;
        summary?: string;
      }>;
    };
    const rows = data.results || [];
    if (!rows.length) return null;
    return rows
      .map((row, index) => {
        const body = (row.text || row.summary || "").slice(0, 900);
        return `${index + 1}. ${row.title || "Result"}\nURL: ${row.url || ""}\n${body}`;
      })
      .join("\n\n");
  } catch {
    return null;
  }
}

async function generateWithHackClub(options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}): Promise<AiResult> {
  if (!getHackClubKey()) {
    return {
      text: null,
      error: "HC_API_KEY is not set",
      model: null,
      provider: null,
    };
  }

  let user = options.user;
  if (options.search) {
    const web = await hackClubExaSearch(options.user);
    if (web) {
      user = `${options.user}\n\nLive web search results (use these; prefer official program URLs):\n${web}`;
    }
  }

  // JSON array prompts often break with response_format=json_object; keep off for arrays.
  const wantsJsonObject =
    Boolean(options.json) && !/json array|ONLY a JSON array/i.test(options.system);

  let lastError: string | null = null;
  let lastModel: string | null = null;
  const tried = new Set<string>();

  for (const model of HC_MODELS) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const result = await callHackClubChat({
        system: options.system,
        user,
        json: wantsJsonObject,
        model,
      });
      if (result.text) return result;
      lastError = result.error;
      lastModel = result.model;
      if (
        lastError &&
        /api key|unauthorized|forbidden|invalid.?api.?key|401|403/i.test(
          lastError,
        )
      ) {
        return result;
      }
      if (
        lastError &&
        /not found|invalid model|model|404|unavailable|rate.?limit|429/i.test(
          lastError,
        )
      ) {
        continue;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Hack Club AI request failed";
      lastModel = model;
    }
  }

  return {
    text: null,
    error: lastError || "Hack Club AI request failed",
    model: lastModel,
    provider: "hackclub",
  };
}

export type GeminiGenerateFn = (options: {
  system: string;
  user: string;
  json?: boolean;
  search?: boolean;
}) => Promise<AiResult>;

/**
 * Try Hack Club AI first, then Gemini. Pass `geminiFallback` to avoid circular imports.
 */
export async function aiGenerate(
  options: {
    system: string;
    user: string;
    json?: boolean;
    search?: boolean;
  },
  geminiFallback: GeminiGenerateFn,
): Promise<AiResult> {
  if (getHackClubKey()) {
    const hc = await generateWithHackClub(options);
    if (hc.text) return hc;
    // Fall through to Gemini; keep HC error if Gemini also missing.
    if (!getGeminiKey()) return hc;
  }

  if (!getGeminiKey()) {
    return {
      text: null,
      error: getHackClubKey()
        ? "Hack Club AI failed and GEMINI_API_KEY is not set"
        : "Neither HC_API_KEY nor GEMINI_API_KEY is set",
      model: null,
      provider: null,
    };
  }

  return geminiFallback(options);
}
