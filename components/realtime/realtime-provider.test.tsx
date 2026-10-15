import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealtimeProvider,
  backlogKeyFromPath,
  useRealtime,
  type RealtimeListener,
} from "@/components/realtime/realtime-provider";

const mocks = vi.hoisted(() => ({
  pathname: "/b/CASS",
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  send(event: object | string) {
    act(() => this.onmessage?.({ data: typeof event === "string" ? event : JSON.stringify(event) }));
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("no EventSource");
  return source;
}

function Listener({ onEvents }: { onEvents: RealtimeListener }) {
  useRealtime(onEvents);
  return null;
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("RealtimeProvider", () => {
  let onEvents: ReturnType<typeof vi.fn<RealtimeListener>>;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    mocks.pathname = "/b/CASS";
    mocks.refresh.mockReset();
    onEvents = vi.fn<RealtimeListener>();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderProvider() {
    return render(
      <RealtimeProvider>
        <Listener onEvents={onEvents} />
      </RealtimeProvider>,
    );
  }

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  }

  it("opens one stream for the backlog in the URL", () => {
    renderProvider();
    expect(FakeEventSource.instances.map((source) => source.url)).toEqual([
      "/api/realtime?backlog=CASS",
    ]);
  });

  it("listens only to notifications outside a backlog", () => {
    mocks.pathname = "/mine";
    renderProvider();
    expect(latestSource().url).toBe("/api/realtime");
  });

  it("batches events and ignores malformed ones", async () => {
    renderProvider();
    latestSource().send({ kind: "item", itemIds: ["a"], self: true });
    latestSource().send("{oops");
    latestSource().send({ kind: "comment", self: false });
    latestSource().send({ kind: "notification", self: false });
    expect(onEvents).not.toHaveBeenCalled();

    await flush();
    expect(onEvents).toHaveBeenCalledOnce();
    expect(onEvents).toHaveBeenCalledWith([
      { kind: "item", itemIds: ["a"], self: true },
      { kind: "notification", self: false },
    ]);
  });

  it("offers a refresh when someone else changed the backlog", async () => {
    renderProvider();
    latestSource().send({ kind: "sprint", self: false });
    await flush();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Ce backlog a été modifié par quelqu'un d'autre.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays quiet for my own changes and my notifications", async () => {
    renderProvider();
    latestSource().send({ kind: "item", self: true });
    latestSource().send({ kind: "notification", self: false });
    await flush();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can dismiss the banner without refreshing", async () => {
    renderProvider();
    latestSource().send({ kind: "item", self: false });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Masquer" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("passes the stream's ready on quietly, without a banner", async () => {
    renderProvider();
    latestSource().send({ kind: "ready", self: false });
    await flush();
    expect(onEvents).toHaveBeenCalledWith([{ kind: "ready", self: false }]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the banner after a resync", async () => {
    renderProvider();
    latestSource().send({ kind: "resync", self: false });
    await flush();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("drops the stream of a tab hidden for a minute and reopens it on return", async () => {
    renderProvider();
    const first = latestSource();

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    setVisibility("visible");
    expect(first.closed).toBe(false);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(first.closed).toBe(true);

    setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("closes the stream on unmount", () => {
    const { unmount } = renderProvider();
    unmount();
    expect(latestSource().closed).toBe(true);
  });
});

describe("backlogKeyFromPath", () => {
  it.each([
    ["/b/CASS", "CASS"],
    ["/b/CASS/reports", "CASS"],
    ["/mine", null],
    [null, null],
  ])("%s → %s", (pathname, key) => {
    expect(backlogKeyFromPath(pathname)).toBe(key);
  });
});
