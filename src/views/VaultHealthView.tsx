import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";
import type { VaultHealth } from "../lib/types";

const EMPTY: VaultHealth = {
  inboxCount: 0,
  orphanCount: 0,
  recentAtomNotes: [],
  lastSyncedAt: ""
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-ink mt-1">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

export default function VaultHealthView() {
  const [data, setData] = useState<VaultHealth | null>(null);

  useEffect(() => {
    fetchJson<VaultHealth>("data/vault-health.json", EMPTY).then(setData);
  }, []);

  if (!data) return <div className="text-muted text-sm">Loading…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vault 狀態</h1>
      <p className="text-muted text-sm mb-6">
        DEMO-AI 唯讀快照 · last sync {data.lastSyncedAt || "—"}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Stat label="Inbox" value={data.inboxCount} hint="100_Todo/_inbox 未分類筆記" />
        <Stat label="Orphan" value={data.orphanCount} hint="無 wikilink 入嚟" />
      </div>

      <h2 className="text-lg font-bold mb-3">最新知識筆記</h2>
      {data.recentAtomNotes.length === 0 ? (
        <p className="text-muted text-sm">冇最近筆記。</p>
      ) : (
        <ul className="space-y-2">
          {data.recentAtomNotes.map((n) => (
            <li
              key={n.path}
              className="bg-panel border border-line rounded-xl p-3 flex items-center gap-3"
            >
              <span className="text-xs text-muted font-mono">{n.date}</span>
              <span className="text-sm">{n.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
