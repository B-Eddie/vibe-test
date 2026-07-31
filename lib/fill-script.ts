import type { FilledAnswer } from "./types";

export type FillPayloadItem = {
  title: string;
  value: string;
  type: string;
  hints: string[];
  options: string[];
  name?: string;
  selector?: string;
  manualOnly?: boolean;
};

export function answersToFillPayload(answers: FilledAnswer[]): FillPayloadItem[] {
  return answers
    .filter((answer) => !answer.manualOnly && answer.value.trim())
    .map((answer) => ({
      title: answer.title,
      value: answer.value,
      type: answer.type,
      options: [],
      hints: [
        answer.title,
        ...(answer.matchHints || []),
        answer.name || "",
        answer.entryId,
      ]
        .map((hint) => hint.trim())
        .filter(Boolean),
      name: answer.name,
      selector: answer.selector,
    }));
}

export function answersToFillPayloadWithOptions(
  answers: FilledAnswer[],
  optionMap?: Record<string, string[]>,
): FillPayloadItem[] {
  return answers
    .filter((answer) => !answer.manualOnly && answer.value.trim())
    .map((answer) => ({
      title: answer.title,
      value: answer.value,
      type: answer.type,
      options: optionMap?.[answer.entryId] || [],
      hints: [
        answer.title,
        ...(answer.matchHints || []),
        answer.name || "",
        answer.entryId,
      ]
        .map((hint) => hint.trim())
        .filter(Boolean),
      name: answer.name,
      selector: answer.selector,
    }));
}

/** In-page autofiller for text, textarea, select, radio, checkbox, and ARIA widgets. */
export function buildAutofillSource(payload: FillPayloadItem[]): string {
  const json = JSON.stringify(payload);
  return `(() => {
  const items = ${json};
  const cssEsc = (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\\\" + ch);
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const valuesOf = (raw) => String(raw || "").split("||").map((v) => v.trim()).filter(Boolean);
  const score = (text, hints) => {
    const t = norm(text);
    if (!t) return 0;
    let best = 0;
    for (const h of hints) {
      const n = norm(h);
      if (!n) continue;
      if (t === n) best = Math.max(best, 100);
      else if (t.includes(n) || n.includes(t)) best = Math.max(best, 80);
      else {
        const tw = new Set(t.split(" ").filter(Boolean));
        const hw = n.split(" ").filter(Boolean);
        const hit = hw.filter((w) => tw.has(w)).length;
        if (hit) best = Math.max(best, Math.round((hit / hw.length) * 70));
      }
    }
    return best;
  };
  const optionMatches = (candidate, wanted) => {
    const c = norm(candidate);
    const w = norm(wanted);
    if (!c || !w) return false;
    return c === w || c.includes(w) || w.includes(c);
  };
  const fire = (el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const mark = (el) => {
    try { el.style.outline = "2px solid #c8f135"; } catch {}
  };
  const setNativeValue = (el, value) => {
    const tag = el.tagName.toLowerCase();
    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    fire(el);
    return true;
  };
  const setSelect = (el, value) => {
    const opts = [...el.options];
    const want = norm(value);
    let opt = opts.find((o) => norm(o.text) === want || norm(o.value) === want);
    if (!opt) opt = opts.find((o) => norm(o.text).includes(want) || want.includes(norm(o.text)));
    if (!opt) return false;
    el.value = opt.value;
    opt.selected = true;
    fire(el);
    mark(el);
    return true;
  };
  const clickChoice = (node) => {
    if (!node) return false;
    if (node instanceof HTMLInputElement) {
      if (!node.checked) node.click();
      if (!node.checked) {
        node.checked = true;
        fire(node);
      }
    } else {
      node.click();
      node.setAttribute("aria-checked", "true");
      node.setAttribute("aria-selected", "true");
    }
    mark(node);
    return true;
  };
  const labelText = (el) => {
    const bits = [];
    if (el.id) {
      const lab = document.querySelector('label[for="' + cssEsc(el.id) + '"]');
      if (lab) bits.push(lab.textContent || "");
    }
    const parent = el.closest("label");
    if (parent) bits.push(parent.textContent || "");
    bits.push(el.getAttribute("aria-label") || "");
    bits.push(el.getAttribute("placeholder") || "");
    bits.push(el.getAttribute("name") || "");
    bits.push(el.getAttribute("id") || "");
    bits.push(el.getAttribute("value") || "");
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\\s+/)) {
        const node = document.getElementById(id);
        if (node) bits.push(node.textContent || "");
      }
    }
    const wrap = el.closest("div,li,fieldset,section,tr,[role='group'],[role='radiogroup']");
    if (wrap) {
      const nearby = wrap.querySelector("legend,label,p,span,h1,h2,h3,h4");
      if (nearby) bits.push(nearby.textContent || "");
    }
    return bits.join(" ");
  };
  const groupLabel = (el) => {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && legend.textContent) return legend.textContent;
    }
    const group = el.closest("[role='radiogroup'],[role='group'],[role='listbox']");
    if (group) {
      if (group.getAttribute("aria-label")) return group.getAttribute("aria-label");
      const labelledBy = group.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" ");
      }
    }
    return labelText(el);
  };
  const isChoiceType = (type) => /multiple_choice|dropdown|checkboxes|radio|select|checkbox|scale/i.test(type || "");
  const findSelect = (item) => {
    const selects = [...document.querySelectorAll("select")];
    let best = null, bestScore = 0;
    if (item.selector) {
      try {
        const el = document.querySelector(item.selector);
        if (el && el.tagName && el.tagName.toLowerCase() === "select") return el;
      } catch {}
    }
    if (item.name) {
      const el = document.querySelector('select[name="' + cssEsc(item.name) + '"]');
      if (el) return el;
    }
    for (const el of selects) {
      const s = score(labelText(el) + " " + groupLabel(el), item.hints || [item.title]);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    return bestScore >= 35 ? best : null;
  };
  const findChoiceNodes = (item) => {
    const wanted = valuesOf(item.value);
    const hints = item.hints || [item.title];
    const native = [...document.querySelectorAll('input[type="radio"], input[type="checkbox"]')];
    const aria = [...document.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]')];
    const all = [...native, ...aria];
    // Prefer matching a whole named group to the question, then pick options inside it.
    const groups = new Map();
    for (const node of native) {
      const key = node.getAttribute("name") || node.id || Math.random().toString(36);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }
    let bestGroup = null, bestGroupScore = 0;
    for (const [, nodes] of groups) {
      const sample = nodes[0];
      const s = score(groupLabel(sample) + " " + labelText(sample), hints);
      if (s > bestGroupScore) { bestGroup = nodes; bestGroupScore = s; }
    }
    const pickFrom = (nodes) => {
      const hits = [];
      for (const node of nodes) {
        const text = labelText(node) + " " + (node.value || "") + " " + (node.textContent || "");
        if (wanted.some((w) => optionMatches(text, w) || optionMatches(node.value || "", w))) hits.push(node);
      }
      return hits;
    };
    if (bestGroup && bestGroupScore >= 30) {
      const hits = pickFrom(bestGroup);
      if (hits.length) return hits;
    }
    // Fall back: any choice control whose option text matches, with a question-ish nearby label.
    const scored = [];
    for (const node of all) {
      const text = labelText(node) + " " + (node.value || "") + " " + (node.textContent || "");
      const optionHit = wanted.some((w) => optionMatches(text, w) || optionMatches(node.value || "", w));
      if (!optionHit) continue;
      const qScore = score(groupLabel(node), hints);
      scored.push({ node, qScore });
    }
    scored.sort((a, b) => b.qScore - a.qScore);
    if (!scored.length) return [];
    if (/checkboxes|checkbox/i.test(item.type || "")) {
      return scored.filter((row) => row.qScore >= 20 || scored[0].qScore < 20).map((row) => row.node);
    }
    return [scored[0].node];
  };
  const fillText = (item) => {
    const candidates = [...document.querySelectorAll("input, textarea, [contenteditable='true']")]
      .filter((el) => {
        const type = (el.getAttribute("type") || "").toLowerCase();
        return !["hidden", "submit", "button", "image", "reset", "file", "radio", "checkbox"].includes(type);
      });
    let best = null, bestScore = 0;
    if (item.selector) {
      try {
        const el = document.querySelector(item.selector);
        if (el) { best = el; bestScore = 120; }
      } catch {}
    }
    if (!best && item.name) {
      const el = document.querySelector('input[name="' + cssEsc(item.name) + '"], textarea[name="' + cssEsc(item.name) + '"]');
      if (el) { best = el; bestScore = 110; }
    }
    for (const el of candidates) {
      const s = score(labelText(el), item.hints || [item.title]);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    if (!best || bestScore < 35) return 0;
    if (best.isContentEditable) {
      best.focus();
      best.textContent = item.value;
      best.dispatchEvent(new InputEvent("input", { bubbles: true }));
      mark(best);
      return 1;
    }
    if (setNativeValue(best, item.value)) { mark(best); return 1; }
    return 0;
  };

  let filled = 0;
  for (const item of items) {
    if (!item.value) continue;
    const choice = isChoiceType(item.type) || valuesOf(item.value).length > 1;

    if (choice || /dropdown|select/i.test(item.type || "")) {
      const select = findSelect(item);
      if (select && setSelect(select, valuesOf(item.value)[0] || item.value)) {
        filled += 1;
        continue;
      }
      const nodes = findChoiceNodes(item);
      if (nodes.length) {
        for (const node of nodes) {
          if (clickChoice(node)) filled += 1;
        }
        continue;
      }
      // If typed as choice but only a text-like control exists, fall through.
    }

    // Always try select match even for unknown types when value looks like an option.
    const maybeSelect = findSelect(item);
    if (maybeSelect && setSelect(maybeSelect, valuesOf(item.value)[0] || item.value)) {
      filled += 1;
      continue;
    }

    // Try radios/checkboxes even when type metadata was wrong/missing.
    const looseChoice = findChoiceNodes(item);
    if (looseChoice.length && (choice || item.options && item.options.length)) {
      for (const node of looseChoice) {
        if (clickChoice(node)) filled += 1;
      }
      if (looseChoice.length) continue;
    }

    filled += fillText(item);
  }

  const note = document.createElement("div");
  note.textContent = "InternHarbor filled " + filled + " field(s). Review before submitting.";
  note.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;background:#071c1f;color:#c8f135;padding:12px 16px;border-radius:10px;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)");
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 6000);
  return filled;
})();`;
}

export function buildBookmarklet(payload: FillPayloadItem[]): string {
  return `javascript:${encodeURIComponent(buildAutofillSource(payload))}`;
}

export function buildConsoleScript(payload: FillPayloadItem[]): string {
  return buildAutofillSource(payload);
}
