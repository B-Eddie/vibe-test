import type {
  FormQuestion,
  FormQuestionType,
  ParsedApplication,
} from "./types";

const TYPE_MAP: Record<number, FormQuestionType> = {
  0: "short",
  1: "paragraph",
  2: "multiple_choice",
  3: "dropdown",
  4: "checkboxes",
  5: "scale",
  7: "unknown",
  9: "date",
  10: "time",
  11: "file",
  13: "unknown",
};

function isGoogleFormsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host.includes("docs.google.com") && url.includes("/forms/")
    );
  } catch {
    return false;
  }
}

export function classifyApplicationUrl(url: string): "google-form" | "web" {
  return isGoogleFormsUrl(url) ? "google-form" : "web";
}

export function toViewFormUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  let path = url.pathname;
  path = path.replace(/\/formResponse\/?$/, "/viewform");
  if (!path.includes("/viewform")) {
    if (path.endsWith("/")) path = `${path}viewform`;
    else path = `${path}/viewform`;
  }
  url.pathname = path;
  url.search = "";
  return url.toString();
}

export function toFormResponseUrl(raw: string): string {
  const view = toViewFormUrl(raw);
  return view.replace(/\/viewform.*$/, "/formResponse");
}

function extractFbPublicLoadData(html: string): unknown[] | null {
  const marker = "FB_PUBLIC_LOAD_DATA_";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const eq = html.indexOf("=", idx);
  if (eq === -1) return null;

  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i]!)) i += 1;
  if (html[i] !== "[") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const start = i;

  for (; i < html.length; i += 1) {
    const ch = html[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = html
          .slice(start, i + 1)
          .replace(/\u2028|\u2029/g, " ");
        try {
          return JSON.parse(jsonText) as unknown[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractFbzx(html: string): string | null {
  const named = html.match(/name=["']fbzx["']\s+value=["']([^"']+)["']/i);
  if (named?.[1]) return named[1];
  const valueFirst = html.match(/value=["']([^"']+)["']\s+name=["']fbzx["']/i);
  if (valueFirst?.[1]) return valueFirst[1];
  const script = html.match(/["']fbzx["']\s*,\s*["']([^"']+)["']/);
  return script?.[1] ?? null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readOptions(entryConfig: unknown): string[] {
  const entry = asArray(entryConfig);
  const optionsBlock = asArray(entry[1]);
  return optionsBlock
    .map((option) => {
      const row = asArray(option);
      return typeof row[0] === "string" ? row[0] : null;
    })
    .filter((value): value is string => Boolean(value));
}

function parseQuestion(raw: unknown): FormQuestion | null {
  const row = asArray(raw);
  if (row.length < 5) return null;

  const questionId = String(row[0] ?? "");
  const title = typeof row[1] === "string" ? row[1] : "Untitled question";
  const typeCode = typeof row[3] === "number" ? row[3] : -1;
  const type = TYPE_MAP[typeCode] ?? "unknown";
  const entries = asArray(row[4]);
  const firstEntry = asArray(entries[0]);
  const entryIdNum = firstEntry[0];
  if (typeof entryIdNum !== "number" && typeof entryIdNum !== "string") {
    return null;
  }

  const requiredFlag = firstEntry[2];
  const required = requiredFlag === 1 || requiredFlag === true;

  return {
    id: questionId,
    entryId: `entry.${entryIdNum}`,
    title,
    type,
    required,
    options: readOptions(firstEntry),
    manualOnly: type === "file",
  };
}

function walkQuestions(node: unknown, out: FormQuestion[]): void {
  if (!Array.isArray(node)) return;

  // Heuristic: a question row looks like [id, title, null, type, [[entry...]]]
  if (
    (typeof node[0] === "number" || typeof node[0] === "string") &&
    typeof node[1] === "string" &&
    typeof node[3] === "number" &&
    Array.isArray(node[4])
  ) {
    const parsed = parseQuestion(node);
    if (parsed) out.push(parsed);
  }

  for (const child of node) {
    walkQuestions(child, out);
  }
}

export async function parseGoogleForm(
  rawUrl: string,
): Promise<ParsedApplication> {
  const viewUrl = toViewFormUrl(rawUrl);
  const res = await fetch(viewUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; InternHarbor/1.0; +https://github.com/B-Eddie/vibe-test)",
      Accept: "text/html",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Could not fetch Google Form (${res.status})`);
  }

  const html = await res.text();
  const data = extractFbPublicLoadData(html);
  if (!data) {
    throw new Error(
      "Could not read this Google Form. It may require sign-in or be closed.",
    );
  }

  const questions: FormQuestion[] = [];
  walkQuestions(data, questions);

  // Deduplicate by entryId
  const unique = new Map<string, FormQuestion>();
  for (const question of questions) {
    if (!unique.has(question.entryId)) unique.set(question.entryId, question);
  }
  const deduped = [...unique.values()];

  const collectEmail =
    /name=["']emailAddress["']/i.test(html) ||
    html.toLowerCase().includes("record email addresses");

  if (collectEmail) {
    deduped.unshift({
      id: "emailAddress",
      entryId: "emailAddress",
      title: "Email address",
      type: "email",
      required: true,
      options: [],
    });
  }

  const formTitle =
    (typeof data[3] === "string" && data[3]) ||
    (typeof data[1] === "object" &&
      Array.isArray(data[1]) &&
      typeof (data[1] as unknown[])[8] === "string" &&
      ((data[1] as unknown[])[8] as string)) ||
    "Google Form";

  const description =
    Array.isArray(data[1]) && typeof (data[1] as unknown[])[0] === "string"
      ? ((data[1] as unknown[])[0] as string)
      : "";

  const fbzx = extractFbzx(html);
  const supportsAutoSubmit = deduped.some((q) => !q.manualOnly);

  return {
    kind: "google-form",
    url: viewUrl,
    submitUrl: toFormResponseUrl(viewUrl),
    title: formTitle,
    description,
    questions: deduped,
    fbzx,
    collectEmail,
    supportsAutoSubmit,
    fillMode: "auto-submit",
    platform: "Google Forms",
  };
}

export async function parseApplicationUrl(
  rawUrl: string,
): Promise<ParsedApplication> {
  if (classifyApplicationUrl(rawUrl) === "google-form") {
    return parseGoogleForm(rawUrl);
  }
  throw new Error("Use parseAnyApplication for non-Google URLs");
}

export async function submitGoogleForm(options: {
  submitUrl: string;
  answers: Record<string, string>;
  fbzx: string | null;
}): Promise<{ ok: boolean; status: number }> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(options.answers)) {
    if (!value) continue;
    // Checkboxes may be comma-separated → send multiple values
    if (key.startsWith("entry.") && value.includes("||")) {
      for (const part of value.split("||").map((item) => item.trim())) {
        if (part) body.append(key, part);
      }
    } else {
      body.set(key, value);
    }
  }

  body.set("fvv", "1");
  body.set("pageHistory", "0");
  body.set("submissionTimestamp", "-1");
  if (options.fbzx) body.set("fbzx", options.fbzx);

  const res = await fetch(options.submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (compatible; InternHarbor/1.0; +https://github.com/B-Eddie/vibe-test)",
    },
    body,
    redirect: "manual",
    cache: "no-store",
  });

  // Google often returns 200 or 302 on success
  const ok = res.status === 200 || res.status === 302 || res.status === 0;
  return { ok, status: res.status };
}
