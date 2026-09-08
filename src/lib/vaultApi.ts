type ApiFailure = Error & { status?: number };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(body.error || "本機儲存操作失敗。") as ApiFailure;
    error.status = response.status;
    throw error;
  }
  return body;
}

export interface SkillDocument { sourcePath: string; content: string; modifiedAt: number; }
export interface CaptureResult { duplicate: boolean; relativePath: string; }

export function loadSkill(sourcePath: string) {
  return request<SkillDocument>(`/api/library/skill?path=${encodeURIComponent(sourcePath)}`);
}

export function saveSkill(document: SkillDocument) {
  return request<SkillDocument>("/api/library/skill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(document) });
}

export function captureRss(item: { title: string; url: string; summary: string; reportDate: string; tryAction?: string; reviewBy?: string }) {
  return request<CaptureResult>("/api/rss/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
}
