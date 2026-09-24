export function reloadAfterSave(delayMs = 1000) {
  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
}