export type Readiness = "record" | "ready" | "committed";

export interface ReadinessBadge { state: Readiness; label: string; inferred: boolean; }

const DEADLINE_RE = /(?:\b20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b|\b\d{1,2}[-/.]\d{1,2}\b|\b(?:明日|今日|下週|本週|週[一二三四五六日]|星期[一二三四五六日]|月底|死線|deadline|due)\b)/i;
const OWNER_RE = /(?:owner|負責|[A-Z][a-z]+\s*(?:跟進|處理|交付|審批))/;
const NEXT_STEP_RE = /(?:next[ -]?step|下一步|跟進|安排|聯絡|起草|準備|處理|執行|提交|review)/i;

export function deriveReadiness(input: object): ReadinessBadge {
  const fields = input as Record<string, unknown>;
  const taskStatus = typeof fields.status === "string" ? fields.status.trim().toLowerCase() : "";
  if (["doing", "done", "已完成", "進行中"].includes(taskStatus)) return { state: "committed", label: "已承諾", inferred: false };
  if (["todo", "待處理"].includes(taskStatus)) return { state: "ready", label: "夠料可啟動", inferred: false };
  const explicit = [fields.readiness, fields.commitment, fields.committed, fields.status].find((value) => typeof value === "string" && /^(record|ready|committed|只記錄|夠料可啟動|已承諾)$/.test(value.trim())) as string | undefined;
  if (explicit) {
    const state = explicit === "committed" || explicit === "已承諾" ? "committed" : explicit === "ready" || explicit === "夠料可啟動" ? "ready" : "record";
    return { state, label: state === "committed" ? "已承諾" : state === "ready" ? "夠料可啟動" : "只記錄", inferred: false };
  }
  const text = Object.values(fields).filter((value) => typeof value === "string").join(" ");
  const state: Readiness = DEADLINE_RE.test(text) || OWNER_RE.test(text) ? "committed" : NEXT_STEP_RE.test(text) ? "ready" : "record";
  return { state, label: state === "committed" ? "已承諾" : state === "ready" ? "夠料可啟動" : "只記錄", inferred: true };
}
