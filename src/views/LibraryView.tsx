import { useEffect, useMemo, useState } from "react";
import { BookMarked, ChevronRight, LibraryBig, Pencil, RefreshCw, Save, Search, Wrench } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import { loadSkill, saveSkill, type SkillDocument } from "../lib/vaultApi";
import type { DepartmentId, PromptLibraryItem, SkillLibraryItem } from "../lib/types";

type Tab = "skills" | "prompts";

const DEPARTMENTS: Array<{ id: "all" | DepartmentId; label: string }> = [
  { id: "all", label: "全部部門" },
  { id: "sales", label: "Sales" },
  { id: "ig-marketing", label: "IG & Marketing" },
  { id: "seo-blog", label: "SEO & Blog" },
  { id: "website-system", label: "Website & System" },
  { id: "production", label: "Production" },
  { id: "internal-audit", label: "Internal Audit" }
];

function DepartmentFilter({ value, onChange }: { value: "all" | DepartmentId; onChange: (value: "all" | DepartmentId) => void }) {
  return <div className="library-filters">{DEPARTMENTS.map((department) => <button key={department.id} type="button" onClick={() => onChange(department.id)} className={value === department.id ? "is-active" : ""}>{department.label}</button>)}</div>;
}

type SkillMetadata = { verifiedAt: string; riskNote: string; lastCheck: string };

function skillMetadata(content: string): SkillMetadata {
  const read = (key: string) => content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "") || "";
  return { verifiedAt: read("verified_at"), riskNote: read("risk_note"), lastCheck: read("last_check") };
}

function withSkillMetadata(content: string, metadata: SkillMetadata) {
  const lines = [
    ["verified_at", metadata.verifiedAt], ["risk_note", metadata.riskNote], ["last_check", metadata.lastCheck]
  ] as const;
  let result = content.startsWith("---\n") ? content : `---\n---\n\n${content}`;
  for (const [key, value] of lines) {
    const line = `${key}: ${JSON.stringify(value.trim())}`;
    result = new RegExp(`^${key}:.*$`, "m").test(result) ? result.replace(new RegExp(`^${key}:.*$`, "m"), line) : result.replace(/^---\n/, `---\n${line}\n`);
  }
  return result;
}

export default function LibraryView() {
  const [tab, setTab] = useState<Tab>("skills");
  const [skills, setSkills] = useState<SkillLibraryItem[]>([]);
  const [prompts, setPrompts] = useState<PromptLibraryItem[]>([]);
  const [department, setDepartment] = useState<"all" | DepartmentId>("all");
  const [query, setQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillLibraryItem | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptLibraryItem | null>(null);

  useEffect(() => {
    fetchJson<SkillLibraryItem[]>("data/skills-library.json", []).then(setSkills);
    fetchJson<PromptLibraryItem[]>("data/prompt-library.json", []).then(setPrompts);
  }, []);

  const items = useMemo(() => {
    const list = tab === "skills" ? skills : prompts;
    const q = query.trim().toLocaleLowerCase();
    return list.filter((item) => (department === "all" || item.department === department) && (!q || JSON.stringify(item).toLocaleLowerCase().includes(q)));
  }, [department, prompts, query, skills, tab]);

  const selected = tab === "skills" ? selectedSkill : selectedPrompt;
  return <div className="library-view">
    <header className="workspace-head">
      <div><span className="eyebrow">WHALE KNOWLEDGE DESK</span><h1>Skills & Prompt Library</h1><p>搵到啱嘅工具先開工。每項都歸屬一位 PM，用小白語言講清楚點用。</p></div>
      <div className="library-count"><strong>{tab === "skills" ? skills.length : prompts.length}</strong><span>{tab === "skills" ? "個 skills" : "個 prompts"}</span></div>
    </header>
    <div className="library-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "skills"} className={tab === "skills" ? "is-active" : ""} onClick={() => { setTab("skills"); setSelectedPrompt(null); }}><Wrench size={16} />Skills</button><button type="button" role="tab" aria-selected={tab === "prompts"} className={tab === "prompts" ? "is-active" : ""} onClick={() => { setTab("prompts"); setSelectedSkill(null); }}><BookMarked size={16} />Prompt Library</button></div>
    <div className="library-toolbar"><label className="library-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "skills" ? "搜尋 skill、用途或部門" : "搜尋 prompt、用途或部門"} /></label><DepartmentFilter value={department} onChange={setDepartment} /></div>
    <div className="library-layout">
      <section className="library-list" aria-label="技能與提示目錄">
        <p className="library-result">找到 <b>{items.length}</b> 項</p>
        {tab === "skills" ? (items as SkillLibraryItem[]).map((item) => <button type="button" key={item.id} onClick={() => setSelectedSkill(item)} className={`library-row ${selectedSkill?.id === item.id ? "is-selected" : ""}`}><div><span className="library-dept">{DEPARTMENTS.find((d) => d.id === item.department)?.label}</span><h2>/{item.name}</h2><p>{item.description || item.what}</p></div><ChevronRight size={17} /></button>) : (items as PromptLibraryItem[]).map((item) => <button type="button" key={item.id} onClick={() => setSelectedPrompt(item)} className={`library-row ${selectedPrompt?.id === item.id ? "is-selected" : ""}`}><div><span className="library-dept">{DEPARTMENTS.find((d) => d.id === item.department)?.label}</span><h2>{item.title}</h2><p>{item.summary}</p></div><ChevronRight size={17} /></button>) }
      </section>
      <aside className="library-detail">
        {!selected && <div className="library-empty"><LibraryBig size={28} /><h2>揀一項睇點用</h2><p>會見到適用時機、要準備乜、步驟、會交返乜，同埋下一個可接邊個 skill。</p></div>}
        {selectedSkill && tab === "skills" && <SkillDetail skill={selectedSkill} />}
        {selectedPrompt && tab === "prompts" && <PromptDetail prompt={selectedPrompt} />}
      </aside>
    </div>
  </div>;
}

function SkillDetail({ skill }: { skill: SkillLibraryItem }) {
  const [document, setDocument] = useState<SkillDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [metadata, setMetadata] = useState<SkillMetadata>({ verifiedAt: "", riskNote: "", lastCheck: "" });
  async function reload() {
    if (!skill.sourcePath) return;
    setLoading(true); setNotice(null); setConflict(false);
    try { const latest = await loadSkill(skill.sourcePath); setDocument(latest); setDraft(latest.content); setMetadata(skillMetadata(latest.content)); setEditing(false); }
    catch (error) { setNotice(error instanceof Error ? error.message : "未能讀取原始 SKILL.md。"); }
    finally { setLoading(false); }
  }
  useEffect(() => { setDocument(null); setDraft(""); setEditing(false); setNotice(null); setConflict(false); void reload(); }, [skill.id]);
  async function save() {
    if (!document) return;
    setSaving(true); setNotice(null); setConflict(false);
    try {
      const saved = await saveSkill({ ...document, content: draft });
      setDocument(saved); setDraft(saved.content); setEditing(false);
      setNotice(`已存檔 ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`);
    } catch (error) {
      const failed = error as Error & { status?: number };
      setConflict(failed.status === 409); setNotice(failed.message || "未能儲存原始 SKILL.md。");
    } finally { setSaving(false); }
  }
  async function saveMetadata() {
    if (!document) return;
    setSaving(true); setNotice(null); setConflict(false);
    try {
      const saved = await saveSkill({ ...document, content: withSkillMetadata(document.content, metadata) });
      setDocument(saved); setDraft(saved.content); setMetadata(skillMetadata(saved.content));
      setNotice("驗證欄已寫入 SKILL.md frontmatter。");
    } catch (error) {
      const failed = error as Error & { status?: number };
      setConflict(failed.status === 409); setNotice(failed.message || "未能儲存驗證欄。");
    } finally { setSaving(false); }
  }
  return <article className="library-dossier"><span className="eyebrow">/{skill.name} · {skill.source}</span><h2>呢個 skill 幫你做乜？</h2><p className="library-lead">{skill.description || skill.what}</p><dl><div><dt>何時用</dt><dd>{skill.when}</dd></div><div><dt>先準備</dt><dd>{skill.inputs}</dd></div><div><dt>會交返乜</dt><dd>{skill.output}</dd></div></dl><section><h3>點樣做</h3><ol>{skill.steps.map((step) => <li key={step}>{step}</li>)}</ol></section><section><h3>會接邊個 skill？</h3><div className="skill-links">{skill.links.map((link) => <span key={link}>{link}</span>)}</div></section>{skill.sourcePath ? <section className="skill-source"><div className="skill-source-head"><div><h3>原始 SKILL.md</h3><p>{skill.sourcePath}</p></div><div className="skill-source-actions"><span className="source-line">示範版：唔會開本機 Obsidian</span><button type="button" onClick={() => editing ? setEditing(false) : setEditing(true)} disabled={!document || loading}>{editing ? "取消" : <><Pencil size={13} />編輯</>}</button></div></div>{notice && <p className={`skill-notice ${conflict ? "is-conflict" : ""}`} role="status">{notice}{conflict && <button type="button" onClick={() => void reload()}><RefreshCw size={12} />重新載入</button>}</p>}{loading && <p className="skill-loading">正在讀取 vault 正本…</p>}{document && <section className="skill-verification"><div><h4>Skill 驗證</h4><p>只記錄到該 SKILL.md frontmatter；沒有資料會明示為「未記錄」。</p></div><div className="skill-verification-grid"><label>verified_at<input value={metadata.verifiedAt} onChange={(event) => setMetadata((current) => ({ ...current, verifiedAt: event.target.value }))} placeholder="未記錄" /></label><label>risk_note<input value={metadata.riskNote} onChange={(event) => setMetadata((current) => ({ ...current, riskNote: event.target.value }))} placeholder="未記錄" /></label><label>last_check<input value={metadata.lastCheck} onChange={(event) => setMetadata((current) => ({ ...current, lastCheck: event.target.value }))} placeholder="未記錄" /></label></div><button type="button" className="skill-metadata-save" onClick={() => void saveMetadata()} disabled={saving}>{saving ? "儲存中…" : "儲存驗證欄"}</button></section>}{document && (editing ? <><textarea className="skill-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} aria-label={`${skill.name} 的 SKILL.md 編輯器`} /><div className="skill-save-row"><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "儲存中…" : <><Save size={14} />儲存原始檔</>}</button></div></> : <pre className="skill-document">{document.content}</pre>)}</section> : <p className="source-line">此項未有可供本機讀寫的 vault 正本。</p>}</article>;
}

function PromptDetail({ prompt }: { prompt: PromptLibraryItem }) {
  return <article className="library-dossier"><span className="eyebrow">PROMPT · {prompt.source}</span><h2>{prompt.title}</h2><p className="library-lead">{prompt.summary}</p><dl><div><dt>何時用</dt><dd>{prompt.when}</dd></div><div><dt>先準備</dt><dd>{prompt.inputs}</dd></div><div><dt>用法</dt><dd>先讀原 prompt，再貼入新對話；只交出已核實資料，最後由人覆核。</dd></div></dl><p className="source-line">來源：{prompt.source}</p></article>;
}
