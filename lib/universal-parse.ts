import { parseHTML } from "linkedom";
import { geminiText, getApiKey } from "./gemini";
import { fetchApplicationPage, normalizeApplicationUrl } from "./fetch-page";
import {
  classifyApplicationUrl,
  parseGoogleForm,
} from "./google-forms";
import type {
  FormQuestion,
  FormQuestionType,
  ParsedApplication,
} from "./types";

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export const FALLBACK_QUESTIONS: FormQuestion[] = [
  {
    id: "full-name",
    entryId: "full-name",
    title: "Full name",
    type: "short",
    required: true,
    options: [],
    matchHints: ["full name", "name", "legal name"],
  },
  {
    id: "email",
    entryId: "email",
    title: "Email",
    type: "email",
    required: true,
    options: [],
    matchHints: ["email", "e-mail"],
  },
  {
    id: "phone",
    entryId: "phone",
    title: "Phone",
    type: "short",
    required: false,
    options: [],
    matchHints: ["phone", "mobile", "tel"],
  },
  {
    id: "school",
    entryId: "school",
    title: "School",
    type: "short",
    required: false,
    options: [],
    matchHints: ["school", "high school", "university"],
  },
  {
    id: "why",
    entryId: "why",
    title: "Why are you interested / cover letter",
    type: "paragraph",
    required: true,
    options: [],
    matchHints: ["why", "cover letter", "interest", "motivation", "essay"],
  },
  {
    id: "experience",
    entryId: "experience",
    title: "Experience / résumé summary",
    type: "paragraph",
    required: true,
    options: [],
    matchHints: ["experience", "resume", "background", "qualifications"],
  },
];

function detectPlatform(url: string, html: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })().toLowerCase();
  const blob = `${host} ${html.slice(0, 5000)}`.toLowerCase();

  if (host.includes("docs.google.com") && url.includes("/forms/"))
    return "Google Forms";
  if (host.includes("forms.gle")) return "Google Forms";
  if (blob.includes("greenhouse") || host.includes("greenhouse"))
    return "Greenhouse";
  if (blob.includes("lever.co") || host.includes("lever")) return "Lever";
  if (blob.includes("myworkdayjobs") || blob.includes("workday"))
    return "Workday";
  if (blob.includes("typeform") || host.includes("typeform")) return "Typeform";
  if (blob.includes("forms.office.com") || blob.includes("microsoft forms"))
    return "Microsoft Forms";
  if (blob.includes("airtable.com") || host.includes("airtable"))
    return "Airtable";
  if (blob.includes("notion.site") || blob.includes("notion.so"))
    return "Notion";
  if (blob.includes("applytojob") || blob.includes("jazzhr")) return "JazzHR";
  if (blob.includes("icims")) return "iCIMS";
  if (blob.includes("smartrecruiters")) return "SmartRecruiters";
  if (blob.includes("ashbyhq") || host.includes("ashby")) return "Ashby";
  return host.replace(/^www\./, "") || "Web application";
}

function inferType(
  el: { tagName: string; getAttribute: (name: string) => string | null },
): FormQuestionType {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "paragraph";
  if (tag === "select") return "dropdown";
  const type = (el.getAttribute("type") || "text").toLowerCase();
  if (type === "email") return "email";
  if (type === "file") return "file";
  if (type === "date") return "date";
  if (type === "time") return "time";
  if (type === "radio") return "multiple_choice";
  if (type === "checkbox") return "checkboxes";
  if (type === "hidden" || type === "submit" || type === "button")
    return "unknown";
  return "short";
}

function labelForInput(document: Document, el: Element): string {
  const id = el.getAttribute("id");
  if (id) {
    const byFor = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (byFor?.textContent?.trim()) return byFor.textContent.trim();
  }
  const parentLabel = el.closest("label");
  if (parentLabel?.textContent?.trim()) {
    return parentLabel.textContent.trim().replace(/\s+/g, " ");
  }
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const texts = labelledBy
      .split(/\s+/)
      .map((token) => document.getElementById(token)?.textContent?.trim())
      .filter(Boolean);
    if (texts.length) return texts.join(" ");
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder?.trim()) return placeholder.trim();
  const name = el.getAttribute("name");
  if (name?.trim()) return name.trim();
  return "Untitled field";
}

function extractHtmlQuestions(
  html: string,
  pageUrl: string,
): {
  questions: FormQuestion[];
  formAction: string | null;
  title: string;
  text: string;
} {
  if (!html.trim()) {
    return {
      questions: [],
      formAction: null,
      title: "Application",
      text: "",
    };
  }

  const { document } = parseHTML(html);
  const title =
    document.querySelector("title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    "Application";

  const text = (document.body?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);

  const form =
    document.querySelector("form#applicationForm") ||
    document.querySelector("form[action*='apply']") ||
    document.querySelector("form");

  let formAction: string | null = null;
  if (form) {
    const action = form.getAttribute("action") || pageUrl;
    try {
      formAction = new URL(action, pageUrl).toString();
    } catch {
      formAction = pageUrl;
    }
  }

  const fields = [
    ...document.querySelectorAll("input, textarea, select"),
  ] as Element[];

  const questions: FormQuestion[] = [];
  const seen = new Set<string>();

  for (const [index, el] of fields.entries()) {
    const typeAttr = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(typeAttr)) {
      continue;
    }

    const qType = inferType(el);
    if (qType === "unknown") continue;

    const name = el.getAttribute("name") || "";
    const id = el.getAttribute("id") || "";
    const titleText = labelForInput(document, el);
    const entryId = name || id || `field-${index}`;
    if (seen.has(entryId)) continue;
    seen.add(entryId);

    const options: string[] = [];
    if (el.tagName.toLowerCase() === "select") {
      for (const opt of el.querySelectorAll("option")) {
        const value = (opt.textContent || "").trim();
        if (value) options.push(value);
      }
    }

    const selector = id
      ? `#${cssEscape(id)}`
      : name
        ? `[name="${name.replace(/"/g, '\\"')}"]`
        : undefined;

    questions.push({
      id: entryId,
      entryId,
      title: titleText.slice(0, 180),
      type: qType,
      required:
        el.hasAttribute("required") ||
        el.getAttribute("aria-required") === "true",
      options,
      manualOnly: qType === "file",
      name: name || undefined,
      selector,
      matchHints: [titleText, name, id, el.getAttribute("placeholder") || ""]
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return { questions, formAction, title, text };
}

function extractJsonArray(content: string): unknown[] | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || content.trim();
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function enrichPageTextWithGemini(
  url: string,
  existingText: string,
): Promise<string> {
  if (!getApiKey()) return existingText;
  const summary = await geminiText({
    search: true,
    system:
      "You research an application/internship form URL. List every applicant-facing question or field a student would need to answer. Include essays, dropdowns, and contact fields. Plain text only.",
    user: `Application URL: ${url}\n\nPage text we already have (may be empty if blocked):\n${existingText.slice(0, 3000) || "(none — page blocked server-side)"}`,
  });
  if (!summary) return existingText;
  return `${existingText}\n${summary}`.trim();
}

async function aiExtractQuestions(
  pageUrl: string,
  platform: string,
  pageText: string,
): Promise<FormQuestion[]> {
  if (!getApiKey()) return [];

  const content = await geminiText({
    json: true,
    // Never combine JSON mime type with google_search — unsupported by Gemini.
    search: false,
    system:
      "Extract every applicant-facing field/question from an application page. Return ONLY a JSON array of objects: {id, title, type, required, options, matchHints}. type one of short|paragraph|multiple_choice|dropdown|checkboxes|scale|date|time|file|email. matchHints: 2-5 strings that might appear as labels/placeholders/names on the live page. Include essay prompts and yes/no questions. Skip navigation/footer fluff. If page text is thin, infer likely fields for that URL/platform.",
    user: JSON.stringify({
      url: pageUrl,
      platform,
      pageText: pageText.slice(0, 10000) || "(empty)",
    }),
  });

  const parsed = content ? extractJsonArray(content) : null;
  if (!parsed) return [];

  return parsed
    .map((item, index): FormQuestion | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as {
        id?: string;
        title?: string;
        type?: FormQuestionType;
        required?: boolean;
        options?: string[];
        matchHints?: string[];
      };
      const title = row.title?.trim();
      if (!title) return null;
      const id = (row.id || `ai-${index}`).toString();
      const type = row.type || "short";
      return {
        id,
        entryId: id,
        title,
        type,
        required: Boolean(row.required),
        options: Array.isArray(row.options) ? row.options : [],
        manualOnly: type === "file",
        matchHints: [
          title,
          ...(Array.isArray(row.matchHints) ? row.matchHints : []),
        ]
          .map((hint) => hint.trim())
          .filter(Boolean),
      };
    })
    .filter((item): item is FormQuestion => Boolean(item));
}

function mergeQuestions(
  primary: FormQuestion[],
  secondary: FormQuestion[],
): FormQuestion[] {
  const out = new Map<string, FormQuestion>();
  const byTitle = new Set<string>();

  for (const question of [...primary, ...secondary]) {
    const titleKey = question.title.toLowerCase().replace(/\s+/g, " ");
    if (byTitle.has(titleKey)) {
      const existing = [...out.values()].find(
        (item) => item.title.toLowerCase().replace(/\s+/g, " ") === titleKey,
      );
      if (existing) {
        existing.matchHints = [
          ...new Set([
            ...(existing.matchHints || []),
            ...(question.matchHints || []),
          ]),
        ];
        if (!existing.selector && question.selector) {
          existing.selector = question.selector;
        }
        if (!existing.name && question.name) existing.name = question.name;
      }
      continue;
    }
    byTitle.add(titleKey);
    out.set(question.entryId, question);
  }
  return [...out.values()];
}

function withMatchHints(questions: FormQuestion[]): FormQuestion[] {
  return questions.map((question) => ({
    ...question,
    matchHints: [
      question.title,
      question.entryId,
      ...(question.matchHints || []),
    ],
  }));
}

export async function parseAnyApplication(
  rawUrl: string,
): Promise<ParsedApplication> {
  const url = normalizeApplicationUrl(rawUrl);
  const kindHint = classifyApplicationUrl(url);

  if (kindHint === "google-form") {
    try {
      const parsed = await parseGoogleForm(url);
      return {
        ...parsed,
        fillMode: parsed.supportsAutoSubmit ? "auto-submit" : "page-fill",
        platform: "Google Forms",
        questions: withMatchHints(parsed.questions),
      };
    } catch {
      // Fall through to universal Gemini-assisted path
    }
  }

  const fetched = await fetchApplicationPage(url);
  const finalUrl = fetched.finalUrl || url;
  const platform = detectPlatform(finalUrl, fetched.html);
  const extracted = extractHtmlQuestions(fetched.html, finalUrl);

  let questions = extracted.questions;
  let pageText = extracted.text;
  let title = extracted.title || platform;

  // Many application hosts block server crawlers (403/404). Keep going with Gemini.
  const needsAi =
    !fetched.ok ||
    pageText.length < 500 ||
    questions.length < 3;

  if (needsAi) {
    pageText = await enrichPageTextWithGemini(finalUrl, pageText);
    const aiQuestions = await aiExtractQuestions(finalUrl, platform, pageText);
    questions = mergeQuestions(questions, aiQuestions);
    if ((!title || title === "Application") && aiQuestions[0]) {
      title = `${platform} application`;
    }
  }

  if (!questions.length) {
    questions = FALLBACK_QUESTIONS;
  }

  const classicHtmlForm =
    fetched.ok &&
    Boolean(extracted.formAction) &&
    extracted.questions.length >= 2 &&
    !/greenhouse|lever|workday|typeform|ashby/i.test(platform);

  const blockedNote = fetched.ok
    ? ""
    : ` The site blocked a direct server read (HTTP ${fetched.status || "error"}), so answers were drafted from Gemini + your background — review carefully before autofill.`;

  return {
    kind: classicHtmlForm ? "html-form" : "web",
    url: finalUrl,
    submitUrl: classicHtmlForm ? extracted.formAction : null,
    title,
    description: `${platform} application ready.${blockedNote} InternHarbor will autofill the live page from your background.`,
    questions: withMatchHints(questions),
    fbzx: null,
    collectEmail: questions.some((q) => q.type === "email"),
    supportsAutoSubmit: false,
    fillMode: "page-fill",
    platform,
    pageTextPreview: pageText.slice(0, 400),
  };
}
