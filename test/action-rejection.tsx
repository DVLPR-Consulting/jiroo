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

/** The rejection a server action call produces when the request never lands. */
export const transportError = () => new TypeError("Failed to fetch");
