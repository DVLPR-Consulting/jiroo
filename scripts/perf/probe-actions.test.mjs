// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readActionIds, buildActionRequest, buildMoveInput, validateAction } from "./probe-actions.mjs";
const names = ["createItemAction", "updateItemAction", "moveItemAction"];
const ids = Object.fromEntries(names.map((name, i) => [name, "40" + String(i + 1).repeat(40)]));
const manifest = () => ({ node: Object.fromEntries(names.map((name) => [ids[name], { filename: "app/actions/items.ts", exportedName: name, workers: { "app/(app)/b/[key]/page": { moduleId: 42 } } }])) });

describe("serial Board action probe", () => {
  it("reads only the three Board exports from the built Node action manifest and fails closed", () => {
    expect(readActionIds(manifest())).toEqual(ids);
    const missing = manifest(); delete missing.node[ids.moveItemAction];
    expect(() => readActionIds(missing)).toThrow(/moveItemAction/);
    const foreign = manifest(); foreign.node[ids.createItemAction].filename = "app/actions/other.ts";
    expect(() => readActionIds(foreign)).toThrow(/createItemAction/);
    const notBoard = manifest(); notBoard.node[ids.updateItemAction].workers = { "app/other/page": {} };
    expect(() => readActionIds(notBoard)).toThrow(/updateItemAction/);
    const duplicate = manifest(); duplicate.node["40" + "a".repeat(40)] = duplicate.node[ids.moveItemAction];
    expect(() => readActionIds(duplicate)).toThrow(/moveItemAction/);
  });
  it("builds a browser-shaped action POST retaining the captured router state and undefined omission", () => {
    const tree = encodeURIComponent(JSON.stringify(["", { children: ["(app)", {}] }]));
    const input = { id: "item", statusId: "done", beforeId: null, afterId: undefined };
    const request = buildActionRequest("http://127.0.0.1:3442", "PERFA", ids.moveItemAction, input, tree);
    expect(request.url).toBe("http://127.0.0.1:3442/b/PERFA?view=board");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ Origin: "http://127.0.0.1:3442", Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8", "Next-Action": ids.moveItemAction, "Next-Router-State-Tree": tree });
    expect(JSON.parse(request.body)).toEqual([{ id: "item", statusId: "done", beforeId: null }]);
    expect(Object.keys(request.headers).join(" ")).not.toMatch(/skip|cookie/i);
    expect(() => buildActionRequest("http://127.0.0.1:3442", "PERFA", ids.moveItemAction, input, "bad-tree")).toThrow(/router/i);
  });
  it("validates the action result addressed by the Flight root, not a successful-looking RSC row", () => {
    const item = { id: "item-1", key: "PERFA-3", statusId: "doing", backlogId: "backlog-1", type: "tache" };
    const root = '0:{"a":"$@1","f":[]}\n';
    const success = `1:${JSON.stringify({ ok: true, item })}\n`;
    expect(validateAction(':HL["/style.css","style"]\n' + root + success, { id: "item-1", statusId: "doing", backlogId: "backlog-1" })).toEqual(item);
    // Length-delimited Flight text may contain convincing fake model rows.
    const raw = '\n1:{"ok":true,"item":{}}\né';
    const text = `2:T${Buffer.byteLength(raw).toString(16)},${raw}`;
    expect(validateAction(root + text + success, { id: "item-1" })).toEqual(item);
    for (const bad of [root + '1:{"ok":false,"error":"Denied"}\n' + '3:{"ok":true}\n', root + '1:E{"digest":"error"}\n', '0:{"f":[]}\n' + success, root + '1:{"ok":true}\n', root + text]) {
      expect(() => validateAction(bad, {})).toThrow(/action/i);
    }
    expect(() => validateAction(root + success, { statusId: "done" })).toThrow(/action/i);
    expect(() => validateAction(root + success, { id: "other" })).toThrow(/action/i);
    expect(() => validateAction(root + success, { backlogId: "other" })).toThrow(/action/i);
  });
  it("builds a populated-column append with a real neighbor, never the empty-column fallback", () => {
    expect(buildMoveInput("PERFA", {id:"moving"}, "done", "last-done")).toEqual({backlogKey:"PERFA",id:"moving",statusId:"done",beforeId:"last-done",afterId:null});
    expect(() => buildMoveInput("PERFA", {id:"moving"}, "done", null)).toThrow(/neighbor/i);
  });
  it("never treats byte-framed Blob content as a successful model for a failed action", () => {
    const raw=Buffer.concat([Buffer.from([255]),Buffer.from('\n1:{"ok":true,"item":{"id":"fake","key":"PERFA-1"}}\n')]);
    const body=Buffer.concat([Buffer.from('0:{"a":"$@1","f":[]}\n2:b'+raw.length.toString(16)+','),raw,Buffer.from('1:E{"digest":"failure"}\n')]);
    expect(() => validateAction(body, {})).toThrow(/action/i);
  });

});
