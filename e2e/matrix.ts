export type MatrixOptions = { textZoom: boolean };

export type MatrixProject = {
  name: string;
  device: "Desktop Chrome" | "Desktop Firefox" | "Desktop Safari";
  viewport: { width: number; height: number };
  testMatch?: readonly string[];
  use?: MatrixOptions;
};

/** P2, P3, P4 and P6: the width-sensitive paths, shared by every narrow project. */
export const MATRIX_WIDTH_TEST_MATCH: readonly string[] = [
  "board-added-column", "board-empty-columns", "keyboard-shortcuts", "backlog-redesign",
  "backlog-ranking", "list-rows", "sprint-filter", "create-under-version-filter",
  "create-everywhere", "new-item-missing-parent", "new-item-required-parent",
  "item-detail-drawer", "ticket-drawer", "markdown-editor", "item-templates",
  "shell-redesign", "mobile-shell", "help-guide", "overlay-animations", "loading-skeletons", "realtime",
].map((name) => `**/${name}.spec.ts`);

export const MATRIX_PROJECTS: readonly MatrixProject[] = [
  { name: "matrix-chromium", device: "Desktop Chrome", viewport: { width: 1440, height: 900 } },
  { name: "matrix-firefox", device: "Desktop Firefox", viewport: { width: 1440, height: 900 } },
  { name: "matrix-webkit", device: "Desktop Safari", viewport: { width: 1440, height: 900 } },
  { name: "matrix-chromium-1024", device: "Desktop Chrome", viewport: { width: 1024, height: 768 }, testMatch: MATRIX_WIDTH_TEST_MATCH },
  { name: "matrix-chromium-768", device: "Desktop Chrome", viewport: { width: 768, height: 1024 }, testMatch: MATRIX_WIDTH_TEST_MATCH },
  { name: "matrix-webkit-768", device: "Desktop Safari", viewport: { width: 768, height: 1024 }, testMatch: MATRIX_WIDTH_TEST_MATCH },
  { name: "matrix-zoom-chromium", device: "Desktop Chrome", viewport: { width: 720, height: 450 }, testMatch: ["**/matrix/zoom.spec.ts"], use: { textZoom: true } },
  { name: "matrix-zoom-firefox", device: "Desktop Firefox", viewport: { width: 720, height: 450 }, testMatch: ["**/matrix/zoom.spec.ts"], use: { textZoom: true } },
  { name: "matrix-zoom-webkit", device: "Desktop Safari", viewport: { width: 720, height: 450 }, testMatch: ["**/matrix/zoom.spec.ts"], use: { textZoom: true } },
  { name: "matrix-drops", device: "Desktop Chrome", viewport: { width: 1200, height: 800 }, testMatch: ["**/matrix/drops.spec.ts"] },
];
