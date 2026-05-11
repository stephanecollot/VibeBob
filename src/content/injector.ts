interface RecordedError {
  ts: string;
  message: string;
  stack?: string;
}

const errors = new Map<string, RecordedError[]>();

function pushError(featureId: string, message: string, stack?: string): void {
  const list = errors.get(featureId) ?? [];
  list.push({ ts: new Date().toISOString(), message, stack });
  while (list.length > 20) list.shift();
  errors.set(featureId, list);
}

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const data = e.data as { __vibebob?: string; featureId?: string; message?: string; stack?: string };
  if (!data || data.__vibebob !== "mod-error") return;
  if (typeof data.featureId !== "string" || typeof data.message !== "string") return;
  pushError(data.featureId, data.message, data.stack);
});

export function getModErrors(input: { featureId: string }): RecordedError[] {
  return errors.get(input.featureId) ?? [];
}

function trackApply(input: { featureId: string }): { ok: true } {
  errors.set(input.featureId, []);
  return { ok: true };
}

export const modHandlers = {
  get_mod_errors: getModErrors,
  _track_apply: trackApply,
};
