export function applyBootstrap(
  featureId: string,
  scope: string,
  modJs: string,
  modCss: string,
): { ok: true; scope: string } {
  type Reg = {
    mods: Record<string, { apply?: Function; cleanup?: Function }>;
    cleanups: Record<string, Array<() => void>>;
  };
  const w = window as unknown as { __claudeThis?: Reg };
  const reg: Reg = (w.__claudeThis = w.__claudeThis ?? { mods: {}, cleanups: {} });

  const prev = reg.mods[featureId];
  const prevCleanups = reg.cleanups[featureId] || [];
  for (let i = prevCleanups.length - 1; i >= 0; i--) {
    try {
      prevCleanups[i]();
    } catch {}
  }
  if (prev && typeof prev.cleanup === "function") {
    try {
      prev.cleanup();
    } catch {}
  }
  delete reg.mods[featureId];
  delete reg.cleanups[featureId];

  document.getElementById(`ct-style-${featureId}`)?.remove();
  document.getElementById(`ct-script-${featureId}`)?.remove();

  if (modCss && modCss.trim().length > 0) {
    const style = document.createElement("style");
    style.id = `ct-style-${featureId}`;
    style.textContent = modCss;
    document.head.appendChild(style);
  }

  reg.cleanups[featureId] = [];
  const ctxKey = `__claudeThisCtx_${featureId}`;
  (window as unknown as Record<string, unknown>)[ctxKey] = {
    scope,
    onCleanup: (fn: () => void) => {
      if (typeof fn === "function") reg.cleanups[featureId].push(fn);
    },
    log: (m: unknown) => console.log(`[claudethis/mod ${featureId.slice(0, 8)}]`, m),
    error: (err: unknown) => {
      const e = err as { message?: string; stack?: string };
      window.postMessage(
        {
          __claudethis: "mod-error",
          featureId,
          message: (e && e.message) || String(err),
          stack: e && e.stack,
        },
        "*",
      );
    },
  };

  const stripped = modJs.replace(/^\s*export\s+/gm, "");
  const idJson = JSON.stringify(featureId);
  const wrapper = `
(function () {
  var ctx = window["__claudeThisCtx_" + ${idJson}];
  var reg = window.__claudeThis;
  try {
    ${stripped}
    var entry = {
      apply: typeof apply === "function" ? apply : undefined,
      cleanup: typeof cleanup === "function" ? cleanup : undefined,
      matches: typeof matches !== "undefined" ? matches : undefined
    };
    reg.mods[${idJson}] = entry;
    if (typeof entry.apply === "function") {
      try { entry.apply(ctx); }
      catch (err) {
        window.postMessage({ __claudethis: "mod-error", featureId: ${idJson}, message: "apply(): " + ((err && err.message) || String(err)), stack: err && err.stack }, "*");
      }
    } else {
      window.postMessage({ __claudethis: "mod-error", featureId: ${idJson}, message: "no apply() defined" }, "*");
    }
  } catch (err) {
    window.postMessage({ __claudethis: "mod-error", featureId: ${idJson}, message: "compile: " + ((err && err.message) || String(err)), stack: err && err.stack }, "*");
  }
})();
`;

  const blob = new Blob([wrapper], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const script = document.createElement("script");
  script.src = url;
  script.id = `ct-script-${featureId}`;
  script.onload = () => URL.revokeObjectURL(url);
  script.onerror = () => {
    URL.revokeObjectURL(url);
    window.postMessage(
      {
        __claudethis: "mod-error",
        featureId,
        message:
          "blob: <script src> blocked by page CSP. Page must allow 'self' or 'blob:' in script-src.",
      },
      "*",
    );
  };
  (document.head || document.documentElement).appendChild(script);
  return { ok: true, scope };
}

export function unapplyBootstrap(featureId: string): { ok: true } {
  type Reg = {
    mods: Record<string, { cleanup?: () => void }>;
    cleanups: Record<string, Array<() => void>>;
  };
  const w = window as unknown as { __claudeThis?: Reg };
  const reg = w.__claudeThis;
  if (reg) {
    const entry = reg.mods[featureId];
    const cleanups = reg.cleanups[featureId] || [];
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]();
      } catch {}
    }
    if (entry && typeof entry.cleanup === "function") {
      try {
        entry.cleanup();
      } catch {}
    }
    delete reg.mods[featureId];
    delete reg.cleanups[featureId];
  }
  document.getElementById(`ct-style-${featureId}`)?.remove();
  document.getElementById(`ct-script-${featureId}`)?.remove();
  return { ok: true };
}
