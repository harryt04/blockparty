export const PWA_DISMISSAL_KEY = "blockparty.pwa-install-dismissed.v1";

export function isIosDevice(userAgent: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}

export function shouldShowInstallPrompt({
  engaged,
  dismissed,
  installed,
  canPrompt,
  isIos,
}: {
  engaged: boolean;
  dismissed: boolean;
  installed: boolean;
  canPrompt: boolean;
  isIos: boolean;
}): boolean {
  return engaged && !dismissed && !installed && (canPrompt || isIos);
}

export function networkStatusMessage(online: boolean): string | undefined {
  return online ? undefined : "Offline. Live play requires reconnection.";
}
