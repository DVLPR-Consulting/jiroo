import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemRowIconProvider } from "./item-row-icons";
import { ItemRow, RowSelectCheckbox } from "./item-row";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

describe("ItemRow response budget", () => {
  it("keeps a representative editable row below 3.5 KB, including selection and optional pills", () => {
    const row = (
      <ItemRow
        item={{
          id: "task-1", key: "PERFA-3", type: "tache", kind: "bug",
          title: "Recherche, sécurité et traitement des dossiers", priority: 2,
          statusId: "doing", estimatePoints: 3, assigneeId: "u-1",
          assigneeName: "Performance member 01",
          parent: { key: "PERFA-2", title: "Traitement des dossiers", type: "epic" },
        }}
        editing={{
          backlogKey: "PERFA", canEdit: true, canTransition: true, canAssign: true,
          statuses: [{ id: "doing", name: "En cours", color: "#d99a2b", category: "in_progress", order: 1 }],
          users: [{ id: "u-1", name: "Performance member 01" }],
        }}
        onOpen={() => undefined}
        leading={<RowSelectCheckbox itemKey="PERFA-3" checked={false} onToggle={() => undefined} />}
      />
    );
    const html = renderToString(<ItemRowIconProvider>{Array.from({ length: 100 }, (_, i) => <div key={i}>{row}</div>)}</ItemRowIconProvider>);
    // Decoded HTML, as counted by the production HTTP probe; not gzip bytes.
    expect(new TextEncoder().encode(html).length / 100).toBeLessThan(3500);
  });
});
