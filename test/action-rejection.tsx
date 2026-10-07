import { render, screen } from "@testing-library/react";
import { Component, type ReactElement, type ReactNode } from "react";
import { expect } from "vitest";

/**
 * Stands in for the app's error boundary: an action whose promise rejects
 * (network or transport failure) must be caught by the screen itself, so
 * this fallback must never render (JIR-65).
 */
class TestErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <p data-testid="error-boundary">Erreur inattendue</p> : this.props.children;
  }
}

export function renderWithBoundary(ui: ReactElement) {
  return render(<TestErrorBoundary>{ui}</TestErrorBoundary>);
}

export function expectNoBoundary() {
  expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
}

/**
 * A failure thrown by a success side effect (after the action resolved ok)
 * is not a failed action: it must escape the action's local catch and reach
 * the boundary instead of being reported as « … impossible. » (JIR-65).
 */
export async function expectBoundary() {
  expect(await screen.findByTestId("error-boundary")).toBeInTheDocument();
}

/** A success side effect (e.g. a toast) that fails after the action succeeded. */
export const successEffectError = () => new Error("toast failed");

/** The rejection a server action call produces when the request never lands. */
export const transportError = () => new TypeError("Failed to fetch");
