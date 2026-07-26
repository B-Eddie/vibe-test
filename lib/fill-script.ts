import type { FilledAnswer } from "./types";

export type FillPayloadItem = {
  title: string;
  value: string;
  type: string;
  hints: string[];
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

/** Minified-ish in-page autofiller. Works on most HTML/React application forms. */
export function buildAutofillSource(payload: FillPayloadItem[]): string {
  const json = JSON.stringify(payload);
  return `(() => {
  const items = ${json};
  const cssEsc = (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\\\" + ch);
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
  const setVal = (el, value) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      const opts = [...el.options];
      const want = norm(value);
      let opt = opts.find((o) => norm(o.text) === want || norm(o.value) === want);
      if (!opt) opt = opts.find((o) => norm(o.text).includes(want) || want.includes(norm(o.text)));
      if (opt) el.value = opt.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    }
    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
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
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\\s+/)) {
        const node = document.getElementById(id);
        if (node) bits.push(node.textContent || "");
      }
    }
    const wrap = el.closest("div,li,fieldset,section");
    if (wrap) {
      const nearby = wrap.querySelector("label,legend,p,span,h1,h2,h3,h4");
      if (nearby) bits.push(nearby.textContent || "");
    }
    return bits.join(" ");
  };
  const candidates = [...document.querySelectorAll("input, textarea, select, [contenteditable='true']")]
    .filter((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return !["hidden", "submit", "button", "image", "reset", "file"].includes(type);
    });
  let filled = 0;
  const used = new Set();
  for (const item of items) {
    if (!item.value) continue;
    let best = null;
    let bestScore = 0;
    if (item.selector) {
      try {
        const el = document.querySelector(item.selector);
        if (el && !used.has(el)) { best = el; bestScore = 120; }
      } catch {}
    }
    if (!best && item.name) {
      const el = document.querySelector('[name="' + cssEsc(item.name) + '"]');
      if (el && !used.has(el)) { best = el; bestScore = 110; }
    }
    for (const el of candidates) {
      if (used.has(el)) continue;
      const s = score(labelText(el), item.hints || [item.title]);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    if (!best || bestScore < 35) continue;
    const type = (best.getAttribute("type") || "").toLowerCase();
    if (type === "radio" || type === "checkbox") {
      const groupName = best.getAttribute("name");
      const group = groupName
        ? [...document.querySelectorAll('input[type="' + type + '"][name="' + cssEsc(groupName) + '"]')]
        : [best];
      const values = String(item.value).split("||").map((v) => norm(v));
      for (const node of group) {
        const lt = norm(labelText(node) + " " + (node.value || ""));
        if (values.some((v) => lt.includes(v) || v.includes(lt) || norm(node.value) === v)) {
          node.click();
          used.add(node);
          filled += 1;
        }
      }
      continue;
    }
    if (setVal(best, item.value)) {
      used.add(best);
      best.style.outline = "2px solid #0f766e";
      filled += 1;
    }
  }
  const note = document.createElement("div");
  note.textContent = "InternHarbor filled " + filled + " field(s). Review before submitting.";
  note.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;background:#0f766e;color:#fff;padding:12px 16px;border-radius:12px;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.2)");
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
