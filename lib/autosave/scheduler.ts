/**
 * Autosave scheduler (framework-free): debounces changes, saves at most one
 * value at a time and always ends on the latest one, never drops a pending
 * change on failure. The React binding lives in `use-autosave`.
 */

/**
 * `revision` orders server states (e.g. the record's update time): it lets
 * adopt tell a late response from a newer change made elsewhere.
 */
export type SaveResult = { ok: true; revision?: number } | { ok: false; error: string };

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type AutosaveSnapshot = {
  status: AutosaveStatus;
  /** Message of the last failed save, null otherwise. */
  error: string | null;
  /** A change is not saved yet (debounce running, save in flight or failed). */
  pending: boolean;
};

export type AutosaveScheduler<T> = {
  /** Records a new value and (re)starts the debounce. */
  change: (value: T) => void;
  /** Saves the latest value now; resolves once nothing is in flight. */
  flush: () => Promise<void>;
  /** Saves the latest value again after a failure. */
  retry: () => Promise<void>;
  /**
   * Takes a server value (e.g. from a refresh) as the new baseline. Refused
   * while a local change is pending, so it is never lost, and when its
   * revision is older than the last acknowledged one (a late response would
   * otherwise bring an older text back). A newer revision is always taken,
   * even if its text equals an earlier one (a remote revert).
   */
  adopt: (value: T, revision?: number) => boolean;
  /**
   * Abandons the unsaved draft and its error (the user cancelled it): the
   * last saved value becomes current again and nothing resends the draft.
   */
  discard: () => void;
  /** Flushes and stops: later calls and notifications are ignored. */
  dispose: () => Promise<void>;
  snapshot: () => AutosaveSnapshot;
  /** Replaces the save function used by the next saves. */
  setSave: (save: (value: T) => Promise<SaveResult>) => void;
};

const DEFAULT_ERROR = "Échec de l’enregistrement.";

export function createAutosaveScheduler<T>({
  initial,
  revision: initialRevision,
  delay,
  save,
  onChange,
  equals = Object.is,
}: {
  initial: T;
  /** Revision of the initial value. */
  revision?: number;
  delay: number;
  save: (value: T) => Promise<SaveResult>;
  onChange?: (snapshot: AutosaveSnapshot) => void;
  equals?: (a: T, b: T) => boolean;
}): AutosaveScheduler<T> {
  let latest = initial;
  let saved = initial;
  let status: AutosaveStatus = "idle";
  let error: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let disposed = false;
  let currentSave = save;
  /** Bumped by discard: a save started before it no longer reports errors. */
  let generation = 0;
  /** Revision of the latest server state known (acknowledged or adopted). */
  let revision = initialRevision;

  const snapshot = (): AutosaveSnapshot => ({
    status,
    error,
    pending: inFlight !== null || !equals(latest, saved) || status === "error",
  });

  const notify = () => {
    if (!disposed) onChange?.(snapshot());
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function loop() {
    while (!equals(latest, saved)) {
      const value = latest;
      const started = generation;
      status = "saving";
      notify();
      let result: SaveResult;
      try {
        result = await currentSave(value);
      } catch {
        result = { ok: false, error: DEFAULT_ERROR };
      }
      if (!result.ok) {
        if (started !== generation) return;
        status = "error";
        error = result.error || DEFAULT_ERROR;
        return;
      }
      if (result.revision !== undefined) {
        revision = Math.max(revision ?? result.revision, result.revision);
      }
      saved = value;
      error = null;
      status = "saved";
    }
    if (status === "error") {
      // The failed value was reverted to the saved one: nothing to retry.
      status = "saved";
      error = null;
    }
  }

  function run(): Promise<void> {
    clearTimer();
    // The running loop picks the latest value up when its save returns.
    if (inFlight) return inFlight;
    if (equals(latest, saved) && status !== "error") {
      notify();
      return Promise.resolve();
    }
    inFlight = loop().finally(() => {
      inFlight = null;
      notify();
    });
    return inFlight;
  }

  return {
    change(value) {
      if (disposed) return;
      latest = value;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delay);
      notify();
    },
    flush: () => (disposed ? (inFlight ?? Promise.resolve()) : run()),
    retry: () => (disposed ? Promise.resolve() : run()),
    adopt(value, valueRevision) {
      if (disposed || snapshot().pending) return false;
      if (valueRevision !== undefined && revision !== undefined && valueRevision < revision) {
        return false;
      }
      if (valueRevision !== undefined) revision = valueRevision;
      latest = value;
      saved = value;
      return true;
    },
    discard() {
      if (disposed) return;
      clearTimer();
      generation += 1;
      latest = saved;
      error = null;
      if (status === "error") status = "idle";
      notify();
    },
    dispose() {
      if (disposed) return inFlight ?? Promise.resolve();
      disposed = true;
      return run();
    },
    snapshot,
    setSave(next) {
      currentSave = next;
    },
  };
}
