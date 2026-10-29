import type { Page, Request } from "@playwright/test";
import { classifyRequestFailure } from "./evidence";

export type CaptureFault = { kind: "console" | "page" | "request" | "http"; line: string; page: Page };
export type PageCapture = { console: string[]; network: string[]; onFault: (fault: CaptureFault) => void };

/** Record every failure; only the shared evidence policy can make it diagnostic. */
export function observePage(page: Page, capture: PageCapture, actor: string): void {
  const responseStatuses = new WeakMap<Request, number>();
  const fault = (kind: CaptureFault["kind"], line: string) => capture.onFault({ kind, line, page });
  page.on("console", (message) => {
    const line = `[${actor}] ${message.type()}: ${message.text()}`;
    capture.console.push(line);
    if (message.type() === "error") fault("console", line);
  });
  page.on("pageerror", (error) => {
    const line = `[${actor}] pageerror: ${error.message}`;
    capture.console.push(line);
    fault("page", line);
  });
  page.on("request", (request) => {
    capture.network.push(`[${actor}] request ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    responseStatuses.set(response.request(), response.status());
    const line = `[${actor}] ${response.status()} ${response.request().method()} ${response.url()}`;
    capture.network.push(line);
    if (response.status() >= 400) fault("http", line);
  });
  page.on("requestfailed", (request) => {
    const line = `[${actor}] failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`;
    capture.network.push(line);
    const responseStatus = responseStatuses.get(request);
    const kind = classifyRequestFailure({
      method: request.method(),
      errorText: request.failure()?.errorText,
      nextAction: request.headers()["next-action"],
      rsc: request.headers().rsc,
      responseStatus,
    });
    if (kind === "fault") fault("request", line);
    else {
      const status = kind === "aborted-action" ? ` ${responseStatus}` : "";
      capture.console.push(`[${actor}] [${kind}] ${request.method()} ${new URL(request.url()).pathname}${status}`);
    }
  });
}
