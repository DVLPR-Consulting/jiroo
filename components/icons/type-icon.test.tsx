import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeIcon } from "@/components/icons/type-icon";

describe("TypeIcon", () => {
  it.each([
    ["composant", "Composant"],
    ["epic", "Epic"],
    ["tache", "Tâche"],
    ["soustache", "Sous-tâche"],
  ] as const)("expose le libellé %s", (type, label) => {
    render(<TypeIcon type={type} />);
    expect(screen.getByRole("img", { name: label })).toBeInTheDocument();
  });
});
