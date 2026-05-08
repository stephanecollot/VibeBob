interface DomNode {
  tag: string;
  id?: string;
  classes?: string[];
  attrs?: Record<string, string>;
  text?: string;
  children?: DomNode[];
  truncated?: boolean;
}

const MAX_NODES = 200;
const MAX_TEXT = 200;
const DEFAULT_DEPTH = 4;

function summarizeAttrs(el: Element): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name === "id" || a.name === "class") continue;
    if (a.name === "style") {
      out.style = a.value.length > 80 ? a.value.slice(0, 80) + "…" : a.value;
      continue;
    }
    out[a.name] = a.value.length > 80 ? a.value.slice(0, 80) + "…" : a.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function clipText(s: string): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) + "…" : trimmed;
}

function nodeToTree(
  node: Node,
  depth: number,
  budget: { count: number },
): DomNode | null {
  if (budget.count <= 0) return null;
  budget.count--;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = clipText(node.textContent ?? "");
    if (!text) return null;
    return { tag: "#text", text };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const out: DomNode = { tag: el.tagName.toLowerCase() };
  if (el.id) out.id = el.id;
  const classes = el.classList ? Array.from(el.classList) : [];
  if (classes.length > 0) out.classes = classes;
  const attrs = summarizeAttrs(el);
  if (attrs) out.attrs = attrs;
  if (depth <= 0 && el.children.length > 0) {
    out.truncated = true;
    return out;
  }
  const children: DomNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (budget.count <= 0) {
      out.truncated = true;
      break;
    }
    const c = nodeToTree(child, depth - 1, budget);
    if (c) children.push(c);
  }
  if (children.length > 0) out.children = children;
  else if (el.children.length === 0) {
    const text = clipText(el.textContent ?? "");
    if (text) out.text = text;
  }
  return out;
}

export function inspectDom(input: { selector?: string; depth?: number } = {}): {
  url: string;
  title: string;
  root: DomNode | null;
} {
  const root = input.selector ? document.querySelector(input.selector) : document.body;
  const tree = root
    ? nodeToTree(root, input.depth ?? DEFAULT_DEPTH, { count: MAX_NODES })
    : null;
  return {
    url: location.href,
    title: document.title,
    root: tree,
  };
}

export function getHtml(input: { selector?: string } = {}): string {
  const el = input.selector ? document.querySelector(input.selector) : document.body;
  if (!el) throw new Error(`no element matches: ${input.selector ?? "body"}`);
  const html = (el as Element).outerHTML;
  return html.length > 50_000 ? html.slice(0, 50_000) + "\n…[truncated]" : html;
}

export function getComputedStyleFor(input: { selector: string }): Record<string, string> {
  const el = document.querySelector(input.selector);
  if (!el) throw new Error(`no element matches: ${input.selector}`);
  const cs = getComputedStyle(el);
  const interesting = [
    "display",
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "height",
    "margin",
    "padding",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-family",
    "border",
    "z-index",
    "opacity",
    "visibility",
    "flex",
    "grid",
  ];
  const out: Record<string, string> = {};
  for (const k of interesting) out[k] = cs.getPropertyValue(k);
  return out;
}

export function evaluateJs(input: { expr: string }): unknown {
  if (typeof input.expr !== "string") throw new Error("expr must be a string");
  const fn = new Function(`"use strict"; return (${input.expr});`);
  const result = fn();
  return safeSerialize(result);
}

function safeSerialize(v: unknown, depth = 3): unknown {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;
  if (t === "function") return `[Function: ${(v as { name?: string }).name ?? "anon"}]`;
  if (depth <= 0) return "[…]";
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => safeSerialize(x, depth - 1));
  if (v instanceof Element) {
    return {
      tag: v.tagName.toLowerCase(),
      id: v.id || undefined,
      classes: Array.from(v.classList),
    };
  }
  if (v instanceof NodeList || v instanceof HTMLCollection) {
    return Array.from(v).slice(0, 50).map((x) => safeSerialize(x, depth - 1));
  }
  try {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const k of Object.keys(obj)) {
      if (i++ > 50) break;
      out[k] = safeSerialize(obj[k], depth - 1);
    }
    return out;
  } catch {
    return String(v);
  }
}

export function clickEl(input: { selector: string }): { ok: true } {
  const el = document.querySelector(input.selector);
  if (!el) throw new Error(`no element matches: ${input.selector}`);
  (el as HTMLElement).click();
  return { ok: true };
}

export function typeInto(input: { selector: string; text: string }): { ok: true } {
  const el = document.querySelector(input.selector) as HTMLElement | null;
  if (!el) throw new Error(`no element matches: ${input.selector}`);
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, input.text);
    else el.value = input.text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = input.text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    throw new Error(`element is not an input/textarea/contenteditable: ${input.selector}`);
  }
  return { ok: true };
}

export type ContentToolName =
  | "inspect_dom"
  | "get_html"
  | "get_computed_style"
  | "evaluate_js"
  | "click"
  | "type";

export const handlers: Record<ContentToolName, (input: any) => unknown> = {
  inspect_dom: inspectDom,
  get_html: getHtml,
  get_computed_style: getComputedStyleFor,
  evaluate_js: evaluateJs,
  click: clickEl,
  type: typeInto,
};
