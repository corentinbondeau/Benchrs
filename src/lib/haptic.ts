export function haptic(duration = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

export function hapticSuccess() {
  haptic(15);
}
