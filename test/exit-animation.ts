import { vi } from "vitest";

/**
 * jsdom reports no CSS animations, so Radix Presence unmounts a closing
 * dialog at once and its exit-animation frame can never be observed. This
 * stub gives every element carrying `data-state` an animation name that
 * changes between open and closed, so Presence keeps the closed content
 * mounted as it would during the real exit animation. Returns a restore.
 */
export function simulateExitAnimations(): () => void {
  const original = window.getComputedStyle.bind(window);
  const spy = vi
    .spyOn(window, "getComputedStyle")
    .mockImplementation((element, pseudo) => {
      const styles = original(element, pseudo);
      return new Proxy(styles, {
        get(target, property) {
          if (property === "animationName") {
            const state = element.getAttribute("data-state");
            if (state === "open") return "enter";
            if (state === "closed") return "exit";
            return "none";
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
  return () => spy.mockRestore();
}
