import type {
  FormOptionBranch,
  FormQuestion,
  FormQuestionType,
  FormSection,
  ParsedApplication,
} from "./types";
import { BROWSER_UA, normalizeApplicationUrl } from "./fetch-page";

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

const PAGE_BREAK_TYPE = 8;

function isGoogleFormsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      (host.includes("docs.google.com") && url.includes("/forms/")) ||
      host.includes("forms.gle")
    );
  } catch {
    return false;
  }
}

export function classifyApplicationUrl(url: string): "google-form" | "web" {
  try {
    return isGoogleFormsUrl(normalizeApplicationUrl(url))
      ? "google-form"
      : "web";
  } catch {
    return isGoogleFormsUrl(url) ? "google-form" : "web";
  }
}

export function toViewFormUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.hostname.includes("forms.gle")) {
    return url.toString();
  }

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

/**
 * Read choice labels + optional go-to-section targets.
 *
 * Google Forms stores the next page id at option[2] only:
 *   ["Label", null, <pageId|-1>]
 * A trailing `0` often appears at option[4] on ordinary choices — that is NOT
 * navigation. Scanning past index 2 used to treat every MC as "submit", which
 * hid later sections and let users submit an incomplete path.
 */
export function readOptionsAndBranches(
  entryConfig: unknown,
  pageIdToIndex: Map<number, number>,
): { options: string[]; branches: FormOptionBranch[] } {
  const entry = asArray(entryConfig);
  const optionsBlock = asArray(entry[1]);
  const options: string[] = [];
  const branches: FormOptionBranch[] = [];

  for (const option of optionsBlock) {
    const row = asArray(option);
    const label = typeof row[0] === "string" ? row[0] : null;
    if (!label) continue;
    options.push(label);

    const candidate = row[2];
    let navRaw: number | null = null;
    if (typeof candidate === "number") {
      navRaw = candidate;
    } else if (typeof candidate === "string" && /^-?\d+$/.test(candidate)) {
      navRaw = Number(candidate);
    }
    // No go-to on this option → follow the section's default next page.
    if (navRaw === null) continue;
    // -1 / 0 at option[2] means submit / end form.
    if (navRaw <= 0) {
      branches.push({ option: label, nextSectionIndex: null });
      continue;
    }
    const nextIndex = pageIdToIndex.get(navRaw);
    if (typeof nextIndex !== "number") {
      // Unknown page id — omit the branch so defaultNext can apply via backfill.
      continue;
    }
    branches.push({
      option: label,
      nextSectionIndex: nextIndex,
    });
  }

  return { options, branches };
}

function parseQuestion(
  raw: unknown,
  sectionIndex: number,
  pageIdToIndex: Map<number, number>,
): FormQuestion | null {
  const row = asArray(raw);
  if (row.length < 5) return null;

  const questionId = String(row[0] ?? "");
  const title = typeof row[1] === "string" ? row[1] : "Untitled question";
  const typeCode = typeof row[3] === "number" ? row[3] : -1;
  if (typeCode === PAGE_BREAK_TYPE) return null;
  const type = TYPE_MAP[typeCode] ?? "unknown";
  if (type === "unknown" && typeCode === 7) return null;

  const entries = asArray(row[4]);
  if (!entries.length) return null;
  const firstEntry = asArray(entries[0]);
  const entryIdNum = firstEntry[0];
  if (typeof entryIdNum !== "number" && typeof entryIdNum !== "string") {
    return null;
  }

  const requiredFlag = firstEntry[2];
  const required = requiredFlag === 1 || requiredFlag === true;
  const { options, branches } = readOptionsAndBranches(
    firstEntry,
    pageIdToIndex,
  );

  return {
    id: questionId,
    entryId: `entry.${entryIdNum}`,
    title,
    type,
    required,
    options,
    manualOnly: type === "file",
    sectionIndex,
    optionBranches: branches.length ? branches : undefined,
  };
}

type PageChunk = {
  pageBreakId: number | null;
  title: string;
  description: string;
  defaultNavId: number | null;
  items: unknown[];
};

function splitPages(items: unknown[]): PageChunk[] {
  const rawPages: unknown[][] = [];
  let current: unknown[] = [];

  for (const item of items) {
    const row = asArray(item);
    const typeCode = typeof row[3] === "number" ? row[3] : -1;
    if (typeCode === PAGE_BREAK_TYPE) {
      if (current.length) rawPages.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) rawPages.push(current);

  return rawPages.map((pageItems, index) => {
    const breakItem = pageItems.find((item) => {
      const row = asArray(item);
      return (typeof row[3] === "number" ? row[3] : -1) === PAGE_BREAK_TYPE;
    });
    const breakRow = breakItem ? asArray(breakItem) : null;
    const questionsOnly = pageItems.filter((item) => {
      const row = asArray(item);
      return (typeof row[3] === "number" ? row[3] : -1) !== PAGE_BREAK_TYPE;
    });

    return {
      pageBreakId:
        breakRow && typeof breakRow[0] === "number" ? breakRow[0] : null,
      title:
        breakRow && typeof breakRow[1] === "string" && breakRow[1].trim()
          ? breakRow[1].trim()
          : `Section ${index + 1}`,
      description:
        breakRow && typeof breakRow[2] === "string" ? breakRow[2] : "",
      defaultNavId:
        breakRow && typeof breakRow[5] === "number" ? breakRow[5] : null,
      items: questionsOnly,
    };
  });
}

function buildSectionsAndQuestions(data: unknown[]): {
  questions: FormQuestion[];
  sections: FormSection[];
  hasBranching: boolean;
} {
  const root = asArray(data[1]);
  const items = asArray(root[1]);
  const pages = splitPages(items);

  const pageIdToIndex = new Map<number, number>();
  pages.forEach((page, index) => {
    if (page.pageBreakId != null) pageIdToIndex.set(page.pageBreakId, index);
  });

  const sections: FormSection[] = [];
  const questions: FormQuestion[] = [];
  let hasBranching = pages.length > 1;

  pages.forEach((page, index) => {
    const questionEntryIds: string[] = [];
    for (const item of page.items) {
      const parsed = parseQuestion(item, index, pageIdToIndex);
      if (!parsed) continue;
      if (parsed.optionBranches?.length) hasBranching = true;
      questions.push(parsed);
      questionEntryIds.push(parsed.entryId);
    }

    let defaultNext: number | null = index + 1 < pages.length ? index + 1 : null;
    if (page.defaultNavId != null) {
      if (page.defaultNavId <= 0 || page.defaultNavId === page.pageBreakId) {
        defaultNext = null;
      } else if (pageIdToIndex.has(page.defaultNavId)) {
        defaultNext = pageIdToIndex.get(page.defaultNavId) ?? null;
      }
    }

    sections.push({
      id:
        page.pageBreakId != null
          ? `section-${page.pageBreakId}`
          : `section-${index}`,
      index,
      title: page.title || `Section ${index + 1}`,
      description: page.description || undefined,
      questionEntryIds,
      defaultNextSectionIndex: defaultNext,
    });
  });

  return { questions, sections, hasBranching };
}

export async function parseGoogleForm(
  rawUrl: string,
): Promise<ParsedApplication> {
  const startUrl = normalizeApplicationUrl(rawUrl);
  const probe = await fetch(startUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!probe.ok) {
    throw new Error(`Could not fetch Google Form (${probe.status})`);
  }

  const resolved = probe.url || startUrl;
  const viewUrl = toViewFormUrl(resolved);
  let html = "";
  if (viewUrl === resolved) {
    html = await probe.text();
  } else {
    const res = await fetch(viewUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Could not fetch Google Form (${res.status})`);
    }
    html = await res.text();
  }

  const data = extractFbPublicLoadData(html);
  if (!data) {
    throw new Error(
      "Could not read this Google Form. It may require sign-in or be closed.",
    );
  }

  const { questions, sections, hasBranching } = buildSectionsAndQuestions(data);

  const collectEmail =
    /name=["']emailAddress["']/i.test(html) ||
    html.toLowerCase().includes("record email addresses");

  if (collectEmail) {
    questions.unshift({
      id: "emailAddress",
      entryId: "emailAddress",
      title: "Email address",
      type: "email",
      required: true,
      options: [],
      sectionIndex: 0,
    });
    if (sections[0]) {
      sections[0].questionEntryIds.unshift("emailAddress");
    }
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
  const supportsAutoSubmit = questions.some((q) => !q.manualOnly);

  return {
    kind: "google-form",
    url: viewUrl,
    submitUrl: toFormResponseUrl(viewUrl),
    title: formTitle,
    description,
    questions,
    sections,
    hasBranching,
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
  pageHistory?: string;
}): Promise<{ ok: boolean; status: number }> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(options.answers)) {
    if (!value) continue;
    if (key.startsWith("entry.") && value.includes("||")) {
      for (const part of value.split("||").map((item) => item.trim())) {
        if (part) body.append(key, part);
      }
    } else {
      body.set(key, value);
    }
  }

  body.set("fvv", "1");
  body.set("pageHistory", options.pageHistory || "0");
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

  const ok = res.status === 200 || res.status === 302 || res.status === 0;
  return { ok, status: res.status };
}
