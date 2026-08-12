import type { ExplorationModifiers } from "./exploration.ts";

export const SAVE_VERSION = 7;
export const STORAGE_KEY = "chicken-lab-save-v7";
export const BACKUP_STORAGE_KEY = "chicken-lab-save-backup";
export const RECOVERY_STORAGE_KEY = "chicken-lab-save-recovery";
export const LEGACY_STORAGE_KEYS = ["chicken-lab-save-v6", "chicken-lab-save-v5", "chicken-lab-save-v4", "chicken-lab-save-v3", "chicken-lab-save-v2", "chicken-lab-save-v1"] as const;
export const SAVE_FILE_FORMAT = "chicken-lab-save";

export interface SaveFile<T = unknown> {
  format: typeof SAVE_FILE_FORMAT;
  exportedAt: string;
  version: number;
  save: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function migrateBlueprintCount(resources: unknown): number {
  const value = isRecord(resources) ? resources.blueprints : undefined;
  return Math.floor(finiteNumber(value, 0));
}

export function migrateExplorationModifiers(value: unknown, fallback: ExplorationModifiers): ExplorationModifiers {
  const modifiers = isRecord(value) ? value : {};
  return {
    moveSpeed: Math.min(1, finiteNumber(modifiers.moveSpeed, fallback.moveSpeed)),
    collectionEfficiency: Math.min(0.6, finiteNumber(modifiers.collectionEfficiency, fallback.collectionEfficiency)),
    fatigueReduction: Math.min(10, finiteNumber(modifiers.fatigueReduction, fallback.fatigueReduction)),
    battleRating: Math.min(30, finiteNumber(modifiers.battleRating, fallback.battleRating))
  };
}

export function createSaveFile<T>(save: T, exportedAt = new Date().toISOString()): SaveFile<T> {
  const version = isRecord(save) && typeof save.version === "number" ? Math.floor(save.version) : SAVE_VERSION;
  return { format: SAVE_FILE_FORMAT, exportedAt, version, save };
}

export function parseSaveFile(serialized: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }

  const candidate = isRecord(parsed) && parsed.format === SAVE_FILE_FORMAT ? parsed.save : parsed;
  if (!isRecord(candidate)) throw new Error("文件中没有可识别的牧场存档。");
  const version = typeof candidate.version === "number" ? Math.floor(candidate.version) : 1;
  if (version > SAVE_VERSION) throw new Error(`存档来自更新版本 V${version}，当前版本无法导入。`);
  const chickens = Array.isArray(candidate.chickens) ? candidate.chickens : [];
  if (!isRecord(candidate.resources) || chickens.length < 2 || chickens.some(chicken => !isRecord(chicken) || typeof chicken.species !== "string")) {
    throw new Error("存档缺少资源或有效鸡群数据。");
  }
  return candidate;
}

export function saveFileTimestamp(serialized: string): string | null {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return isRecord(parsed) && parsed.format === SAVE_FILE_FORMAT && typeof parsed.exportedAt === "string" ? parsed.exportedAt : null;
  } catch {
    return null;
  }
}
