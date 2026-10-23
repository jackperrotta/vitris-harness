/** Keep the outer release processes alive for the full, unchanged browser suite. */
export function browserVerificationTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VITRIS_BROWSER_TIMEOUT_MS;
  const value = raw === undefined || raw === '' ? 3_600_000 : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 86_400_000) {
    throw new Error('VITRIS_BROWSER_TIMEOUT_MS must be an integer between 1000 and 86400000 milliseconds');
  }
  return value;
}

/** Allow the child browser process to finish and seal its evidence first. */
export function productionPreflightTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return browserVerificationTimeoutMs(env) + 60_000;
}
