/**
 * Injected into the tab's MAIN world via chrome.scripting.executeScript.
 * Extension isolated-world CSP forbids `new Function`; the page's CSP applies here instead.
 */
export function evaluateJsMain(expr: string): unknown {
  function safeSerialize(v: unknown, depth = 3): unknown {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "function") return `[Function: ${(v as { name?: string }).name ?? "anon"}]`;
    if (depth <= 0) return "[…]";
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => safeSerialize(x, depth - 1));
    if (typeof Element !== "undefined" && v instanceof Element) {
      return {
        tag: v.tagName.toLowerCase(),
        id: v.id || undefined,
        classes: Array.from(v.classList),
      };
    }
    if (
      typeof NodeList !== "undefined" &&
      (v instanceof NodeList || v instanceof HTMLCollection)
    ) {
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

  if (typeof expr !== "string") throw new Error("expr must be a string");

  let fn: () => unknown;
  try {
    fn = new Function(`"use strict"; return (${expr});`) as () => unknown;
  } catch {
    // Multi-statement snippets like `const x = …; JSON.stringify(…)` are invalid inside
    // `return ( … )` but are valid scripts whose completion value is the last expression.
    fn = new Function(`"use strict"; return eval(${JSON.stringify(expr)});`) as () => unknown;
  }

  const result = fn();
  return safeSerialize(result);
}
