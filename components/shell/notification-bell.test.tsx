import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { NotificationBell } from "@/components/shell/notification-bell";
import {
  useViewUrlState,
  ViewUrlStateProvider,
} from "@/components/shell/view-url-state";
import type { ViewState } from "@/lib/items/filter";
import type { NotificationRow } from "@/lib/services/notifications";

const mocks = vi.hoisted(() => ({
  pathname: "/b/DEMO",
  params: { key: "DEMO" } as { key?: string },
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  markReadAction: vi.fn(),
  markAllReadAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/actions/notifications", () => ({
  markReadAction: mocks.markReadAction,
  markAllReadAction: mocks.markAllReadAction,
}));

const emptyState: ViewState = {
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    releaseIds: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

const demoNotification: NotificationRow = {
  id: "notification-demo-1",
  type: "mention",
  read: false,
  createdAt: new Date("2026-08-04T10:00:00.000Z"),
  itemKey: "DEMO-1",
  itemTitle: "Corriger les notifications",
  backlogKey: "demo",
  actorName: "Marie",
  snippet: "Merci de vérifier ce cas.",
};

const initialEntries: [string, string][] = [
  ["view", "board"],
  ["v", "saved"],
  ["group", "component"],
  ["type", "tache"],
  ["tag", "a"],
  ["tag", "b"],
];

function NavigationProbe() {
  const viewUrl = useViewUrlState();
  return (
    <>
      <button
        type="button"
        onClick={() => viewUrl.push((params) => params.set("item", "DEMO-1"))}
      >
        Open old item
      </button>
      <button
        type="button"
        onClick={() => viewUrl.push((params) => params.set("item", "DEMO-2"))}
      >
        Open new item
      </button>
    </>
  );
}

function NotificationSubject({
  notification = demoNotification,
  withFilter = false,
  withProbe = false,
}: {
  notification?: NotificationRow;
  withFilter?: boolean;
  withProbe?: boolean;
} = {}) {
  return (
    <ViewUrlStateProvider initialEntries={initialEntries}>
      {withFilter && (
        <FilterBar
          state={emptyState}
          statuses={[]}
          users={[]}
          labels={[]}
          releases={[]}
          hierarchy={[]}
          resultCount={1}
        />
      )}
      {withProbe && <NavigationProbe />}
      <NotificationBell notifications={[notification]} unreadCount={1} />
    </ViewUrlStateProvider>
  );
}

function renderSubject(
  options: Parameters<typeof NotificationSubject>[0] = {},
) {
  return render(<NotificationSubject {...options} />);
}

async function selectNotification(itemKey = "DEMO-1") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  await user.click(screen.getByRole("menuitem", { name: new RegExp(itemKey) }));
  await act(async () => Promise.resolve());
}

describe("NotificationBell item navigation", () => {
  beforeEach(() => {
    mocks.pathname = "/b/DEMO";
    mocks.params = { key: "DEMO" };
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.markReadAction.mockReset();
    mocks.markReadAction.mockResolvedValue({ ok: true });
    mocks.markAllReadAction.mockReset();
    mocks.markAllReadAction.mockResolvedValue({ ok: true });
  });

  it("composes same-backlog selection with current state, repeats, and an armed q", async () => {
    let runPendingQuery: (() => void) | undefined;
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      renderSubject({ withFilter: true });
      timeoutSpy.mockImplementationOnce((handler) => {
        runPendingQuery = () => {
          if (typeof handler === "function") handler();
        };
        return 1 as unknown as ReturnType<typeof setTimeout>;
      });
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "urgent" },
      });

      expect(timeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 300);
      await selectNotification();

      expect(mocks.markReadAction).toHaveBeenCalledWith({
        id: "notification-demo-1",
      });
      expect(mocks.push).toHaveBeenLastCalledWith(
        "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1",
      );

      await act(async () => {
        runPendingQuery?.();
      });
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1&q=urgent",
        { scroll: false },
      );
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("reopens a previously tombstoned item through the provider", async () => {
    renderSubject({ withProbe: true });
    fireEvent.click(screen.getByRole("button", { name: "Open old item" }));
    fireEvent.click(screen.getByRole("button", { name: "Open new item" }));

    await selectNotification();

    expect(mocks.push).toHaveBeenLastCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1",
    );
    expect(mocks.push).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: "another backlog",
      pathname: "/b/DEMO",
      params: { key: "DEMO" },
      notification: {
        ...demoNotification,
        backlogKey: "OTHER",
        itemKey: "OTHER-1",
      },
      expected: "/b/OTHER?item=OTHER-1",
    },
    {
      name: "the mine route",
      pathname: "/mine",
      params: { key: "DEMO" },
      notification: demoNotification,
      expected: "/b/demo?item=DEMO-1",
    },
    {
      name: "a stale route param",
      pathname: "/b/DEMO",
      params: { key: "OTHER" },
      notification: demoNotification,
      expected: "/b/demo?item=DEMO-1",
    },
    {
      name: "a nested backlog path",
      pathname: "/b/DEMO/items",
      params: { key: "DEMO" },
      notification: demoNotification,
      expected: "/b/demo?item=DEMO-1",
    },
  ])(
    "uses direct navigation from $name",
    async ({ pathname, params, notification, expected }) => {
      mocks.pathname = pathname;
      mocks.params = params;
      renderSubject({ notification });

      await selectNotification(notification.itemKey!);

      expect(mocks.markReadAction).toHaveBeenCalledWith({ id: notification.id });
      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith(expected);
    },
  );

  it("waits for mark-read before navigating", async () => {
    let finishMarkRead: ((value: { ok: true }) => void) | undefined;
    mocks.markReadAction.mockReturnValueOnce(
      new Promise((resolve) => {
        finishMarkRead = resolve;
      }),
    );
    const rendered = renderSubject();

    const selecting = selectNotification();
    await waitFor(() => expect(mocks.markReadAction).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();

    rendered.rerender(<NotificationSubject />);
    await act(async () => finishMarkRead?.({ ok: true }));
    await selecting;
    expect(mocks.push).toHaveBeenCalledWith(
      "/b/DEMO?view=board&v=saved&group=component&type=tache&tag=a&tag=b&item=DEMO-1",
    );
  });

  it.each([
    {
      name: "mine",
      pathname: "/mine",
      params: {},
    },
    {
      name: "another backlog",
      pathname: "/b/OTHER",
      params: { key: "OTHER" },
    },
  ])(
    "uses direct navigation when the committed route changes to $name while mark-read is pending",
    async ({ pathname, params }) => {
      let finishMarkRead: ((value: { ok: true }) => void) | undefined;
      mocks.markReadAction.mockReturnValueOnce(
        new Promise((resolve) => {
          finishMarkRead = resolve;
        }),
      );
      const rendered = renderSubject();

      const selecting = selectNotification();
      await waitFor(() => expect(mocks.markReadAction).toHaveBeenCalled());
      mocks.pathname = pathname;
      mocks.params = params;
      rendered.rerender(<NotificationSubject />);

      await act(async () => finishMarkRead?.({ ok: true }));
      await selecting;
      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/b/demo?item=DEMO-1");
    },
  );

  it("refreshes after marking a notification without an item", async () => {
    renderSubject({
      notification: {
        ...demoNotification,
        itemKey: null,
        backlogKey: null,
      },
    });

    await selectNotification("un item");

    expect(mocks.markReadAction).toHaveBeenCalledWith({
      id: "notification-demo-1",
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
