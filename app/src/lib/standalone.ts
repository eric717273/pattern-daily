/** True when running as an installed app (home-screen PWA / Dock app). */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // matchMedia unavailable
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
