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
   * while a local change is pending, so it is never lost. Revisions are
   * unique per server write: an older one is a late response, an equal one
   * is the known write (a different text there is refused), a newer one is
   * taken even if its text equals an earlier one (a remote revert).
   */
  adopt: (value: T, revision?: number) => boolean;
  /**
   * Abandons the unsaved draft and its error (the user cancelled it): the
   * last saved value becomes current again and nothing resends the draft.
   */
  discard: () => void;
  /** Flushes and stops: later calls and notifications are ignored. */
  dispose: () => Promise<void>;
  /** Current state; the same object until it changes (useSyncExternalStore). */
  snapshot: () => AutosaveSnapshot;
  /** Latest value (the unsaved draft when one is pending). */
  current: () => T;
  subscribe: (listener: (snapshot: AutosaveSnapshot) => void) => () => void;
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

  const compute = (): AutosaveSnapshot => ({
    status,
    error,
    pending: inFlight !== null || !equals(latest, saved) || status === "error",
  });
  let current = compute();
  const listeners = new Set<(snapshot: AutosaveSnapshot) => void>();
  if (onChange) listeners.add(onChange);

  const notify = () => {
    if (disposed) return;
    const next = compute();
    if (
      next.status === current.status &&
      next.error === current.error &&
      next.pending === current.pending
    ) {
      return;
    }
    current = next;
    listeners.forEach((listener) => listener(current));
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
      if (disposed || compute().pending) return false;
      if (valueRevision !== undefined && revision !== undefined) {
        // Revisions are unique per write: older is stale, and an equal one
        // is the write we already know (another text there is a late echo).
        if (valueRevision < revision) return false;
        if (valueRevision === revision && !equals(value, saved)) return false;
      }
      if (valueRevision !== undefined) revision = valueRevision;
      latest = value;
      saved = value;
      notify();
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
    snapshot: () => current,
    current: () => latest,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSave(next) {
      currentSave = next;
    },
  };
}
