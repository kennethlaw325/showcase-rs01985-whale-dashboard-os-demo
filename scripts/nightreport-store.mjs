import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ARCHIVE_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;

function reportMeta(path, content) {
  const headings = [...content.matchAll(/^#\s+(.+)$/gm)];
  const heading = headings.at(-1)?.[1]?.trim() || "夜跑報告";
  const date = heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] || path.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "日期未標示";
  return { title: heading, date, path, content };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readNightReports({ rootDir = process.cwd(), limit = 5 } = {}) {
  const currentContent = await readOptional(join(rootDir, "NIGHTREPORT.md"));
  let names = [];
  try {
    names = (await readdir(join(rootDir, "nightreports"))).filter((name) => ARCHIVE_NAME.test(name)).sort().reverse().slice(0, limit);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  const archives = (await Promise.all(names.map(async (name) => {
    const content = await readOptional(join(rootDir, "nightreports", name));
    return content === null ? null : reportMeta(`nightreports/${name}`, content);
  }))).filter(Boolean);

  return {
    current: currentContent === null ? null : reportMeta("NIGHTREPORT.md", currentContent),
    archives
  };
}
