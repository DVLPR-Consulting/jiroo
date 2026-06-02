"use client";

import { useRef, useState } from "react";

export function OtpInput({
  length = 6,
  onComplete,
  autoFocus = true,
}: {
  length?: number;
  onComplete: (code: string) => void;
  autoFocus?: boolean;
}) {
  const [values, setValues] = useState<string[]>(() => Array<string>(length).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function commit(next: string[]) {
    setValues(next);
    const code = next.join("");
    if (code.length === length && !next.includes("")) onComplete(code);
  }

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return; // ignore non-digit / clears handled by backspace
    const next = [...values];
    next[i] = digit;
    if (i < length - 1) refs.current[i + 1]?.focus();
    commit(next);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Backspace") return;
    const next = [...values];
    if (values[i]) {
      next[i] = "";
      commit(next);
    } else if (i > 0) {
      refs.current[i - 1]?.focus();
      next[i - 1] = "";
      commit(next);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length).split("");
    if (digits.length === 0) return;
    const next = Array<string>(length).fill("");
    digits.forEach((d, idx) => {
      next[idx] = d;
    });
    refs.current[Math.min(digits.length, length - 1)]?.focus();
    commit(next);
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={`Code à ${length} chiffres`}>
      {values.map((v, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={v}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          aria-label={`Chiffre ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-[52px] w-[44px] rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] text-center text-[22px] text-foreground outline-none focus:border-[var(--ring)] focus:ring-2"
          style={{ fontFamily: "var(--font-mono)" }}
        />
      ))}
    </div>
  );
}
