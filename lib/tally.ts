import type {
  FormQuestion,
  FormQuestionType,
  FormSection,
  FormVisibilityRule,
  ParsedApplication,
} from "./types";
import { BROWSER_UA, normalizeApplicationUrl } from "./fetch-page";

export type { FormOptionBranch } from "./types";

type TallyBlock = {
  type: string;
  groupType?: string;
  uuid: string;
  groupUuid: string;
  payload?: Record<string, unknown>;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const SCHEMA_META_KEYS = new Set([
  "tag",
  "color",
  "font-weight",
  "font-size",
  "font-style",
  "href",
  "target",
  "rel",
  "class",
  "style",
]);

function schemaText(payload: Record<string, unknown> | undefined): string {
  if (!payload) return "";
  const schema = asArray(payload.safeHTMLSchema);
  const parts: string[] = [];

  function walk(node: unknown): void {
    if (typeof node === "string") {
      if (SCHEMA_META_KEYS.has(node)) return;
      if (/^rgb\(/i.test(node) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(node)) {
        return;
      }
      parts.push(node);
      return;
    }
    if (!Array.isArray(node)) return;
    // Markup descriptor pairs: ["tag","span"], ["color","rgb(...)"]
    if (
      node.length === 2 &&
      typeof node[0] === "string" &&
      SCHEMA_META_KEYS.has(node[0]) &&
      typeof node[1] === "string"
    ) {
      return;
    }
    for (const child of node) walk(child);
  }

  walk(schema);
  return parts
    .join("")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNextData(html: string): unknown | null {
  const marker = 'id="__NEXT_DATA__"';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf(">", idx);
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(html.slice(start + 1, end));
  } catch {
    return null;
  }
}

function mapInputType(blockType: string, payload: Record<string, unknown>): FormQuestionType {
  if (blockType === "INPUT_EMAIL") return "email";
  if (blockType === "INPUT_PHONE_NUMBER") return "short";
  if (blockType === "INPUT_NUMBER") return "short";
  if (blockType === "INPUT_TEXT") return "short";
  if (blockType === "TEXTAREA") return "paragraph";
  if (blockType === "FILE_UPLOAD") return "file";
  if (blockType === "DROPDOWN_OPTION") {
    return payload.allowMultiple ? "checkboxes" : "dropdown";
  }
  if (blockType === "MULTIPLE_CHOICE_OPTION") {
    return payload.allowMultiple ? "checkboxes" : "multiple_choice";
  }
  return "short";
}

function isInputBlock(type: string): boolean {
  return (
    type.startsWith("INPUT_") ||
    type === "TEXTAREA" ||
    type === "FILE_UPLOAD"
  );
}

function isChoiceBlock(type: string): boolean {
  return type === "DROPDOWN_OPTION" || type === "MULTIPLE_CHOICE_OPTION";
}

export function isTallyUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("tally.so");
  } catch {
    return url.toLowerCase().includes("tally.so");
  }
}

/**
 * Parse a Tally form from page HTML (__NEXT_DATA__ blocks).
 * Preserves heading hierarchy, full question titles, and yes/no reveal rules.
 */
export function parseTallyFormFromHtml(
  html: string,
  pageUrl: string,
): ParsedApplication | null {
  const next = extractNextData(html);
  if (!next || typeof next !== "object") return null;
  const pageProps = (next as { props?: { pageProps?: Record<string, unknown> } })
    .props?.pageProps;
  if (!pageProps) return null;
  const blocks = asArray(pageProps.blocks) as TallyBlock[];
  if (!blocks.length) return null;

  const formId =
    typeof pageProps.formId === "string" ? pageProps.formId : "tally-form";
  const formName =
    typeof pageProps.name === "string" && pageProps.name.trim()
      ? pageProps.name.trim()
      : schemaText(
          blocks.find((block) => block.type === "FORM_TITLE")?.payload as
            | Record<string, unknown>
            | undefined,
        ) || "Tally application";

  const questions: FormQuestion[] = [];
  const sections: FormSection[] = [];
  const optionIdToLabel = new Map<string, string>();
  const blockUuidToEntryId = new Map<string, string>();
  const groupUuidToEntryId = new Map<string, string>();
  const titleUuidToEntryId = new Map<string, string>();

  let sectionIndex = 0;
  let currentSectionTitle = "";
  let currentSectionDescription = "";
  let pendingTitle = "";
  let pendingTitleUuid: string | null = null;
  let pendingTitleHidden = false;
  const sectionBuckets: Array<{
    title: string;
    description?: string;
    questionEntryIds: string[];
  }> = [{ title: "", questionEntryIds: [] }];

  function ensureSection(): number {
    return sectionBuckets.length - 1;
  }

  function pushSection(title: string, description?: string) {
    if (
      sectionBuckets.length === 1 &&
      sectionBuckets[0]!.questionEntryIds.length === 0 &&
      !sectionBuckets[0]!.title
    ) {
      sectionBuckets[0] = {
        title,
        description,
        questionEntryIds: [],
      };
      currentSectionTitle = title;
      currentSectionDescription = description || "";
      sectionIndex = 0;
      return;
    }
    sectionBuckets.push({
      title,
      description,
      questionEntryIds: [],
    });
    sectionIndex = sectionBuckets.length - 1;
    currentSectionTitle = title;
    currentSectionDescription = description || "";
  }

  function addQuestion(question: FormQuestion, titleUuid: string | null) {
    questions.push(question);
    sectionBuckets[ensureSection()]!.questionEntryIds.push(question.entryId);
    groupUuidToEntryId.set(question.entryId, question.entryId);
    if (titleUuid) titleUuidToEntryId.set(titleUuid, question.entryId);
    blockUuidToEntryId.set(question.entryId, question.entryId);
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const payload = (block.payload || {}) as Record<string, unknown>;

    if (block.type === "HEADING_1") {
      const heading = schemaText(payload) || "Section";
      pushSection(heading);
      pendingTitle = "";
      pendingTitleUuid = null;
      continue;
    }

    if (block.type === "TITLE") {
      pendingTitle = schemaText(payload);
      pendingTitleUuid = block.uuid;
      pendingTitleHidden = Boolean(payload.isHidden);
      continue;
    }

    if (block.type === "TEXT" || block.type === "FORM_TITLE") {
      // Keep intro text under the current section when it has no questions yet.
      const text = schemaText(payload);
      if (
        text &&
        sectionBuckets[ensureSection()]!.questionEntryIds.length === 0 &&
        !sectionBuckets[ensureSection()]!.description
      ) {
        sectionBuckets[ensureSection()]!.description = text.slice(0, 280);
      }
      continue;
    }

    if (isInputBlock(block.type)) {
      const entryId = block.groupUuid || block.uuid;
      const title =
        pendingTitle ||
        (typeof payload.placeholder === "string" && payload.placeholder) ||
        "Untitled field";
      const required = Boolean(payload.isRequired);
      const question: FormQuestion = {
        id: block.uuid,
        entryId,
        title,
        type: mapInputType(block.type, payload),
        required,
        options: [],
        manualOnly: block.type === "FILE_UPLOAD",
        sectionIndex: ensureSection(),
        initiallyHidden: pendingTitleHidden || Boolean(payload.isHidden),
        matchHints: [title, entryId, block.uuid].filter(Boolean),
      };
      addQuestion(question, pendingTitleUuid);
      blockUuidToEntryId.set(block.uuid, entryId);
      pendingTitle = "";
      pendingTitleUuid = null;
      pendingTitleHidden = false;
      continue;
    }

    if (isChoiceBlock(block.type)) {
      // Collect consecutive options in this group.
      const groupUuid = block.groupUuid;
      const optionBlocks: TallyBlock[] = [];
      let j = i;
      while (
        j < blocks.length &&
        blocks[j]!.groupUuid === groupUuid &&
        isChoiceBlock(blocks[j]!.type)
      ) {
        optionBlocks.push(blocks[j]!);
        j += 1;
      }
      i = j - 1;

      const options: string[] = [];
      for (const optionBlock of optionBlocks) {
        const optionPayload = (optionBlock.payload || {}) as Record<
          string,
          unknown
        >;
        const label =
          typeof optionPayload.text === "string"
            ? optionPayload.text.trim()
            : "";
        if (!label) continue;
        options.push(label);
        optionIdToLabel.set(optionBlock.uuid, label);
        blockUuidToEntryId.set(optionBlock.uuid, groupUuid);
      }

      const firstPayload = (optionBlocks[0]?.payload || {}) as Record<
        string,
        unknown
      >;
      const title = pendingTitle || "Untitled question";
      const question: FormQuestion = {
        id: groupUuid,
        entryId: groupUuid,
        title,
        type: mapInputType(block.type, firstPayload),
        required: Boolean(firstPayload.isRequired),
        options,
        manualOnly: false,
        sectionIndex: ensureSection(),
        initiallyHidden:
          pendingTitleHidden || Boolean(firstPayload.isHidden),
        matchHints: [title, groupUuid, ...options.slice(0, 4)],
      };
      addQuestion(question, pendingTitleUuid);
      for (const optionBlock of optionBlocks) {
        blockUuidToEntryId.set(optionBlock.uuid, groupUuid);
      }
      groupUuidToEntryId.set(groupUuid, groupUuid);
      pendingTitle = "";
      pendingTitleUuid = null;
      pendingTitleHidden = false;
      continue;
    }
  }

  // Attach visibility rules from CONDITIONAL_LOGIC SHOW_BLOCKS actions.
  const visibility = new Map<string, FormVisibilityRule[]>();

  function resolveEntryId(rawId: string): string | null {
    return (
      blockUuidToEntryId.get(rawId) ||
      groupUuidToEntryId.get(rawId) ||
      titleUuidToEntryId.get(rawId) ||
      null
    );
  }

  for (const block of blocks) {
    if (block.type !== "CONDITIONAL_LOGIC") continue;
    const payload = (block.payload || {}) as Record<string, unknown>;
    const conditionals = asArray(payload.conditionals);
    const actions = asArray(payload.actions);

    const rules: FormVisibilityRule[] = [];
    for (const conditional of conditionals) {
      if (!conditional || typeof conditional !== "object") continue;
      const condPayload = ((conditional as { payload?: Record<string, unknown> })
        .payload || {}) as Record<string, unknown>;
      const field = (condPayload.field || {}) as Record<string, unknown>;
      const fieldGroup =
        typeof field.blockGroupUuid === "string"
          ? field.blockGroupUuid
          : typeof field.uuid === "string"
            ? field.uuid
            : "";
      const controller = resolveEntryId(fieldGroup) || fieldGroup;
      if (!controller) continue;

      const comparison = String(condPayload.comparison || "IS");
      const rawValue = condPayload.value;
      const valueIds = Array.isArray(rawValue)
        ? rawValue.map(String)
        : rawValue != null
          ? [String(rawValue)]
          : [];
      const values = valueIds
        .map((id) => optionIdToLabel.get(id) || id)
        .filter(Boolean);
      if (!values.length) continue;
      rules.push({
        entryId: controller,
        values,
        comparison: comparison.includes("ANY") ? "any" : "is",
      });
    }
    if (!rules.length) continue;

    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      const actionType = (action as { type?: string }).type;
      const actionPayload = ((action as { payload?: Record<string, unknown> })
        .payload || {}) as Record<string, unknown>;
      if (actionType !== "SHOW_BLOCKS") continue;
      const showBlocks = asArray(actionPayload.showBlocks).map(String);
      for (const showId of showBlocks) {
        const entryId = resolveEntryId(showId);
        if (!entryId) continue;
        const existing = visibility.get(entryId) || [];
        for (const rule of rules) {
          if (
            !existing.some(
              (item) =>
                item.entryId === rule.entryId &&
                item.values.join("|") === rule.values.join("|"),
            )
          ) {
            existing.push(rule);
          }
        }
        visibility.set(entryId, existing);
      }
    }
  }

  // REQUIRE_ANSWER actions: mark fields required once their reveal rule is met.
  for (const block of blocks) {
    if (block.type !== "CONDITIONAL_LOGIC") continue;
    const payload = (block.payload || {}) as Record<string, unknown>;
    for (const action of asArray(payload.actions)) {
      if (!action || typeof action !== "object") continue;
      if ((action as { type?: string }).type !== "REQUIRE_ANSWER") continue;
      const actionPayload = ((action as { payload?: Record<string, unknown> })
        .payload || {}) as Record<string, unknown>;
      const requireId =
        typeof actionPayload.requireAnswer === "string"
          ? actionPayload.requireAnswer
          : "";
      const entryId = requireId ? resolveEntryId(requireId) : null;
      if (!entryId) continue;
      const question = questions.find((item) => item.entryId === entryId);
      if (question) question.required = true;
    }
  }

  for (const question of questions) {
    const rules = visibility.get(question.entryId);
    if (rules?.length) {
      question.visibleWhen = rules;
      question.initiallyHidden = true;
    }
  }

  const builtSections: FormSection[] = sectionBuckets.map((bucket, index) => ({
    id: `tally-section-${index}`,
    index,
    title: bucket.title,
    description: bucket.description,
    questionEntryIds: bucket.questionEntryIds,
    defaultNextSectionIndex:
      index + 1 < sectionBuckets.length ? index + 1 : null,
  }));

  // Keep sectionIndex on questions aligned.
  for (const [index, bucket] of sectionBuckets.entries()) {
    for (const entryId of bucket.questionEntryIds) {
      const question = questions.find((item) => item.entryId === entryId);
      if (question) question.sectionIndex = index;
    }
  }

  const hasBranching = questions.some(
    (question) => Boolean(question.visibleWhen?.length) || Boolean(question.initiallyHidden),
  );

  return {
    kind: "web",
    url: pageUrl,
    submitUrl: null,
    title: formName,
    description: `Tally form (${formId}). InternHarbor will autofill the live page from your background.`,
    questions,
    sections: builtSections,
    hasBranching,
    fbzx: null,
    collectEmail: questions.some((question) => question.type === "email"),
    supportsAutoSubmit: false,
    fillMode: "page-fill",
    platform: "Tally",
  };
}

export async function parseTallyForm(rawUrl: string): Promise<ParsedApplication> {
  const url = normalizeApplicationUrl(rawUrl);
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not fetch Tally form (${res.status})`);
  }
  const html = await res.text();
  const parsed = parseTallyFormFromHtml(html, res.url || url);
  if (!parsed) {
    throw new Error("Could not read this Tally form structure.");
  }
  return parsed;
}
