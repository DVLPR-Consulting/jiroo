import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoadmapEdits } from "@/components/roadmap/use-roadmap-edits";
import type { RoadmapSource } from "@/lib/roadmap/rows";

const { updateItemAction } = vi.hoisted(() => ({ updateItemAction: vi.fn() }));
vi.mock("@/app/actions/items", () => ({ updateItemAction }));

const EPIC: RoadmapSource = {
  id: "e1",
  key: "CASS-2",
  title: "Moteur",
  type: "epic",
  parentId: null,
  category: "todo",
  start: "2026-10-01",
  due: "2026-10-10",
  closedAt: null,
  sprintId: null,
};

type Result = { ok: true; item: object } | { ok: false; error: string };

/** Each call waits until the test answers it. */
function controlledSaves() {
  const answers: Array<(result: Result) => void> = [];
  updateItemAction.mockImplementation(
    () => new Promise<Result>((resolve) => answers.push(resolve)),
  );
  return async (index: number, result: Result) => {
    await act(async () => answers[index]!(result));
  };
}

function setup(items: RoadmapSource[] = [EPIC]) {
  const announce = vi.fn();
  const hook = renderHook(({ items }) => useRoadmapEdits("CASS", items, announce), {
    initialProps: { items },
  });
  const days = () => {
    const item = hook.result.current.effectiveItems[0]!;
    return [item.start, item.due];
  };
  const save = (start: string, end: string) =>
    act(() => hook.result.current.save(EPIC, { start, end }, `du ${start} au ${end}`));
  return { hook, days, save, announce };
}

const OK: Result = { ok: true, item: {} };
const REFUSED: Result = { ok: false, error: "Mise à jour impossible." };

describe("useRoadmapEdits", () => {
  beforeEach(() => {
    updateItemAction.mockReset();
  });

  it("shows the new days at once and announces the save", async () => {
    const answer = controlledSaves();
    const { days, save, announce } = setup();
    save("2026-10-05", "2026-10-14");
    expect(days()).toEqual(["2026-10-05", "2026-10-14"]);
    expect(updateItemAction).toHaveBeenCalledWith({
      id: "e1",
      backlogKey: "CASS",
      startDate: "2026-10-05",
      dueDate: "2026-10-14",
    });
    await answer(0, OK);
    expect(announce).toHaveBeenCalledWith("CASS-2 planifié du 2026-10-05 au 2026-10-14.");
  });

  it("goes back to the server's days when the first save fails", async () => {
    const answer = controlledSaves();
    const { days, save } = setup();
    save("2026-10-05", "2026-10-14");
    await answer(0, REFUSED);
    expect(days()).toEqual(["2026-10-01", "2026-10-10"]);
  });

  it("goes back to the last saved days, not the stale render, when a later save fails", async () => {
    const answer = controlledSaves();
    const { days, save } = setup();
    save("2026-10-05", "2026-10-14");
    await answer(0, OK);
    save("2026-10-07", "2026-10-16");
    await answer(1, REFUSED);
    expect(days()).toEqual(["2026-10-05", "2026-10-14"]);
  });

  it("keeps a success that lands while a later save is pending", async () => {
    const answer = controlledSaves();
    const { days, save } = setup();
    save("2026-10-05", "2026-10-14");
    save("2026-10-07", "2026-10-16");
    await answer(0, OK);
    expect(days()).toEqual(["2026-10-07", "2026-10-16"]);
    await answer(1, REFUSED);
    expect(days()).toEqual(["2026-10-05", "2026-10-14"]);
  });

  it("falls back to a newer server render rather than an older confirmed save", async () => {
    const answer = controlledSaves();
    const { hook, days, save } = setup();
    save("2026-10-05", "2026-10-14");
    await answer(0, OK);
    save("2026-10-07", "2026-10-16");
    hook.rerender({ items: [{ ...EPIC, start: "2026-10-05", due: "2026-10-14" }] });
    // Someone else moves it while the second save is pending.
    hook.rerender({ items: [{ ...EPIC, start: "2026-11-01", due: "2026-11-05" }] });
    expect(days()).toEqual(["2026-10-07", "2026-10-16"]);
    await answer(1, REFUSED);
    expect(days()).toEqual(["2026-11-01", "2026-11-05"]);
  });

  it("gives way to the server's render once saved", async () => {
    const answer = controlledSaves();
    const { hook, days, save } = setup();
    save("2026-10-05", "2026-10-14");
    await answer(0, OK);
    hook.rerender({ items: [{ ...EPIC, start: "2026-10-05", due: "2026-10-14" }] });
    // Someone else then moves it: the server's days show.
    hook.rerender({ items: [{ ...EPIC, start: "2026-11-01", due: "2026-11-05" }] });
    expect(days()).toEqual(["2026-11-01", "2026-11-05"]);
  });

  it("keeps a pending edit over a render that predates it", async () => {
    controlledSaves();
    const { hook, days, save } = setup();
    save("2026-10-05", "2026-10-14");
    hook.rerender({ items: [{ ...EPIC }] });
    expect(days()).toEqual(["2026-10-05", "2026-10-14"]);
  });
});
