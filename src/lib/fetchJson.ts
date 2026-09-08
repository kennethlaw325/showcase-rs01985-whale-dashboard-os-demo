let refreshRevision = 0;
const lastSuccessfulData = new Map<string, unknown>();

export function beginJsonRefresh(): void {
  refreshRevision += 1;
}

function cacheKeyFor(path: string): string {
  return path.split("?")[0];
}

function freshPathFor(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}runtime-refresh=${refreshRevision}`;
}

export async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  const cacheKey = cacheKeyFor(path);
  try {
    const res = await fetch(freshPathFor(path), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    lastSuccessfulData.set(cacheKey, data);
    return data;
  } catch (error) {
    console.warn(`[vault data] Failed to refresh ${path}; keeping the last successful data.`, error);
    return (lastSuccessfulData.get(cacheKey) as T | undefined) ?? fallback;
  }
}
