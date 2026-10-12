export function resolveStockValue(value: unknown, kernelOrigin: string): unknown {
  const origin = kernelOrigin.replace(/\/$/, "");
  if (typeof value === "string") {
    return value.startsWith("/stock/") ? `${origin}${value}` : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveStockValue(item, origin));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveStockValue(nested, origin);
    }
    return out;
  }
  return value;
}
