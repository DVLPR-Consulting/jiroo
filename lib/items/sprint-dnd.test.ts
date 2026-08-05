import { describe, expect, it } from "vitest";
import { prioritizeSprintPointerCollisions } from "@/lib/items/sprint-dnd";

const collision = (id: string) => ({
  id,
  data: { droppableContainer: {} as never, value: 1 },
});

describe("sprint backlog collision priority", () => {
  it("uses an empty sprint section under the pointer instead of a distant row", () => {
    expect(
      prioritizeSprintPointerCollisions(
        [collision("section:sprint-1")],
        [collision("item-backlog-1")],
      ),
    ).toEqual([collision("section:sprint-1")]);
  });

  it("keeps the precise item target when the pointer is inside a row", () => {
    expect(
      prioritizeSprintPointerCollisions(
        [collision("section:sprint-1"), collision("item-sprint-1")],
        [collision("item-backlog-1")],
      ),
    ).toEqual([collision("item-sprint-1")]);
  });

  it("falls back to geometry for keyboard movement", () => {
    expect(
      prioritizeSprintPointerCollisions([], [collision("section:sprint-1")]),
    ).toEqual([collision("section:sprint-1")]);
  });
});
