export type PendingKind = "todo" | "review" | "topic" | "relay";

export interface PendingPayload {
  kind: PendingKind;
  target: string;
  preview: string;
}

export interface PendingResponse {
  createdAt: string;
  relativePath: string;
}

export async function createPending(payload: PendingPayload): Promise<PendingResponse> {
  const response = await fetch("/api/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => ({}))) as PendingResponse & { error?: string };
  if (!response.ok) throw new Error(body.error || "未能建立 pending 檔。");
  return body;
}

export interface PendingItem { file: string; kind: string; target: string; createdAt: string; rejectedReason: string; rejectedAt: string; preview: string; modifiedAt: number; }

async function pendingRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/pending", init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "未能處理 pending 檔。");
  return body;
}

export function listPending() { return pendingRequest<PendingItem[]>(); }
export function rejectPending(file: string, rejectedReason: string) {
  return pendingRequest<PendingItem>({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, rejectedReason }) });
}
