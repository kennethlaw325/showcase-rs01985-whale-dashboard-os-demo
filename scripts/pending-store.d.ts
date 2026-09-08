export type PendingKind = "todo" | "review" | "topic";

export interface PendingFileInput {
  kind: PendingKind;
  target: string;
  preview: string;
  pendingDir?: string;
}

export interface PendingFileResult {
  createdAt: string;
  relativePath: string;
  document: string;
}

export const TODO_TARGET: "100_Todo/_inbox/";
export const TOPIC_TARGET: "300_Content/ig-content/";
export function createPendingFile(input: PendingFileInput): Promise<PendingFileResult>;
