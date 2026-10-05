import { auth } from "@/lib/auth";

const ORIGIN = "http://localhost:3000";

/**
 * Minimal browser stand-in for DB integration tests: drives Better Auth's real
 * HTTP router (`auth.handler`, rate limiting and plugin hooks included) and
 * keeps the cookies it sets, like one device would.
 */
export class BetterAuthDevice {
  private readonly cookies = new Map<string, string>();

  async post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
    return this.request("POST", path, body);
  }

  async get(path: string): Promise<{ status: number; json: unknown }> {
    return this.request("GET", path);
  }

  cookieNames(): string[] {
    return [...this.cookies.keys()];
  }

  /** Copies one cookie (e.g. the trust-device cookie) from another device. */
  adoptCookie(from: BetterAuthDevice, nameFragment: string): void {
    for (const [name, value] of from.cookies) {
      if (name.includes(nameFragment)) this.cookies.set(name, value);
    }
  }

  private async request(method: string, path: string, body?: unknown) {
    const headers = new Headers({ origin: ORIGIN });
    if (body !== undefined) headers.set("content-type", "application/json");
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = setCookie.split(";");
      const separator = pair!.indexOf("=");
      const name = pair!.slice(0, separator).trim();
      const value = pair!.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/iu.test(attribute));
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, json };
  }
}
