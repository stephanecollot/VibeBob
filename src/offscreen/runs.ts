import type { FeatureId } from "../types";

export interface Run {
  ctrl: AbortController;
  /** Set when something aborts this run, so the failure can say who did it. */
  cancelledBy?: "user" | "newer-run";
}

/**
 * One in-flight agent run per feature. A run that gets superseded must not clear
 * the slot its replacement now owns, or the cancel button stops working.
 */
export class RunRegistry {
  private readonly runs = new Map<FeatureId, Run>();

  /** Starts a run, aborting whatever was already running for this feature. */
  begin(featureId: FeatureId): Run {
    const prev = this.runs.get(featureId);
    if (prev) {
      prev.cancelledBy = "newer-run";
      prev.ctrl.abort();
    }
    const run: Run = { ctrl: new AbortController() };
    this.runs.set(featureId, run);
    return run;
  }

  /** Only clears the slot if it is still ours — a newer run may have taken it. */
  end(featureId: FeatureId, run: Run): void {
    if (this.runs.get(featureId) === run) this.runs.delete(featureId);
  }

  /** Aborts the current run, if any. Returns false when nothing was running. */
  cancel(featureId: FeatureId): boolean {
    const run = this.runs.get(featureId);
    if (!run) return false;
    run.cancelledBy = "user";
    run.ctrl.abort();
    return true;
  }

  /**
   * What to show the user for an aborted run. `null` means stay quiet: a newer run
   * owns the chat UI, and an event here would clear its spinner and flash an error.
   */
  cancelMessage(run: Run): string | null {
    if (run.cancelledBy === "newer-run") return null;
    return "Cancelled — you stopped this run.";
  }
}
