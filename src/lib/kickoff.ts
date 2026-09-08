export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function kickoffText(heading: string, fields: Array<[string, string]>, ask: string): string {
  const body = fields.map(([label, value]) => `${label}:${value}`).join("\n");
  return `【Kickoff · ${heading} · Demo-AI Whale OS Dashboard】\n\n${body}\n\n▍要你做\n${ask}`;
}
