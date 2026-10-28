/** Serializable init script: the HTML root can still be absent at document creation. */
export function installTextZoom(): void {
  function apply() {
    if (!document.documentElement) return false;
    document.documentElement.style.fontSize = "200%";
    return true;
  }
  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(document, { childList: true });
}
