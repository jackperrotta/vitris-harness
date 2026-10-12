/** The Playwright npm package and the Chromium browser binary are separate installs. */

export async function loadPlaywrightChromium(): Promise<{
  launch: (opts?: { headless?: boolean }) => Promise<any>;
  executablePath?: () => string;
}> {
  let imported: any;
  try {
    imported = await import("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" || /Cannot find package ['"]playwright['"]/.test(message);
    if (missing) {
      throw new Error("The playwright npm package is not installed. @vitris/harness depends on it for browser capture. Reinstall the package so its dependencies are installed. Browser binaries are separate: after the package is present, run `npx playwright install chromium`.");
    }
    throw error;
  }
  const chromium = imported.chromium || imported.default?.chromium;
  if (!chromium?.launch) {
    throw new Error("The installed playwright package did not export chromium. Reinstall playwright, then run `npx playwright install chromium`.");
  }
  return chromium;
}

export function explainBrowserLaunchFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/executable doesn't exist|browserType\.launch|npx playwright install|Failed to launch/i.test(message)) {
    return `Playwright is installed, but the Chromium browser binary is not provisioned. Run: npx playwright install chromium\n${message}`;
  }
  return message;
}
