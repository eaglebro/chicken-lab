export type IncubationBalanceType = "common" | "glow" | "breed";

export const FACILITY_COST_ESCALATION = 1.5;
export const INCUBATION_BASE_MS: Record<IncubationBalanceType, number> = {
  common: 6000,
  glow: 9000,
  breed: 11000
};
export const OFFLINE_BASE_SECONDS = 3 * 60 * 60;
export const OFFLINE_BONUS_SECONDS_PER_LEVEL = 90 * 60;

export function facilityCostFactor(level: number): number {
  return FACILITY_COST_ESCALATION ** Math.max(0, level - 1);
}

export function incubationDurationMs(type: IncubationBalanceType, incubatorLevel: number): number {
  const multiplier = Math.max(0.7, 1 - Math.max(0, incubatorLevel - 1) * 0.1);
  return Math.round(INCUBATION_BASE_MS[type] * multiplier);
}

export function offlineCapSeconds(warehouseLevel: number): number {
  return OFFLINE_BASE_SECONDS + Math.max(0, warehouseLevel - 1) * OFFLINE_BONUS_SECONDS_PER_LEVEL;
}

export function offlineElapsedSeconds(now: number, lastTick: number, capSeconds: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(lastTick) || !Number.isFinite(capSeconds)) return 0;
  return Math.min(Math.max(0, capSeconds), Math.max(0, (now - lastTick) / 1000));
}
