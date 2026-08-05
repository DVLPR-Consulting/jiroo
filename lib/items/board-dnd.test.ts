import { describe, expect, it } from "vitest";
import {
  BOARD_AUTO_SCROLL,
  BOARD_SCREEN_READER_INSTRUCTIONS,
  boardDragDisabled,
  createBoardAnnouncements,
  restoreCancelledColumns,
} from "@/lib/items/board-dnd";

describe("board DnD accessibility and safety", () => {
  it("restores the exact pre-drag snapshot after cancellation", () => {
    type TestColumns = Record<string, Array<{ id: string; key: string }>>;
    const snapshot: TestColumns = {
      "col::todo": [{ id: "task-a", key: "DEMO-1" }],
      "col::doing": [],
    };
    const projected: TestColumns = {
      "col::todo": [],
      "col::doing": [{ id: "task-a", key: "DEMO-1" }],
    };

    expect(restoreCancelledColumns(snapshot, projected)).toBe(snapshot);
    expect(restoreCancelledColumns(null, projected)).toBe(projected);
  });

  it("announces business labels in French without technical ids", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const announcements = createBoardAnnouncements(
      new Map([[uuid, "DEMO-1 — Authentification"]]),
      new Map([["col::review", "En revue"]]),
    );
    const active = { id: uuid } as never;
    const over = { id: "col::review" } as never;

    expect(announcements.onDragStart({ active })).toBe(
      "DEMO-1 — Authentification sélectionné. Utilisez les flèches pour le déplacer.",
    );
    expect(announcements.onDragOver({ active, over })).toBe(
      "DEMO-1 — Authentification déplacé vers En revue.",
    );
    expect(announcements.onDragEnd({ active, over })).toBe(
      "DEMO-1 — Authentification déposé dans En revue.",
    );
    expect(announcements.onDragCancel({ active, over: null })).toBe(
      "Déplacement de DEMO-1 — Authentification annulé. Position d’origine restaurée.",
    );

    const allText = [
      announcements.onDragStart({ active }),
      announcements.onDragOver({ active, over }),
      announcements.onDragEnd({ active, over }),
      announcements.onDragCancel({ active, over: null }),
      BOARD_SCREEN_READER_INSTRUCTIONS.draggable,
    ].join(" ");
    expect(allText).not.toContain(uuid);
    expect(allText).not.toMatch(/Picked up|Draggable|Dragging|droppable/i);
  });

  it("uses a narrow, slower auto-scroll edge zone", () => {
    expect(BOARD_AUTO_SCROLL).toMatchObject({
      acceleration: 5,
      interval: 10,
      threshold: { x: 0.05, y: 0.1 },
    });
  });

  it("blocks a second drag while a board mutation is in flight", () => {
    expect(boardDragDisabled(true, 0)).toBe(false);
    expect(boardDragDisabled(true, 1)).toBe(true);
    expect(boardDragDisabled(false, 0)).toBe(true);
  });
});
