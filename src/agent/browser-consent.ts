import type { Page } from "playwright";

/** Seed a returning visitor; keep synthetic analytics inside the test browser. */
export async function prepareConsentCheck(page: Page, origin: string): Promise<void> {
  await page.route("**/api/t*", route => route.fulfill({ status: 204, body: "" }));
  await page.context().addCookies([
    { name: "vitris_cc", value: "1", url: origin },
    { name: "vitris_vid", value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: origin },
  ]);
  await page.addInitScript(`(() => {
    const ids = new Set();
    const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window);
    window.setInterval = (...args) => { const id = start(...args); if (args[1] === 15000) ids.add(id); return id; };
    window.clearInterval = id => { ids.delete(id); return stop(id); };
    window.__vitrisConsentTimers = () => ids.size;
  })()`);
}

/** Exercise both generated controls with saved preferences, including reloads. */
export async function verifyConsentControls(page: Page): Promise<{ passed: boolean; failures: string[] }> {
  const failures: string[] = [];
  try {
    await page.getByRole("button", { name: "Reject analytics cookies", exact: true }).click({ timeout: 3000 });
    await page.waitForFunction("document.cookie.includes('vitris_cc=0')", undefined, { timeout: 3000 });
    if ((await page.context().cookies()).some(c => c.name === "vitris_vid")) failures.push("Consent rejection did not clear visitor cookie");
    if (await page.evaluate("window.__vitrisConsentTimers()") !== 0) failures.push("Consent rejection did not stop live ping timer");
    await page.reload({ waitUntil: "load" });
    if ((await page.context().cookies()).find(c => c.name === "vitris_cc")?.value !== "0") failures.push("Consent rejection did not survive reload");
    if (await page.evaluate("window.__vitrisConsentTimers()") !== 0) failures.push("Live ping timer restarted after rejected preference reload");
    await page.getByRole("button", { name: "Accept analytics cookies", exact: true }).click({ timeout: 3000 });
    await page.waitForFunction("document.cookie.includes('vitris_cc=1')", undefined, { timeout: 3000 });
    if (!(await page.context().cookies()).find(c => c.name === "vitris_vid")?.value) failures.push("Consent acceptance did not create visitor cookie");
    await page.reload({ waitUntil: "load" });
    if ((await page.context().cookies()).find(c => c.name === "vitris_cc")?.value !== "1") failures.push("Consent acceptance did not survive reload");
  } catch (error) { failures.push(`Consent controls: ${error instanceof Error ? error.message : String(error)}`); }
  return { passed: failures.length === 0, failures };
}
