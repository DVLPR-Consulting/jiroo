/**
 * Autosave scheduler (framework-free): debounces changes, saves at most one
 * value at a time and always ends on the latest one, never drops a pending
 * change on failure. The React binding lives in `use-autosave`.
 */

export type SaveResult = { ok: true } | { ok: false; error: string };

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
   * Takes a value saved elsewhere (another tab, another user) as the new
   * baseline. Refused while a local change is pending, so it is never lost,
   * and for a late echo of an earlier save of this scheduler (an out-of-order
   * refresh would otherwise bring an older text back).
   */
  adopt: (value: T) => boolean;
  /** Flushes and stops: later calls and notifications are ignored. */
  dispose: () => Promise<void>;
  snapshot: () => AutosaveSnapshot;
  /** Replaces the save function used by the next saves. */
  setSave: (save: (value: T) => Promise<SaveResult>) => void;
};

const DEFAULT_ERROR = "Échec de l’enregistrement.";

export function createAutosaveScheduler<T>({
  initial,
  delay,
  save,
  onChange,
  equals = Object.is,
}: {
  initial: T;
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
  /** Values this scheduler saved before the current baseline. */
  const earlier: T[] = [];

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
      status = "saving";
      notify();
      let result: SaveResult;
      try {
        result = await currentSave(value);
      } catch {
        result = { ok: false, error: DEFAULT_ERROR };
      }
      if (!result.ok) {
        status = "error";
        error = result.error || DEFAULT_ERROR;
        return;
      }
      earlier.push(saved);
      if (earlier.length > 50) earlier.shift();
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
    adopt(value) {
      if (disposed || snapshot().pending) return false;
      if (!equals(value, saved) && earlier.some((old) => equals(old, value))) return false;
      latest = value;
      saved = value;
      return true;
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
