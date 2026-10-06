import { useState } from "react";

/**
 * Returns `value`, or the last non-null value once it becomes null.
 *
 * A confirmation opened with `open={target !== null}` renders from `target`;
 * clearing the target to close it would blank the title and body during the
 * dialog's exit animation. Render from the retained value instead: it keeps
 * the last target on screen while the dialog fades out, and the next open
 * replaces it.
 */
export function useRetainedWhileClosing<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  // Adjusting state during render is React's documented pattern for
  // deriving from a previous value; the guard stops it from looping.
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
