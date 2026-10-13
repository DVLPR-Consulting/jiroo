"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SPRINT_DATE_MESSAGES,
  type DateTimeEntry,
  type DateTimeParts,
  type SprintDateErrors,
} from "@/lib/items/sprint-dates";
import { capacityPointsSchema } from "@/lib/validation/sprint";

type Bound = "start" | "end";

/**
 * Field values plus the browser's partial-entry flags: a half-typed date or
 * time input reports an empty value, so only `validity.badInput` tells it
 * apart from an empty field. Read at submit, since forms use `noValidate`.
 */
export function readDateEntry(
  form: HTMLFormElement,
  bound: Bound,
  parts: DateTimeParts,
): DateTimeEntry {
  const badInput = (name: string) => {
    const input = form.elements.namedItem(name);
    return input instanceof HTMLInputElement && input.validity.badInput;
  };
  return {
    ...parts,
    dateIncomplete: badInput(`${bound}-date`),
    timeIncomplete: badInput(`${bound}-time`),
  };
}

/** True when a native number input holds text the browser cannot parse. */
function hasBadInput(form: HTMLFormElement, name: string): boolean {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement && input.validity.badInput;
}

/**
 * Client check of the capacity field, with the server schema's messages:
 * `noValidate` turns off the native min / max / step constraints.
 */
export function capacityInputError(form: HTMLFormElement, value: string): string | null {
  if (hasBadInput(form, "capacity")) return "Capacité invalide.";
  if (value === "") return null;
  const parsed = capacityPointsSchema.safeParse(Number(value));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Capacité invalide.");
}

type InvalidFields = SprintDateErrors & { name?: string | null; capacity?: string | null };

function focusTargets(errors: InvalidFields): string[] {
  const datePart = (bound: Bound, message: string) =>
    message === SPRINT_DATE_MESSAGES.invalidTime ? `${bound}-time` : `${bound}-date`;
  return [
    errors.name ? "name" : null,
    errors.start ? datePart("start", errors.start) : null,
    errors.end ? datePart("end", errors.end) : null,
    errors.capacity ? "capacity" : null,
  ].filter((target): target is string => target !== null);
}

function focusable(input: unknown): input is HTMLInputElement {
  if (!(input instanceof HTMLInputElement) || !input.isConnected || input.disabled) return false;
  // jsdom has no layout and no checkVisibility: treat its inputs as visible.
  return typeof input.checkVisibility === "function" ? input.checkVisibility() : true;
}

/**
 * Moves focus to the first invalid field, as native validation did, once
 * React has committed its error: the field is then read out with its
 * aria-invalid state and message (via aria-describedby), once.
 */
export function useInvalidFieldFocus() {
  const request = useRef<{ form: HTMLFormElement; errors: InvalidFields } | null>(null);
  // Guarantees a commit after the request, even if the errors did not change.
  const [, setTick] = useState(0);
  // Runs after every commit and consumes a pending request.
  useLayoutEffect(() => {
    const pending = request.current;
    if (!pending) return;
    request.current = null;
    if (!pending.form.isConnected) return;
    for (const name of focusTargets(pending.errors)) {
      const input = pending.form.elements.namedItem(name);
      if (focusable(input)) {
        input.focus();
        return;
      }
    }
  });
  return useCallback((form: HTMLFormElement, errors: InvalidFields) => {
    if (focusTargets(errors).length === 0) return;
    request.current = { form, errors };
    setTick((tick) => tick + 1);
  }, []);
}

function DateField({
  prefix,
  bound,
  label,
  timeLabel,
  value,
  error,
  hintId,
  onChange,
}: {
  prefix: string;
  bound: Bound;
  label: string;
  timeLabel: string;
  value: DateTimeParts;
  error?: string;
  hintId: string;
  onChange: (value: DateTimeParts) => void;
}) {
  const errorId = `${prefix}-${bound}-error`;
  const describedBy = error ? `${errorId} ${hintId}` : hintId;
  return (
    <div className="space-y-2">
      <Label htmlFor={`${prefix}-${bound}`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={`${prefix}-${bound}`}
          name={`${bound}-date`}
          type="date"
          value={value.date}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
        <Input
          id={`${prefix}-${bound}-time`}
          name={`${bound}-time`}
          type="time"
          className="w-28 shrink-0"
          aria-label={timeLabel}
          value={value.time}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, time: event.target.value })}
        />
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Start and end of a sprint as a date plus an optional time each (JIR-87):
 * a day alone is enough, the time defaults to 09:00 / 18:00.
 */
export function SprintDateFields({
  prefix,
  startLabel,
  endLabel,
  start,
  end,
  errors,
  onStartChange,
  onEndChange,
}: {
  prefix: string;
  startLabel: string;
  endLabel: string;
  start: DateTimeParts;
  end: DateTimeParts;
  errors: SprintDateErrors;
  onStartChange: (value: DateTimeParts) => void;
  onEndChange: (value: DateTimeParts) => void;
}) {
  const hintId = `${prefix}-dates-hint`;
  return (
    <div className="space-y-3">
      <DateField
        prefix={prefix}
        bound="start"
        label={startLabel}
        timeLabel="Heure de début"
        value={start}
        error={errors.start}
        hintId={hintId}
        onChange={onStartChange}
      />
      <DateField
        prefix={prefix}
        bound="end"
        label={endLabel}
        timeLabel="Heure de fin"
        value={end}
        error={errors.end}
        hintId={hintId}
        onChange={onEndChange}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        Heure facultative : 9 h pour le début et 18 h pour la fin par défaut.
      </p>
    </div>
  );
}
