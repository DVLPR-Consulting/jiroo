import "@testing-library/jest-dom/vitest";

// ProseMirror (Tiptap editors) measures DOM ranges for selection and
// scrolling; jsdom has no layout, so give it empty geometry.
if (typeof Range !== "undefined") {
  const emptyRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}),
  }) as DOMRect;
  Range.prototype.getBoundingClientRect ??= emptyRect;
  Range.prototype.getClientRects ??= () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
}
if (typeof document !== "undefined") {
  document.elementFromPoint ??= () => null;
}

// Radix Select tracks the pointer and scrolls the selected option into view;
// jsdom implements neither pointer capture nor scrollIntoView.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
