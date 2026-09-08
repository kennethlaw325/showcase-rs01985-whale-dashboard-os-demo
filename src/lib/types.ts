export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  source?: "frontmatter" | "checkbox";
  sourceFile?: string;
  department?: string;
}

export interface TodayPlan {
  date: string;
  taskIds: string[];
  note?: string;
  source?: "daily-log" | "ceo-priority";
  suggestedFocus?: Array<{ title: string; why: string }>;
}

export interface DailyNote {
  date: string;
  content: string;
  summary: string[];
}

export interface VaultHealth {
  inboxCount: number;
  orphanCount: number;
  recentAtomNotes: Array<{ title: string; date: string; path: string }>;
  lastSyncedAt: string;
}

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  statusNote: string;
  status: AgentStatus;
  lastRun: string | null;
  outputCount: number;
}

export interface AgentHandbooks {
  companyManual: string;
  skills: Record<string, string>;
  lastSyncedAt: string;
}

export interface CeoKpi {
  tone: "danger" | "normal";
  value: string;
  label: string;
}

export interface CeoProject {
  status: "complete" | "zero" | "primary" | "active";
  label: string;
  value: number;
  display: string;
}

export interface CeoTimelineStop {
  state: "done" | "now" | "target" | "future";
  icon: string;
  title: string;
  detail: string;
}

export interface CeoFinanceTile {
  value: string;
  label: string;
  tone: "danger" | "warn";
}

export interface CeoNorthStarTrack {
  note: string;
  target: string;
  baseCase: string;
  bullCase: string;
  risk: string;
  gates: string[];
  status: string;
}

export interface CeoFinance {
  note: string;
  tiles: CeoFinanceTile[];
  subscriptions: string;
}

export interface CeoLaunchTrack {
  icon: string;
  title: string;
  detail: string;
  highlight?: boolean;
}

export interface CeoLaunchTracks {
  note: string;
  tracks: CeoLaunchTrack[];
}

export interface CeoDateBadge {
  text: string;
  tone: "hot" | "danger" | "normal";
}

export interface CeoDateBand {
  note: string;
  badges: CeoDateBadge[];
}

export type CeoPositioningPointType = "ai" | "old" | "neutral" | "exit" | "whale";

export interface CeoPositioningPoint {
  x: number;
  y: number;
  label: string;
  type: CeoPositioningPointType;
  labelAnchor?: "start" | "end";
}

export interface CeoPricingRow {
  label: string;
  display: string;
  widthPct: number;
  highlight?: boolean;
}

export interface CeoPositioning {
  note: string;
  axes: { xLeft: string; xRight: string; yTop: string; yBottom: string };
  points: CeoPositioningPoint[];
  pricing: CeoPricingRow[];
}

export interface RevenuePipelineStage {
  stage: string;
  count: number;
  assumedRate: number;
  expectedWins: number;
}

export interface RevenueGap {
  targetsApproved: boolean;
  note: string;
  sources: string[];
  pipeline: RevenuePipelineStage[];
}

export interface CeoOps {
  title: string;
  subtitle: string;
  badges: string[];
  timeline: CeoTimelineStop[];
  projects: CeoProject[];
  kpis: CeoKpi[];
  departmentPulse: string;
  rayFocus: string;
  northStarTrack: CeoNorthStarTrack;
  finance: CeoFinance;
  launchTracks: CeoLaunchTracks;
  dateBand: CeoDateBand;
  positioning: CeoPositioning;
  revenueGap?: RevenueGap;
  lastSyncedAt: string;
}

export interface CeoBrief {
  date: string;
  northStar: string;
  urgent: Array<{ title: string; why: string; ask: string }>;
  priorities: Array<{ title: string; why: string }>;
  lastSyncedAt: string;
}

export interface DepartmentWorkItem {
  title: string;
  status: string;
  detail: string;
}

export interface DepartmentPulse {
  id: string;
  name: string;
  emoji: string;
  active: DepartmentWorkItem[];
  done: DepartmentWorkItem[];
  tasks: DepartmentWorkItem[];
  source: string;
}

export type DepartmentId = "sales" | "ig-marketing" | "seo-blog" | "website-system" | "production" | "internal-audit";

// "ceo" = 外掛(plugin)skills:唔入任何 PM 池,CEO 直接用(Demo User 2026-08-01 拍板)。
export type SkillOwner = DepartmentId | "ceo";

export interface SkillLibraryItem {
  id: string;
  name: string;
  category: string;
  department: SkillOwner;
  source: string;
  sourcePath?: string;
  description?: string;
  what: string;
  when: string;
  inputs: string;
  steps: string[];
  output: string;
  links: string[];
}

export interface PromptLibraryItem {
  id: string;
  title: string;
  category: string;
  department: DepartmentId;
  summary: string;
  when: string;
  inputs: string;
  source: string;
}

export interface RssLink {
  label: string;
  url: string;
}

export interface RssItem {
  rank: number;
  headline: string;
  detail: string;
  links: RssLink[];
}

export interface RssDaily {
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  items: RssItem[];
  fullContent: string;
  sourcePath: string;
}

export type PulseLevel = "active" | "slowing" | "stalled" | "unknown";

// 部門更新狀態:由 vault git「部門資料夾最後一次 commit」derive,唔係手填。
// lastCommitISO 係唯一訊號源;level 只係 sync 當刻嘅快照,UI 應以 ISO 重新計先算誠實。
export interface PmPulse {
  level: PulseLevel;
  lastCommitISO: string | null;
  lastCommitSubject: string | null;
}

export interface OfficePm {
  id: DepartmentId;
  name: string;
  emoji: string;
  mission: string;
  skillCount: number;
  capabilityAgents: string[];
  pulse?: PmPulse;
}

export interface PmHandbooks {
  departments: Record<string, string>;
  skills: Record<string, string>;
}

export interface OfficeOrg {
  ceo: { name: string; role: string };
  coAi: Array<{ name: string; role: string; focus: string }>;
  pms: OfficePm[];
  capabilityPool: {
    skillTotal: number;
    pmOwnedTotal?: number;
    ceoDirectTotal?: number;
    promptTotal: number;
    courseTemplateTotal: number;
    note: string;
  };
  note: string;
  lastSyncedAt: string;
}
