import "../styles.css";
import {
  EXPEDITION_SUPPLIES,
  EXPLORATION_EVENTS,
  ZONES,
  actionEndAt,
  actionPhase,
  automaticNextNodeId,
  cargoFromPartial,
  cargoLabels,
  collectionMultiplier as calculateCollectionMultiplier,
  emptyCargo,
  explorationModifiers as calculateExplorationModifiers,
  getRouteNode,
  getZone,
  matchingCapability,
  mergeCargo,
  staminaCost,
  staminaState,
  travelDuration,
  type BossTrait,
  type ExpeditionCargo,
  type ExpeditionSupplyId,
  type ExplorationChicken,
  type ExplorationEvent,
  type ExplorationModifiers,
  type RouteNode,
  type TraitId,
  type ZoneId
} from "./exploration";
import {
  BACKUP_STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  RECOVERY_STORAGE_KEY,
  SAVE_VERSION,
  STORAGE_KEY,
  createSaveFile,
  migrateBlueprintCount,
  migrateExplorationModifiers,
  parseSaveFile,
  saveFileTimestamp
} from "./save-migrations";
import {
  breedingLockCost,
  canConvertSelection,
  conversionDust as calculateConversionDust,
  conversionProtected as isConversionProtected,
  mergeDiscovery,
  productionRates as calculateProductionRates,
  traitProductionMultiplier as calculateTraitProductionMultiplier
} from "./chicken-domain";
import {
  achievementCompletion,
  achievementProgress,
  activeMainQuestIndex,
  codexCompletion,
  mainQuestCompletedCount,
  mainQuestUnlocked,
  type MainQuestProgress
} from "./progression";
import { facilityCostFactor, incubationDurationMs, offlineCapSeconds as calculateOfflineCapSeconds, offlineElapsedSeconds } from "./balance";

const TRAIT_LOCK_COST = 4;
const FACILITY_MAX_LEVEL = 4;

type SpeciesId = "sprout" | "round" | "cloud" | "blaze" | "miner" | "river" | "dawn" | "star";
type EggType = "common" | "glow";
type IncubationType = EggType | "breed";
type ViewId = "farm" | "hatch" | "flock" | "explore";
type FlockMode = "chickens" | "codex";
type ExplorationPhase = "moving" | "collecting" | "fighting";
type SavedExplorationPhase = ExplorationPhase | "awaitingChoice";
type FacilityId = "coop" | "incubator" | "nest" | "warehouse" | "training";
type MissionId = "collect" | "hatch" | "breed" | "team" | "explore" | "upgrade";
type AchievementId = "collector" | "hatchery" | "breeder" | "explorer" | "builder" | "species" | "traits";

interface SpeciesDefinition {
  name: string;
  rarity: "普通" | "少见" | "稀有" | "传奇";
  accessory: string;
  grain: number;
  feather: number;
  power: number;
  workRole: string;
  battleRole: string;
}

interface TraitDefinition {
  name: string;
  production: number;
  power: number;
  category: "生产" | "战斗" | "均衡";
  description: string;
}

interface LineageParent {
  id: string;
  species: SpeciesId;
  traits: TraitId[];
  generation: number;
}

interface MutationRecord {
  speciesChanged: boolean;
  trait?: TraitId;
}

interface Chicken {
  id: string;
  species: SpeciesId;
  traits: TraitId[];
  generation: number;
  level: number;
  lineage?: [LineageParent, LineageParent];
  mutation?: MutationRecord;
}

interface Resources {
  grain: number;
  feather: number;
  eggs: number;
  glowEggs: number;
  parts: number;
  geneDust: number;
  blueprints: number;
}

interface DiscoveryState {
  species: SpeciesId[];
  traits: TraitId[];
}

interface FacilityDefinition {
  name: string;
  icon: string;
  description: string;
  baseCost: { grain: number; feather: number; parts: number };
  blueprintCost: number;
  effect: string;
}

interface Facilities {
  coop: number;
  incubator: number;
  nest: number;
  warehouse: number;
  training: number;
}

interface ProgressStats {
  collected: number;
  hatched: number;
  bred: number;
  explored: number;
}

interface MissionDefinition {
  id: MissionId;
  chapter: string;
  title: string;
  description: string;
  target: number;
  reward: Partial<Resources>;
  view: ViewId;
  action: string;
}

interface MissionState {
  claimed: boolean;
}

interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  target: number;
  icon: string;
}

interface Incubation {
  type: IncubationType;
  startedAt: number;
  endAt: number;
  result: Chicken;
  parents?: [string, string];
}

interface Exploration {
  zoneId: ZoneId;
  teamIds: string[];
  power: number;
  phase: ExplorationPhase;
  currentNodeId: string;
  startedAt: number;
  endAt: number;
  visited: string[];
  cargo: ExpeditionCargo;
  log: string[];
  failedBattles: number;
  supplyId: ExpeditionSupplyId;
  modifiers: ExplorationModifiers;
  eventResolved: boolean;
  eventSummary: string | null;
  stamina: number;
}

interface ExpeditionResult {
  zoneId: ZoneId;
  success: boolean;
  rewards: string[];
  log: string[];
  eventSummary: string | null;
  remainingStamina: number;
  bossSummary: string | null;
  supplySummary: string | null;
}


interface GameState {
  version: number;
  resources: Resources;
  bank: Pick<Resources, "grain" | "feather">;
  chickens: Chicken[];
  team: string[];
  incubation: Incubation | null;
  exploration: Exploration | null;
  lastExpedition: ExpeditionResult | null;
  events: string[];
  facilities: Facilities;
  stats: ProgressStats;
  missions: Record<MissionId, MissionState>;
  discovery: DiscoveryState;
  lastTick: number;
}

function $<T extends HTMLElement = HTMLButtonElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function $all<T extends HTMLElement = HTMLElement>(selector: string): NodeListOf<T> {
  return document.querySelectorAll<T>(selector);
}

const SPECIES: Record<SpeciesId, SpeciesDefinition> = {
  sprout: { name: "草团鸡", rarity: "普通", accessory: "🌱", grain: 1.5, feather: 0.12, power: 8, workRole: "谷粒采集", battleRole: "支援" },
  round: { name: "滚滚鸡", rarity: "普通", accessory: "●", grain: 1.1, feather: 0.2, power: 12, workRole: "均衡生产", battleRole: "守卫" },
  cloud: { name: "云绒鸡", rarity: "少见", accessory: "☁", grain: 0.85, feather: 0.42, power: 11, workRole: "羽毛收集", battleRole: "支援" },
  blaze: { name: "火羽鸡", rarity: "稀有", accessory: "🔥", grain: 1.25, feather: 0.28, power: 20, workRole: "均衡生产", battleRole: "突击" },
  miner: { name: "矿盔鸡", rarity: "稀有", accessory: "⛏", grain: 1.8, feather: 0.08, power: 22, workRole: "谷粒采集", battleRole: "守卫" },
  river: { name: "潮羽鸡", rarity: "少见", accessory: "≈", grain: 0.9, feather: 0.62, power: 16, workRole: "羽毛收集", battleRole: "侦察" },
  dawn: { name: "晨鸣鸡", rarity: "传奇", accessory: "☀", grain: 1.65, feather: 0.5, power: 30, workRole: "均衡生产", battleRole: "突击" },
  star: { name: "星冠鸡", rarity: "传奇", accessory: "✦", grain: 1.4, feather: 0.72, power: 34, workRole: "羽毛收集", battleRole: "统领" }
};

const TRAITS: Record<TraitId, TraitDefinition> = {
  diligent: { name: "勤快", production: 0.2, power: 0, category: "生产", description: "生产效率 +20%" },
  lucky: { name: "幸运", production: 0.05, power: 3, category: "均衡", description: "生产效率 +5%，战力 +3" },
  ironHead: { name: "铁头", production: 0, power: 7, category: "战斗", description: "战力 +7" },
  smallBelly: { name: "小胃王", production: 0.1, power: 1, category: "生产", description: "生产效率 +10%，战力 +1" },
  fluffy: { name: "蓬松", production: 0.08, power: 4, category: "均衡", description: "生产效率 +8%，战力 +4" },
  loud: { name: "大嗓门", production: -0.05, power: 8, category: "战斗", description: "生产效率 -5%，战力 +8" },
  sleepy: { name: "赖床", production: -0.12, power: -1, category: "生产", description: "生产效率 -12%，战力 -1" },
  snackThief: { name: "偷吃", production: 0.16, power: 2, category: "生产", description: "生产效率 +16%，战力 +2" },
  sharpEyes: { name: "锐眼", production: 0.02, power: 6, category: "战斗", description: "生产效率 +2%，战力 +6" },
  forager: { name: "寻粮", production: 0.24, power: -2, category: "生产", description: "生产效率 +24%，战力 -2" },
  steady: { name: "沉着", production: 0.06, power: 5, category: "均衡", description: "生产效率 +6%，战力 +5" },
  swift: { name: "疾行", production: 0.1, power: 4, category: "均衡", description: "生产效率 +10%，战力 +4" }
};

const EGG_POOLS: Record<EggType, ReadonlyArray<readonly [SpeciesId, number]>> = {
  common: [["sprout", 38], ["round", 25], ["cloud", 15], ["blaze", 8], ["miner", 7], ["river", 5], ["dawn", 1], ["star", 1]],
  glow: [["cloud", 25], ["blaze", 24], ["miner", 20], ["river", 16], ["dawn", 10], ["star", 5]]
};

const FACILITIES: Record<FacilityId, FacilityDefinition> = {
  coop: { name: "鸡舍", icon: "🏠", description: "鸡群容量", baseCost: { grain: 80, feather: 10, parts: 0 }, blueprintCost: 4, effect: "+4 个容量" },
  incubator: { name: "孵化器", icon: "🥚", description: "孵化速度", baseCost: { grain: 100, feather: 8, parts: 2 }, blueprintCost: 4, effect: "孵化时间 -10%" },
  nest: { name: "繁育窝", icon: "🧬", description: "遗传稳定", baseCost: { grain: 120, feather: 15, parts: 2 }, blueprintCost: 5, effect: "词条继承率 +8%" },
  warehouse: { name: "仓库", icon: "📦", description: "离线储存", baseCost: { grain: 100, feather: 12, parts: 1 }, blueprintCost: 4, effect: "+2 小时上限" },
  training: { name: "训练场", icon: "⚡", description: "队伍战力", baseCost: { grain: 150, feather: 18, parts: 3 }, blueprintCost: 6, effect: "战力 +5%" }
};

const MISSIONS: MissionDefinition[] = [
  { id: "collect", chapter: "01", title: "牧场开张", description: "累计收取 40 点资源", target: 40, reward: { grain: 80, feather: 8 }, view: "farm", action: "去收取" },
  { id: "hatch", chapter: "02", title: "第一次破壳", description: "孵化 1 只新鸡", target: 1, reward: { eggs: 2, grain: 60 }, view: "hatch", action: "去孵化" },
  { id: "team", chapter: "03", title: "三鸡出道", description: "组建一支 3 鸡队伍", target: 3, reward: { grain: 100, feather: 10 }, view: "flock", action: "去编队" },
  { id: "explore", chapter: "04", title: "第一次远行", description: "完成 1 次探索", target: 1, reward: { parts: 4, glowEggs: 1 }, view: "explore", action: "去探索" },
  { id: "breed", chapter: "05", title: "血脉延续", description: "完成 1 次繁育", target: 1, reward: { parts: 3, glowEggs: 1 }, view: "hatch", action: "去繁育" },
  { id: "upgrade", chapter: "06", title: "牧场新貌", description: "升级任意设施 1 次", target: 1, reward: { grain: 120, feather: 12, parts: 2 }, view: "farm", action: "看设施" }
];

const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "collector", title: "谷仓管家", description: "累计收取 1,000 点资源", target: 1000, icon: "🌾" },
  { id: "hatchery", title: "破壳成群", description: "累计孵化 5 只新鸡", target: 5, icon: "🥚" },
  { id: "breeder", title: "血脉记录员", description: "累计完成 3 次繁育", target: 3, icon: "🧬" },
  { id: "explorer", title: "远行常客", description: "累计完成 6 次探索", target: 6, icon: "◇" },
  { id: "builder", title: "设施规划师", description: "累计完成 6 次设施升级", target: 6, icon: "🏗" },
  { id: "species", title: "品种收藏家", description: "发现全部 8 个品种", target: 8, icon: "✦" },
  { id: "traits", title: "词条研究员", description: "发现全部 12 个词条", target: 12, icon: "▦" }
];

const SAMPLE_EVENTS = [
  "滚滚鸡试图坐进一个比它小的篮子。",
  "草团鸡对着一粒谷子研究了很久。",
  "鸡舍今日没有发生值得警戒的事情。",
  "有只鸡坚称风车在跟它打招呼。"
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function weightedSpecies(type: EggType = "common"): SpeciesId {
  const pool = EGG_POOLS[type];
  let roll = Math.random() * 100;
  for (const [id, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return id;
  }
  return pool[0]![0];
}

function makeChicken(speciesId: SpeciesId, traitIds?: TraitId[], generation = 1): Chicken {
  const allTraits = Object.keys(TRAITS) as TraitId[];
  const traits = traitIds?.length ? traitIds : [randomItem(allTraits)];
  return { id: uid(), species: speciesId, traits: [...new Set(traits)].slice(0, 3), generation, level: 1 };
}

function starterState(): GameState {
  const chickens = [
    makeChicken("sprout", ["diligent"]),
    makeChicken("round", ["ironHead"]),
    makeChicken("cloud", ["fluffy", "sleepy"])
  ];
  return {
    version: SAVE_VERSION,
    resources: { grain: 260, feather: 38, eggs: 2, glowEggs: 0, parts: 4, geneDust: 0, blueprints: 0 },
    bank: { grain: 36, feather: 4 },
    chickens,
    team: [],
    incubation: null,
    exploration: null,
    lastExpedition: null,
    events: ["第一批鸡已经占领了鸡舍。", "牧场开张，谷粒闻起来很有前途。"],
    facilities: { coop: 1, incubator: 1, nest: 1, warehouse: 1, training: 1 },
    stats: { collected: 0, hatched: 0, bred: 0, explored: 0 },
    missions: { collect: { claimed: false }, hatch: { claimed: false }, breed: { claimed: false }, team: { claimed: false }, explore: { claimed: false }, upgrade: { claimed: false } },
    discovery: {
      species: [...new Set(chickens.map(chicken => chicken.species))],
      traits: [...new Set(chickens.flatMap(chicken => chicken.traits))]
    },
    lastTick: Date.now()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSpeciesId(value: unknown): value is SpeciesId {
  return typeof value === "string" && value in SPECIES;
}

function isTraitId(value: unknown): value is TraitId {
  return typeof value === "string" && value in TRAITS;
}

function finiteNumber(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function integerNumber(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  return Math.min(maximum, Math.max(minimum, Math.floor(finiteNumber(value, fallback, minimum))));
}

function normalizeLineageParent(value: unknown): LineageParent | null {
  if (!isRecord(value) || !isSpeciesId(value.species)) return null;
  const traits = Array.isArray(value.traits) ? value.traits.filter(isTraitId).slice(0, 3) : [];
  return {
    id: typeof value.id === "string" ? value.id : "unknown",
    species: value.species,
    traits,
    generation: integerNumber(value.generation, 1, 1)
  };
}

function normalizeChicken(value: unknown): Chicken | null {
  if (!isRecord(value) || !isSpeciesId(value.species)) return null;
  const validTraits = Array.isArray(value.traits) ? value.traits.filter(isTraitId) : [];
  const traits: TraitId[] = validTraits.length ? validTraits : ["diligent"];
  const lineageItems = Array.isArray(value.lineage) ? value.lineage.map(normalizeLineageParent).filter((parent): parent is LineageParent => Boolean(parent)).slice(0, 2) : [];
  const lineage: [LineageParent, LineageParent] | undefined = lineageItems.length === 2 ? [lineageItems[0]!, lineageItems[1]!] : undefined;
  const mutationSource = isRecord(value.mutation) ? value.mutation : null;
  const mutation = mutationSource && (mutationSource.speciesChanged === true || isTraitId(mutationSource.trait))
    ? { speciesChanged: mutationSource.speciesChanged === true, trait: isTraitId(mutationSource.trait) ? mutationSource.trait : undefined }
    : undefined;
  return {
    id: typeof value.id === "string" && value.id ? value.id : uid(),
    species: value.species,
    traits: [...new Set(traits)].slice(0, 3),
    generation: integerNumber(value.generation, 1, 1),
    level: integerNumber(value.level, 1, 1),
    lineage,
    mutation
  };
}

function normalizeCargo(value: unknown): ExpeditionCargo {
  const cargo = isRecord(value) ? value : {};
  return {
    grain: integerNumber(cargo.grain, 0),
    feather: integerNumber(cargo.feather, 0),
    parts: integerNumber(cargo.parts, 0),
    eggs: integerNumber(cargo.eggs, 0),
    glowEggs: integerNumber(cargo.glowEggs, 0),
    blueprints: integerNumber(cargo.blueprints, 0)
  };
}

function isSavedExplorationPhase(value: unknown): value is SavedExplorationPhase {
  return ["moving", "collecting", "fighting", "awaitingChoice"].includes(String(value));
}

function isExpeditionSupplyId(value: unknown): value is ExpeditionSupplyId {
  return typeof value === "string" && value in EXPEDITION_SUPPLIES;
}

function normalizeState(raw: unknown): GameState {
  const fresh = starterState();
  if (!isRecord(raw)) return fresh;

  const resources = isRecord(raw.resources) ? raw.resources : {};
  const bank = isRecord(raw.bank) ? raw.bank : {};
  const facilities = isRecord(raw.facilities) ? raw.facilities : {};
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const loadedChickens = Array.isArray(raw.chickens) ? raw.chickens.map(normalizeChicken).filter((chicken): chicken is Chicken => Boolean(chicken)) : [];
  const chickens = loadedChickens.length ? loadedChickens : fresh.chickens;
  const chickenIds = new Set(chickens.map(chicken => chicken.id));
  const team = Array.isArray(raw.team)
    ? [...new Set(raw.team.filter((id): id is string => typeof id === "string" && chickenIds.has(id)))].slice(0, 3)
    : [];

  const missions = { ...fresh.missions };
  const loadedMissions = isRecord(raw.missions) ? raw.missions : null;
  if (loadedMissions) {
    (Object.keys(missions) as MissionId[]).forEach(id => {
      const mission = loadedMissions[id];
      if (isRecord(mission)) missions[id] = { claimed: mission.claimed === true };
    });
  }

  const incubation = isRecord(raw.incubation) && ["common", "glow", "breed"].includes(String(raw.incubation.type))
    ? (() => {
      const result = normalizeChicken(raw.incubation?.result);
      const startedAt = finiteNumber(raw.incubation?.startedAt, 0);
      const endAt = finiteNumber(raw.incubation?.endAt, 0);
      const parentIds = Array.isArray(raw.incubation?.parents) ? raw.incubation.parents.filter((id): id is string => typeof id === "string").slice(0, 2) : [];
      const parents: [string, string] | undefined = parentIds.length === 2 ? [parentIds[0]!, parentIds[1]!] : undefined;
      return result && endAt > startedAt
        ? { type: raw.incubation?.type as IncubationType, startedAt, endAt, result, parents }
        : null;
    })()
    : null;

  const loadedExploration = isRecord(raw.exploration) ? raw.exploration : null;
  const exploration = loadedExploration && ZONES.some(zone => zone.id === loadedExploration.zoneId)
    ? (() => {
      const zone = getZone(loadedExploration.zoneId as ZoneId);
      const firstNode = zone.nodes[0]!;
      const teamIds = Array.isArray(loadedExploration.teamIds)
        ? [...new Set(loadedExploration.teamIds.filter((id): id is string => typeof id === "string" && chickenIds.has(id)))].slice(0, 3)
        : [];
      if (!teamIds.length) return null;

      const nodeIds = new Set(zone.nodes.map(node => node.id));
      const phase = isSavedExplorationPhase(loadedExploration.phase) ? loadedExploration.phase : null;
      const currentNodeId = typeof loadedExploration.currentNodeId === "string" && nodeIds.has(loadedExploration.currentNodeId)
        ? loadedExploration.currentNodeId
        : firstNode.id;
      const startedAt = finiteNumber(loadedExploration.startedAt, Date.now());
      const endAt = finiteNumber(loadedExploration.endAt, startedAt);
      const validTiming = endAt > startedAt;
      const supplyId = isExpeditionSupplyId(loadedExploration.supplyId) ? loadedExploration.supplyId : "none";
      const teamModifiers = explorationModifiers(teamIds, supplyId, chickens);
      const legacyMoveSpeed = Math.min(1, finiteNumber(loadedExploration.moveSpeedBonus, teamModifiers.moveSpeed));
      const modifiers = migrateExplorationModifiers(loadedExploration.modifiers, { ...teamModifiers, moveSpeed: legacyMoveSpeed });

      if (phase && phase !== "awaitingChoice" && validTiming) {
        return {
          zoneId: zone.id,
          teamIds,
          power: finiteNumber(loadedExploration.power, 0),
          phase,
          currentNodeId,
          startedAt,
          endAt,
          visited: Array.isArray(loadedExploration.visited) ? loadedExploration.visited.filter((id): id is string => typeof id === "string" && nodeIds.has(id)) : [],
          cargo: normalizeCargo(loadedExploration.cargo),
          log: Array.isArray(loadedExploration.log) ? loadedExploration.log.filter((item): item is string => typeof item === "string").slice(-8) : [],
          failedBattles: integerNumber(loadedExploration.failedBattles, 0),
          supplyId,
          modifiers,
          eventResolved: loadedExploration.eventResolved === true,
          eventSummary: typeof loadedExploration.eventSummary === "string" ? loadedExploration.eventSummary : null,
          stamina: integerNumber(loadedExploration.stamina, 100, 0, 100)
        };
      }

      if (phase === "awaitingChoice") {
        const nextNodeId = automaticNextNodeId(zone.id, currentNodeId, finiteNumber(loadedExploration.power, 0), modifiers.battleRating);
        const nextNode = getRouteNode(zone.id, nextNodeId);
        const now = Date.now();
        return {
          zoneId: zone.id,
          teamIds,
          power: finiteNumber(loadedExploration.power, 0),
          phase: "moving" as const,
          currentNodeId: nextNode.id,
          startedAt: now,
          endAt: now + travelDuration(nextNode, modifiers.moveSpeed) * 1000,
          visited: Array.isArray(loadedExploration.visited) ? loadedExploration.visited.filter((id): id is string => typeof id === "string" && nodeIds.has(id)) : [],
          cargo: normalizeCargo(loadedExploration.cargo),
          log: [...(Array.isArray(loadedExploration.log) ? loadedExploration.log.filter((item): item is string => typeof item === "string") : []), `自动规划路线：${nextNode.name}。`].slice(-8),
          failedBattles: integerNumber(loadedExploration.failedBattles, 0),
          supplyId,
          modifiers,
          eventResolved: loadedExploration.eventResolved === true,
          eventSummary: typeof loadedExploration.eventSummary === "string" ? loadedExploration.eventSummary : null,
          stamina: integerNumber(loadedExploration.stamina, 100, 0, 100)
        };
      }

      const now = Date.now();
      const legacyRemaining = Math.max(2, Math.min(firstNode.travelSeconds, Math.ceil((endAt - now) / 1000)));
      return {
        zoneId: zone.id,
        teamIds,
        power: finiteNumber(loadedExploration.power, 0),
        phase: "moving" as const,
        currentNodeId: firstNode.id,
        startedAt: now,
        endAt: now + legacyRemaining * 1000,
        visited: [],
        cargo: emptyCargo(),
        log: [`旧版探索已衔接到${firstNode.name}的移动阶段。`],
        failedBattles: 0,
        supplyId: "none" as const,
        modifiers: explorationModifiers(teamIds, "none", chickens),
        eventResolved: false,
        eventSummary: null,
        stamina: 100
      };
    })()
    : null;

  const loadedLastExpedition = isRecord(raw.lastExpedition) ? raw.lastExpedition : null;
  const lastExpedition = loadedLastExpedition && ZONES.some(zone => zone.id === loadedLastExpedition.zoneId) && Array.isArray(loadedLastExpedition.rewards)
    ? {
      zoneId: loadedLastExpedition.zoneId as ZoneId,
      success: loadedLastExpedition.success === true,
      rewards: loadedLastExpedition.rewards.filter((reward): reward is string => typeof reward === "string").slice(0, 6),
      log: Array.isArray(loadedLastExpedition.log) ? loadedLastExpedition.log.filter((item): item is string => typeof item === "string").slice(-8) : [],
      eventSummary: typeof loadedLastExpedition.eventSummary === "string" ? loadedLastExpedition.eventSummary : null,
      remainingStamina: integerNumber(loadedLastExpedition.remainingStamina, 100, 0, 100),
      bossSummary: typeof loadedLastExpedition.bossSummary === "string" ? loadedLastExpedition.bossSummary : null,
      supplySummary: typeof loadedLastExpedition.supplySummary === "string" ? loadedLastExpedition.supplySummary : null
    }
    : null;

  const loadedDiscovery = isRecord(raw.discovery) ? raw.discovery : null;
  const discoveredSpecies = loadedDiscovery && Array.isArray(loadedDiscovery.species) ? loadedDiscovery.species.filter(isSpeciesId) : [];
  const discoveredTraits = loadedDiscovery && Array.isArray(loadedDiscovery.traits) ? loadedDiscovery.traits.filter(isTraitId) : [];
  const discovery: DiscoveryState = {
    species: [...new Set([...discoveredSpecies, ...chickens.map(chicken => chicken.species)])],
    traits: [...new Set([...discoveredTraits, ...chickens.flatMap(chicken => chicken.traits)])]
  };

  return {
    version: SAVE_VERSION,
    resources: {
      grain: finiteNumber(resources.grain, fresh.resources.grain),
      feather: finiteNumber(resources.feather, fresh.resources.feather),
      eggs: integerNumber(resources.eggs, fresh.resources.eggs),
      glowEggs: integerNumber(resources.glowEggs, fresh.resources.glowEggs),
      parts: integerNumber(resources.parts, fresh.resources.parts),
      geneDust: integerNumber(resources.geneDust, fresh.resources.geneDust),
      blueprints: migrateBlueprintCount(resources)
    },
    bank: {
      grain: finiteNumber(bank.grain, fresh.bank.grain),
      feather: finiteNumber(bank.feather, fresh.bank.feather)
    },
    chickens,
    team,
    incubation,
    exploration,
    lastExpedition,
    events: Array.isArray(raw.events) ? raw.events.filter((event): event is string => typeof event === "string").slice(0, 5) : fresh.events,
    facilities: {
      coop: integerNumber(facilities.coop, fresh.facilities.coop, 1, FACILITY_MAX_LEVEL),
      incubator: integerNumber(facilities.incubator, fresh.facilities.incubator, 1, FACILITY_MAX_LEVEL),
      nest: integerNumber(facilities.nest, fresh.facilities.nest, 1, FACILITY_MAX_LEVEL),
      warehouse: integerNumber(facilities.warehouse, fresh.facilities.warehouse, 1, FACILITY_MAX_LEVEL),
      training: integerNumber(facilities.training, fresh.facilities.training, 1, FACILITY_MAX_LEVEL)
    },
    stats: {
      collected: finiteNumber(stats.collected, fresh.stats.collected),
      hatched: integerNumber(stats.hatched, fresh.stats.hatched),
      bred: integerNumber(stats.bred, fresh.stats.bred),
      explored: integerNumber(stats.explored, fresh.stats.explored)
    },
    missions,
    discovery,
    lastTick: finiteNumber(raw.lastTick, Date.now())
  };
}

function backupSerializedSave(serialized: string, key = BACKUP_STORAGE_KEY): boolean {
  try {
    const parsed = parseSaveFile(serialized);
    localStorage.setItem(key, JSON.stringify(createSaveFile(parsed)));
    return true;
  } catch {
    return false;
  }
}

function backupCurrentSave(): boolean {
  const serialized = localStorage.getItem(STORAGE_KEY);
  return serialized ? backupSerializedSave(serialized) : false;
}

function persistState(nextState: GameState, backupCurrent = true): boolean {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (backupCurrent && current) backupSerializedSave(current, RECOVERY_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return true;
  } catch {
    return false;
  }
}

function loadState(): GameState {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try {
      const serialized = localStorage.getItem(key);
      if (!serialized) continue;
      const parsed = JSON.parse(serialized) as unknown;
      const migrated = normalizeState(parsed);
      if (key !== STORAGE_KEY || !isRecord(parsed) || parsed.version !== SAVE_VERSION) persistState(migrated);
      return migrated;
    } catch {
      continue;
    }
  }
  for (const key of [RECOVERY_STORAGE_KEY, BACKUP_STORAGE_KEY]) {
    try {
      const backup = localStorage.getItem(key);
      if (backup) {
        const restored = normalizeState(parseSaveFile(backup));
        restored.events = [`主存档异常，已从${key === RECOVERY_STORAGE_KEY ? "自动恢复快照" : "操作前备份"}恢复。`, ...restored.events].slice(0, 5);
        persistState(restored, false);
        return restored;
      }
    } catch {
      continue;
    }
  }
  return starterState();
}

let state: GameState = loadState();
let activeView: ViewId = "farm";
let flockMode: FlockMode = "chickens";
let conversionMode = false;
const conversionSelection = new Set<string>();
let selectedSupplyId: ExpeditionSupplyId = "none";
let toastTimer: number | undefined;

function facilityIds(): FacilityId[] {
  return Object.keys(FACILITIES) as FacilityId[];
}

function facilityUpgradeCost(id: FacilityId): { grain: number; feather: number; parts: number; blueprints: number } {
  const level = state.facilities[id];
  const factor = facilityCostFactor(level);
  const base = FACILITIES[id].baseCost;
  return {
    grain: Math.round(base.grain * factor),
    feather: Math.round(base.feather * factor),
    parts: base.parts + Math.max(0, level - 1),
    blueprints: level >= 3 ? FACILITIES[id].blueprintCost : 0
  };
}

function coopCapacity(): number {
  return 6 + (state.facilities.coop - 1) * 4;
}

function breedingInheritanceChance(): number {
  return 0.62 + (state.facilities.nest - 1) * 0.08;
}

function offlineCapSeconds(): number {
  return calculateOfflineCapSeconds(state.facilities.warehouse);
}

function trainingPowerMultiplier(): number {
  return 1 + (state.facilities.training - 1) * 0.05;
}

function ranchLevel(): number {
  const upgradeCount = facilityIds().reduce((sum, id) => sum + state.facilities[id] - 1, 0);
  return 1 + Math.floor((state.chickens.length - 3 + upgradeCount * 2) / 3);
}

function facilityEffectSummary(id: FacilityId): string {
  const level = state.facilities[id];
  if (id === "coop") return `容量 ${coopCapacity()} 只`;
  if (id === "incubator") return `孵化时间 -${(level - 1) * 10}%`;
  if (id === "nest") return `词条继承 ${Math.round(breedingInheritanceChance() * 100)}%`;
  if (id === "warehouse") return `离线储存 ${offlineCapSeconds() / 3600} 小时`;
  return `全队战力 +${(level - 1) * 5}%`;
}

function missionProgress(id: MissionId): number {
  if (id === "collect") return state.stats.collected;
  if (id === "hatch") return state.stats.hatched;
  if (id === "breed") return state.stats.bred;
  if (id === "team") return state.team.length;
  if (id === "explore") return state.stats.explored;
  return facilityIds().reduce((sum, facilityId) => sum + state.facilities[facilityId] - 1, 0);
}

function mainQuestProgress(): MainQuestProgress[] {
  return MISSIONS.map(mission => ({
    id: mission.id,
    target: mission.target,
    progress: missionProgress(mission.id),
    claimed: state.missions[mission.id].claimed
  }));
}

function achievementMetric(id: AchievementId): number {
  if (id === "collector") return state.stats.collected;
  if (id === "hatchery") return state.stats.hatched;
  if (id === "breeder") return state.stats.bred;
  if (id === "explorer") return state.stats.explored;
  if (id === "builder") return facilityIds().reduce((sum, facilityId) => sum + state.facilities[facilityId] - 1, 0);
  if (id === "species") return state.discovery.species.length;
  return state.discovery.traits.length;
}

function currentAchievements() {
  return ACHIEVEMENTS.map(achievement => achievementProgress(achievement.id, achievement.target, achievementMetric(achievement.id)));
}

function rewardLabel(reward: Partial<Resources>): string {
  const labels: Array<[keyof Resources, string]> = [["grain", "🌾"], ["feather", "🪶"], ["parts", "⚙"], ["blueprints", "📐"], ["eggs", "🥚"], ["glowEggs", "✨"], ["geneDust", "🧬"]];
  return labels.filter(([key]) => (reward[key] || 0) > 0).map(([key, icon]) => `${icon}${reward[key]}`).join(" ");
}

function canAfford(cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as Array<keyof Resources>).every(key => state.resources[key] >= (cost[key] || 0));
}

function spendResources(cost: Partial<Resources>): void {
  (Object.keys(cost) as Array<keyof Resources>).forEach(key => {
    state.resources[key] -= cost[key] || 0;
  });
}

function addResources(reward: Partial<Resources>): void {
  (Object.keys(reward) as Array<keyof Resources>).forEach(key => {
    state.resources[key] += reward[key] || 0;
  });
}

function saveState(): void {
  state.lastTick = Date.now();
  persistState(state);
}

function traitProductionMultiplier(chicken: Chicken): number {
  return calculateTraitProductionMultiplier(chicken.traits.map(id => TRAITS[id]?.production || 0));
}

function chickenPower(chicken: Chicken): number {
  const base = SPECIES[chicken.species].power;
  const personalPower = base + chicken.traits.reduce((sum, id) => sum + (TRAITS[id]?.power || 0), 0);
  return Math.max(1, Math.round(personalPower * trainingPowerMultiplier()));
}

function chickenFocus(chicken: Chicken): string {
  const production = chicken.traits.reduce((sum, id) => sum + (TRAITS[id]?.production || 0), 0);
  const power = chicken.traits.reduce((sum, id) => sum + (TRAITS[id]?.power || 0), 0);
  if (production >= 0.16 && power < 5) return "生产专精";
  if (power >= 7 && production < 0.08) return "战斗专精";
  return "均衡培养";
}

function chickenProductionSummary(chicken: Chicken): string {
  const multiplier = traitProductionMultiplier(chicken);
  const species = SPECIES[chicken.species];
  return `${(species.grain * multiplier).toFixed(1)}🌾/分 · ${(species.feather * multiplier).toFixed(1)}🪶/分`;
}

function recordDiscovery(chicken: Chicken): void {
  state.discovery = mergeDiscovery(state.discovery, chicken.species, chicken.traits);
}

function lineageSnapshot(chicken: Chicken): LineageParent {
  return { id: chicken.id, species: chicken.species, traits: [...chicken.traits], generation: chicken.generation };
}

function conversionDust(chicken: Chicken): number {
  return calculateConversionDust({ id: chicken.id, rarity: SPECIES[chicken.species].rarity, traitCount: chicken.traits.length, generation: chicken.generation });
}

function conversionProtected(chicken: Chicken): boolean {
  return isConversionProtected(chicken.id, state.team, state.exploration?.teamIds || [], state.incubation?.parents || []);
}

function speciesPoolLabel(type: EggType): string {
  return EGG_POOLS[type].map(([id, weight]) => `${SPECIES[id].name} ${weight}%`).join(" · ");
}

function lockedTraitFor(selectId: string, chicken: Chicken | undefined): TraitId | null {
  const value = $<HTMLSelectElement>(selectId).value;
  return chicken && isTraitId(value) && chicken.traits.includes(value) ? value : null;
}

function teamPower(): number {
  return state.team.reduce((sum, id) => {
    const chicken = state.chickens.find(item => item.id === id);
    return sum + (chicken ? chickenPower(chicken) : 0);
  }, 0);
}

function explorationTeam(teamIds: string[], chickens = state.chickens): Chicken[] {
  return teamIds.map(id => chickens.find(chicken => chicken.id === id)).filter((chicken): chicken is Chicken => Boolean(chicken));
}

function explorationChicken(chicken: Chicken): ExplorationChicken {
  const species = SPECIES[chicken.species];
  return {
    id: chicken.id,
    name: species.name,
    traits: chicken.traits,
    traitNames: Object.fromEntries(chicken.traits.map(id => [id, TRAITS[id].name])),
    workRole: species.workRole,
    battleRole: species.battleRole
  };
}

function explorationModifiers(teamIds: string[], supplyId: ExpeditionSupplyId = "none", chickens = state.chickens): ExplorationModifiers {
  return calculateExplorationModifiers(explorationTeam(teamIds, chickens).map(explorationChicken), supplyId);
}

function collectionMultiplier(exploration: Exploration, node: RouteNode): number {
  return calculateCollectionMultiplier(explorationTeam(exploration.teamIds).map(explorationChicken), node, exploration.stamina, exploration.modifiers);
}

function eventAdvantage(event: ExplorationEvent, teamIds: string[]): string | null {
  return matchingCapability(explorationTeam(teamIds).map(explorationChicken), event.preferredTraits, event.preferredWorkRoles, event.preferredBattleRoles);
}

function bossAdvantage(boss: BossTrait, teamIds: string[]): string | null {
  return matchingCapability(explorationTeam(teamIds).map(explorationChicken), boss.preferredTraits, [], boss.preferredBattleRoles);
}

function spendStamina(exploration: Exploration, baseCost: number, extraReduction = 0): number {
  const cost = staminaCost(baseCost, exploration.modifiers.fatigueReduction, extraReduction);
  exploration.stamina = Math.max(0, exploration.stamina - cost);
  return cost;
}

function productionRates(): Pick<Resources, "grain" | "feather"> {
  const away = state.exploration ? new Set(state.exploration.teamIds) : new Set<string>();
  return calculateProductionRates(state.chickens.map(chicken => {
    const species = SPECIES[chicken.species];
    return { id: chicken.id, grain: species.grain, feather: species.feather, traitProduction: chicken.traits.map(id => TRAITS[id]?.production || 0) };
  }), away);
}

function applyProduction(seconds: number): void {
  const rates = productionRates();
  state.bank.grain += rates.grain * seconds / 60;
  state.bank.feather += rates.feather * seconds / 60;
}

function formatNumber(value: number): string {
  if (value < 1000) return Math.floor(value).toString();
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function chickenMarkup(chicken: Chicken, size = ""): string {
  const species = SPECIES[chicken.species];
  return `<div class="chicken-avatar species-${chicken.species} ${size}" aria-label="${species.name}">
    <svg class="chicken-svg" viewBox="0 0 86 96" role="img" aria-label="${species.name}" focusable="false">
      <path class="chicken-leg chicken-leg-one" d="M32 75v17M54 75v17" />
      <path class="chicken-body" d="M14 48C14 32 25 24 43 24c20 0 36 10 36 28 0 18-13 32-34 32-20 0-31-13-31-36Z" />
      <path class="chicken-wing" d="M12 57c3-13 13-18 26-13 7 3 8 12 3 20-5 7-15 10-23 5-5-3-7-7-6-12Z" />
      <circle class="chicken-head" cx="62" cy="30" r="24" />
      <path class="chicken-comb" d="M49 8c-2-8 5-11 10-5 4-8 11-4 10 3 8-3 10 5 3 10H53c-2-2-3-5-4-8Z" />
      <path class="chicken-eye" d="M66 25v7" />
      <path class="chicken-beak" d="m82 31 13 7-13 7Z" />
      <path class="chicken-cloud-shade" d="M39 29c-9 3-14 10-14 19 0 13 7 23 18 27" />
      <text class="chicken-accessory" x="12" y="25" aria-hidden="true">${species.accessory}</text>
    </svg>
  </div>`;
}

function showToast(message: string): void {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function addEvent(message: string): void {
  state.events.unshift(message);
  state.events = state.events.slice(0, 5);
}

function switchView(view: ViewId): void {
  activeView = view;
  $all(".view").forEach(item => item.classList.toggle("is-active", item.dataset.view === view));
  $all(".nav-button").forEach(item => item.classList.toggle("is-active", item.dataset.target === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function renderResources(): void {
  $("#grain-count").textContent = formatNumber(state.resources.grain);
  $("#feather-count").textContent = formatNumber(state.resources.feather);
  $("#parts-count").textContent = formatNumber(state.resources.parts);
  $("#egg-count").textContent = formatNumber(state.resources.eggs);
  $("#glow-egg-count").textContent = `库存 ${state.resources.glowEggs}`;
  $("#gene-dust-count").textContent = formatNumber(state.resources.geneDust);
  $("#blueprint-count").textContent = formatNumber(state.resources.blueprints);
  $("#common-egg-odds").textContent = speciesPoolLabel("common");
  $("#glow-egg-odds").textContent = speciesPoolLabel("glow");
}

function renderMissions(): void {
  const quests = mainQuestProgress();
  const claimed = mainQuestCompletedCount(quests);
  const activeIndex = activeMainQuestIndex(quests);
  $("#mission-summary").textContent = claimed === MISSIONS.length ? "主线已完成" : `${claimed}/${MISSIONS.length} 章`;
  $("#mission-list").innerHTML = MISSIONS.map((mission, index) => {
    const progress = Math.min(mission.target, missionProgress(mission.id));
    const ready = progress >= mission.target;
    const claimedMission = state.missions[mission.id].claimed;
    const unlocked = mainQuestUnlocked(index, quests);
    const isActive = index === activeIndex;
    const buttonText = claimedMission ? "已完成" : !unlocked ? "未解锁" : ready ? "领取奖励" : mission.action;
    const actionAttribute = ready ? `data-mission-id="${mission.id}"` : `data-mission-view="${mission.view}"`;
    return `<article class="mission-item ${claimedMission ? "is-claimed" : ""} ${isActive ? "is-active" : ""} ${!unlocked ? "is-locked" : ""}">
      <div>
        <div class="mission-heading"><span>第 ${mission.chapter} 章</span><h3>${mission.title}</h3></div>
        <p>${mission.description}</p>
        <div class="mission-progress" aria-label="进度 ${Math.floor(progress)}/${mission.target}"><span style="width:${progress / mission.target * 100}%"></span></div>
      </div>
      <div class="mission-reward">
        <small>${rewardLabel(mission.reward)}</small>
        <button ${actionAttribute} type="button" ${claimedMission || !unlocked ? "disabled" : ""}>${buttonText}</button>
      </div>
    </article>`;
  }).join("");
}

function renderAchievements(): void {
  const progress = currentAchievements();
  const summary = achievementCompletion(progress);
  $("#achievement-summary").textContent = `${summary.unlocked}/${summary.total} 已解锁`;
  $("#achievement-list").innerHTML = ACHIEVEMENTS.map((achievement, index) => {
    const item = progress[index]!;
    const percent = item.target ? item.progress / item.target * 100 : 100;
    return `<article class="achievement-item ${item.unlocked ? "is-unlocked" : ""}">
      <span class="achievement-icon" aria-hidden="true">${item.unlocked ? achievement.icon : "?"}</span>
      <div><h3>${achievement.title}</h3><p>${achievement.description}</p><div class="achievement-progress"><span style="width:${percent}%"></span></div></div>
      <strong>${item.unlocked ? "已解锁" : `${Math.floor(item.progress)}/${item.target}`}</strong>
    </article>`;
  }).join("");
}

function renderFacilities(): void {
  $("#facility-grid").innerHTML = facilityIds().map(id => {
    const facility = FACILITIES[id];
    const level = state.facilities[id];
    const maxed = level >= FACILITY_MAX_LEVEL;
    const cost = facilityUpgradeCost(id);
    const affordable = canAfford(cost);
    const costText = maxed ? "已满级" : `${cost.grain} 🌾 · ${cost.feather} 🪶${cost.parts ? ` · ${cost.parts} ⚙` : ""}${cost.blueprints ? ` · ${cost.blueprints} 📐` : ""}`;
    const upgradeDescription = maxed ? `${facility.description} · 已达最高等级` : `${facility.description} · 下级 ${facility.effect}`;
    return `<article class="facility-card">
      <div class="facility-card-head"><span aria-hidden="true">${facility.icon}</span><span class="facility-level">Lv.${level}</span></div>
      <h3>${facility.name}</h3>
      <p>${upgradeDescription}</p>
      <div class="facility-effect">${facilityEffectSummary(id)}</div>
      <button data-facility-id="${id}" type="button" ${maxed || !affordable ? "disabled" : ""}>${costText}</button>
    </article>`;
  }).join("");
}

function renderFarm(): void {
  const rates = productionRates();
  const visibleChickens = state.chickens.slice(0, 3);
  $("#coop-flock").innerHTML = visibleChickens.map(chicken => chickenMarkup(chicken, "small")).join("");
  $("#ranch-level").textContent = `牧场 Lv.${ranchLevel()}`;
  $("#flock-summary").textContent = `${state.chickens.length}/${coopCapacity()} 只鸡`;
  $("#bank-grain").textContent = formatNumber(state.bank.grain);
  $("#bank-feather").textContent = formatNumber(state.bank.feather);
  $("#production-rate").textContent = `每分钟生产 ${rates.grain.toFixed(1)} 谷粒 · ${rates.feather.toFixed(1)} 羽毛`;
  $("#collect-button").disabled = state.bank.grain < 1 && state.bank.feather < 1;
  $("#next-egg-copy").textContent = state.resources.eggs > 0 ? `${state.resources.eggs} 枚普通蛋` : "等待探索带蛋回来";
  $("#team-power-copy").textContent = `战力 ${teamPower()}`;
  renderMissions();
  renderAchievements();
  renderFacilities();
  $("#event-list").innerHTML = state.events.map((event, index) => `<li><span>${index + 1}</span>${event}</li>`).join("");
}

function incubationProgress(): number {
  if (!state.incubation) return 0;
  const total = state.incubation.endAt - state.incubation.startedAt;
  return Math.min(1, Math.max(0, (Date.now() - state.incubation.startedAt) / total));
}

function renderHatch(): void {
  const incubation = state.incubation;
  const status = $("#incubator-status");
  const title = $("#incubator-title");
  const description = $("#incubator-description");
  const eggArt = $("#egg-art");
  const progressWrap = $("#incubator-progress-wrap");
  const progress = $("#incubator-progress");
  const openButton = $("#open-egg-button");
  eggArt.className = "egg-art";
  openButton.hidden = true;
  progressWrap.hidden = true;
  if (!incubation) {
    status.textContent = "空闲";
    title.textContent = "孵化位空着";
    description.textContent = "选一枚蛋，看看它准备怎么出场。";
  } else if (Date.now() >= incubation.endAt) {
    status.textContent = "可以破壳";
    title.textContent = "里面已经等不及了";
    description.textContent = "蛋壳正在可疑地晃动。";
    eggArt.classList.add("is-ready");
    openButton.hidden = false;
  } else {
    const left = (incubation.endAt - Date.now()) / 1000;
    status.textContent = formatTime(left);
    title.textContent = incubation.type === "breed" ? "正在组合遗传借口" : "正在认真保温";
    description.textContent = incubation.type === "breed" ? "亲本词条正在努力挤进同一枚蛋。" : "温度正常，蛋的态度不明。";
    eggArt.classList.add("is-running");
    progressWrap.hidden = false;
    progress.style.width = `${incubationProgress() * 100}%`;
  }

  const busy = Boolean(incubation);
  const coopFull = state.chickens.length >= coopCapacity();
  $all<HTMLButtonElement>(".hatch-button").forEach(button => {
    const type = button.dataset.eggType as EggType;
    const lacks = type === "common" ? state.resources.eggs < 1 || state.resources.grain < 20 : state.resources.glowEggs < 1 || state.resources.grain < 50;
    button.disabled = busy || lacks || coopFull;
  });

  const options = state.chickens.map(chicken => `<option value="${chicken.id}">${SPECIES[chicken.species].name} · ${chicken.traits.map(id => TRAITS[id].name).join("/")}</option>`).join("");
  const parentA = $<HTMLSelectElement>("#parent-a");
  const parentB = $<HTMLSelectElement>("#parent-b");
  const lockA = $<HTMLSelectElement>("#lock-a");
  const lockB = $<HTMLSelectElement>("#lock-b");
  const selectedA = parentA.value;
  const selectedB = parentB.value;
  const selectedLockA = lockA.value;
  const selectedLockB = lockB.value;
  parentA.innerHTML = options;
  parentB.innerHTML = options;
  if (selectedA && state.chickens.some(item => item.id === selectedA)) parentA.value = selectedA;
  if (selectedB && state.chickens.some(item => item.id === selectedB)) parentB.value = selectedB;
  if (!selectedB && state.chickens[1]) parentB.value = state.chickens[1].id;
  const chosenA = state.chickens.find(chicken => chicken.id === parentA.value);
  const chosenB = state.chickens.find(chicken => chicken.id === parentB.value);
  const renderLockOptions = (select: HTMLSelectElement, chicken: Chicken | undefined, selected: string): void => {
    select.innerHTML = `<option value="">不锁定</option>${chicken?.traits.map(id => `<option value="${id}">${TRAITS[id].name}</option>`).join("") || ""}`;
    if (chicken?.traits.includes(selected as TraitId)) select.value = selected;
  };
  renderLockOptions(lockA, chosenA, selectedLockA);
  renderLockOptions(lockB, chosenB, selectedLockB);
  const dustCost = breedingLockCost([lockA.value ? lockA.value as TraitId : null, lockB.value ? lockB.value as TraitId : null], TRAIT_LOCK_COST);
  $("#breed-dust-copy").textContent = `${state.resources.geneDust} 🧬 可用`;
  const mutationBonus = (state.facilities.nest - 1) * 0.02;
  const speciesMutationChance = (chosenA?.species === chosenB?.species ? 0.1 : 0.05) + mutationBonus;
  $("#mutation-hint").textContent = chosenA && chosenB
    ? `突变线索：${chosenA.species === chosenB.species ? "同品种亲本更容易出现新品种" : "跨品种更容易稳定继承"} · 品种突变 ${Math.round(speciesMutationChance * 100)}% · 新词条 ${Math.round((0.18 + mutationBonus) * 100)}%`
    : "选择两只亲本后显示突变线索。";
  const breedButton = $("#breed-button");
  breedButton.textContent = `繁育 · 80 🌾 + 12 🪶${dustCost ? ` + ${dustCost} 🧬` : ""}`;
  breedButton.disabled = busy || coopFull || state.chickens.length < 2 || !chosenA || !chosenB || chosenA.id === chosenB.id || state.resources.grain < 80 || state.resources.feather < 12 || state.resources.geneDust < dustCost;
}

function renderFlock(): void {
  $("#team-count").textContent = `编队 ${state.team.length}/3`;
  [...conversionSelection].forEach(id => {
    const chicken = state.chickens.find(item => item.id === id);
    if (!chicken || conversionProtected(chicken)) conversionSelection.delete(id);
  });
  $all<HTMLButtonElement>("[data-flock-mode]").forEach(button => {
    const active = button.dataset.flockMode === flockMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const management = $("#flock-management");
  const flockGrid = $("#flock-grid");
  const codexPanel = $("#codex-panel");
  management.hidden = flockMode !== "chickens";
  flockGrid.hidden = flockMode !== "chickens";
  codexPanel.hidden = flockMode !== "codex";
  renderCodex();
  if (flockMode === "codex") return;

  const selectedChickens = state.chickens.filter(chicken => conversionSelection.has(chicken.id) && !conversionProtected(chicken));
  const selectedDust = selectedChickens.reduce((sum, chicken) => sum + conversionDust(chicken), 0);
  $("#conversion-mode-button").textContent = conversionMode ? "退出选择" : "选择转化";
  $("#conversion-summary").textContent = conversionMode ? `已选 ${selectedChickens.length} 只 · 可得 ${selectedDust} 粉尘` : "选择鸡只进行手动转化";
  $("#conversion-hint").textContent = conversionMode ? "转化前仍需二次确认" : "编队或繁育中的鸡会受到保护";
  $("#convert-selected-button").hidden = !conversionMode;
  $("#convert-selected-button").disabled = !selectedChickens.length || state.chickens.length - selectedChickens.length < 2;
  $("#flock-grid").innerHTML = state.chickens.map(chicken => {
    const species = SPECIES[chicken.species];
    const inTeam = state.team.includes(chicken.id);
    const selected = conversionSelection.has(chicken.id);
    const protectedChicken = conversionProtected(chicken);
    const primaryControl = conversionMode
      ? `<label class="convert-check ${protectedChicken ? "is-protected" : ""}"><input data-convert-chicken-id="${chicken.id}" type="checkbox" aria-label="${protectedChicken ? `${species.name}受保护，不能转化` : `选择${species.name}转化`}" ${selected ? "checked" : ""} ${protectedChicken ? "disabled" : ""}>${protectedChicken ? "保护中" : `${conversionDust(chicken)} 🧬`}</label>`
      : `<button class="team-toggle" data-chicken-id="${chicken.id}" type="button">${inTeam ? "撤回鸡舍" : "加入编队"}</button>`;
    return `<article class="chicken-card ${inTeam ? "is-teammate" : ""} ${selected ? "is-selected" : ""}">
      <div class="chicken-card-visual">${chickenMarkup(chicken, "small")}</div>
      <div class="chicken-card-body">
        <div class="chicken-card-title"><h2>${species.name}</h2><span class="rarity">${species.rarity}</span></div>
        <div class="stat-line"><span>战力 ${chickenPower(chicken)}</span><span>第 ${chicken.generation} 代</span></div>
        <div class="role-line"><span>${chickenFocus(chicken)}</span><span>${species.workRole}</span><span>${species.battleRole}</span></div>
        <div class="trait-list">${chicken.traits.map(id => `<span class="trait">${TRAITS[id].name}</span>`).join("")}</div>
        <div class="card-actions"><button class="detail-button" data-detail-chicken-id="${chicken.id}" type="button" aria-label="查看${species.name}档案" title="鸡只档案">ⓘ</button>${primaryControl}</div>
      </div>
    </article>`;
  }).join("");
}

function renderCodex(): void {
  const speciesIds = Object.keys(SPECIES) as SpeciesId[];
  const traitIds = Object.keys(TRAITS) as TraitId[];
  const completion = codexCompletion({
    discoveredSpecies: state.discovery.species.length,
    totalSpecies: speciesIds.length,
    discoveredTraits: state.discovery.traits.length,
    totalTraits: traitIds.length
  });
  const nextSpecies = speciesIds.find(id => !state.discovery.species.includes(id));
  const nextTrait = traitIds.find(id => !state.discovery.traits.includes(id));
  const nextHint = completion.percent === 100
    ? "所有品种和词条都已记录，图鉴完整。"
    : nextSpecies
      ? `${SPECIES[nextSpecies].rarity}品种仍有空缺，闪光蛋与繁育更容易带来新发现。`
      : nextTrait
        ? `还差 ${completion.totalTraits - completion.discoveredTraits} 个词条，通过孵化与突变继续发现。`
        : "继续培养鸡群，寻找新的记录。";
  $("#codex-overview").innerHTML = `<div class="codex-completion-copy"><div><span class="eyebrow">收集进度</span><strong>${completion.percent}%</strong></div><span>${completion.tier}</span></div>
    <div class="codex-completion-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion.percent}"><span style="width:${completion.percent}%"></span></div>
    <div class="codex-completion-stats"><span><strong>${completion.discoveredSpecies}/${completion.totalSpecies}</strong> 品种</span><span><strong>${completion.discoveredTraits}/${completion.totalTraits}</strong> 词条</span><p>${nextHint}</p></div>`;
  $("#species-codex-summary").textContent = `${state.discovery.species.length}/${speciesIds.length} 已发现`;
  $("#trait-codex-summary").textContent = `${state.discovery.traits.length}/${traitIds.length} 已发现`;
  $("#species-codex").innerHTML = speciesIds.map(id => {
    const discovered = state.discovery.species.includes(id);
    if (!discovered) return `<article class="codex-entry is-unknown"><div><strong>未发现</strong><p>继续孵化或繁育</p></div></article>`;
    const species = SPECIES[id];
    const held = state.chickens.filter(chicken => chicken.species === id).length;
    return `<article class="codex-entry"><h3>${species.accessory} ${species.name}</h3><p>${species.rarity} · ${species.workRole} · ${species.battleRole}</p><strong>当前持有 ${held} 只</strong></article>`;
  }).join("");
  $("#trait-codex").innerHTML = traitIds.map(id => {
    const discovered = state.discovery.traits.includes(id);
    const trait = TRAITS[id];
    return `<article class="trait-codex-entry ${discovered ? "" : "is-unknown"}"><strong>${discovered ? trait.name : "未知词条"}</strong><small>${discovered ? `${trait.category} · ${trait.description}` : "通过孵化与突变发现"}</small></article>`;
  }).join("");
}

function showChickenDetail(chickenId: string): void {
  const chicken = state.chickens.find(item => item.id === chickenId);
  if (!chicken) return;
  const species = SPECIES[chicken.species];
  const children = state.chickens.filter(item => item.lineage?.some(parent => parent.id === chicken.id));
  const parents = chicken.lineage
    ? chicken.lineage.map(parent => `${SPECIES[parent.species].name}（第 ${parent.generation} 代 · ${parent.traits.map(id => TRAITS[id].name).join("/") || "无记录"}）`).join("；")
    : "初代或来源未记录";
  const mutationParts = [chicken.mutation?.speciesChanged ? "品种突变" : "", chicken.mutation?.trait ? `新词条「${TRAITS[chicken.mutation.trait].name}」` : ""].filter(Boolean);
  $("#detail-chicken").innerHTML = chickenMarkup(chicken);
  $("#detail-name").textContent = species.name;
  $("#detail-summary").textContent = `${species.rarity} · 第 ${chicken.generation} 代 · ${chickenFocus(chicken)}`;
  $("#detail-roles").textContent = `${species.workRole}：${chickenProductionSummary(chicken)}；${species.battleRole}：当前战力 ${chickenPower(chicken)}`;
  $("#detail-traits").innerHTML = chicken.traits.map(id => `<span class="trait" title="${TRAITS[id].description}">${TRAITS[id].name} · ${TRAITS[id].category}</span>`).join("");
  $("#detail-lineage").textContent = `亲本：${parents}。当前可追踪后代 ${children.length} 只。${mutationParts.length ? `突变记录：${mutationParts.join("、")}。` : "未记录到突变。"}`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
}

function explorationModifierSummary(modifiers: ExplorationModifiers): string {
  const parts = [
    modifiers.moveSpeed > 0 ? `移速 +${Math.round(modifiers.moveSpeed * 100)}%` : "",
    modifiers.collectionEfficiency > 0 ? `采集 +${Math.round(modifiers.collectionEfficiency * 100)}%` : "",
    modifiers.fatigueReduction > 0 ? `体力消耗 -${modifiers.fatigueReduction}` : "",
    modifiers.battleRating > 0 ? `战斗 +${modifiers.battleRating}` : ""
  ].filter(Boolean);
  return parts.join(" · ") || "无额外修正";
}

function renderExpeditionSupplies(): void {
  if (!state.exploration && !canAfford(EXPEDITION_SUPPLIES[selectedSupplyId].cost)) selectedSupplyId = "none";
  const selectedId = state.exploration?.supplyId || selectedSupplyId;
  const currentModifiers = state.exploration?.modifiers || explorationModifiers(state.team, selectedId);
  $<HTMLFieldSetElement>("#supply-stage").disabled = Boolean(state.exploration);
  $("#supply-modifier-summary").textContent = `出发修正：${explorationModifierSummary(currentModifiers)}`;
  $("#supply-options").innerHTML = (Object.keys(EXPEDITION_SUPPLIES) as ExpeditionSupplyId[]).map(id => {
    const supply = EXPEDITION_SUPPLIES[id];
    const affordable = id === "none" || canAfford(supply.cost);
    const selected = id === selectedId;
    const cost = rewardLabel(supply.cost) || "免费";
    return `<label class="supply-option ${selected ? "is-selected" : ""} ${affordable ? "" : "is-disabled"}">
      <input type="radio" name="expedition-supply" value="${id}" ${selected ? "checked" : ""} ${!affordable ? "disabled" : ""}>
      <span class="supply-icon" aria-hidden="true">${supply.icon}</span>
      <span class="supply-copy"><strong>${supply.name}</strong><small>${supply.description}<br><span class="supply-cost">${cost}</span></small></span>
    </label>`;
  }).join("");
}

function renderExplore(): void {
  const power = teamPower();
  renderExpeditionSupplies();
  const currentModifiers = explorationModifiers(state.team, selectedSupplyId);
  $("#team-power").textContent = `战力 ${power} · 减耗 ${currentModifiers.fatigueReduction}`;
  const teamChickens = state.team.map(id => state.chickens.find(chicken => chicken.id === id)).filter(Boolean);
  $("#team-slots").innerHTML = [0, 1, 2].map(index => {
    const chicken = teamChickens[index];
    return chicken ? `<div class="team-slot">${chickenMarkup(chicken, "mini")}<strong>${SPECIES[chicken.species].name}</strong></div>` : `<button class="team-slot" data-go-flock type="button">空位<br>去编队</button>`;
  }).join("");

  const active = $("#expedition-active");
  if (state.exploration) {
    const exploration = state.exploration;
    const zone = getZone(exploration.zoneId);
    const node = getRouteNode(exploration.zoneId, exploration.currentNodeId);
    const phaseLabels: Record<ExplorationPhase, string> = { moving: "移动中", collecting: "采集中", fighting: "战斗中" };
    const total = exploration.endAt - exploration.startedAt;
    const ratio = Math.min(1, Math.max(0, (Date.now() - exploration.startedAt) / total));
    active.hidden = false;
    $("#explore-status").textContent = phaseLabels[exploration.phase];
    $("#expedition-phase").textContent = phaseLabels[exploration.phase];
    $("#expedition-name").textContent = `${zone.name} · ${node.name}`;
    $("#expedition-time").textContent = `${formatTime((exploration.endAt - Date.now()) / 1000)} 后${exploration.phase === "moving" ? "抵达" : "完成"}`;
    $("#expedition-move-speed").textContent = `移速 +${Math.round(exploration.modifiers.moveSpeed * 100)}%`;
    $("#expedition-stamina").textContent = `体力 ${exploration.stamina} · ${staminaState(exploration.stamina)}`;
    $("#expedition-stamina-bar").style.width = `${exploration.stamina}%`;
    const activeSupply = EXPEDITION_SUPPLIES[exploration.supplyId];
    $("#expedition-supply").textContent = `补给：${activeSupply.name} · 当前修正：${explorationModifierSummary(exploration.modifiers)}`;
    $("#expedition-progress").style.width = `${ratio * 100}%`;
    $("#expedition-node-copy").textContent = node.description;
    const cargo = cargoLabels(exploration.cargo);
    $("#expedition-cargo").textContent = cargo.length ? `行囊：${cargo.join(" · ")}` : "行囊为空";
    $("#expedition-route").innerHTML = zone.nodes.map(routeNode => {
      const classes = ["route-step"];
      if (exploration.visited.includes(routeNode.id)) classes.push("is-complete");
      if (routeNode.id === exploration.currentNodeId) classes.push("is-current");
      return `<span class="${classes.join(" ")}" title="${routeNode.description}"><span aria-hidden="true">${routeNode.icon}</span>${routeNode.name}</span>`;
    }).join("");
    const eventPanel = $("#expedition-event");
    eventPanel.hidden = !exploration.eventSummary;
    $("#expedition-event-copy").textContent = exploration.eventSummary || "";
    const bossPanel = $("#boss-trait");
    bossPanel.hidden = !node.boss;
    if (node.boss) {
      const advantage = bossAdvantage(node.boss, exploration.teamIds);
      $("#boss-trait-name").textContent = `首领特性 · ${node.boss.name}`;
      $("#boss-trait-copy").textContent = `${node.boss.description}${advantage ? `${advantage}可以克制该特性。` : "当前队伍没有匹配的克制能力。"}`;
    }
    $("#expedition-log").innerHTML = exploration.log.slice(-5).map(item => `<li>${item}</li>`).join("");
  } else {
    active.hidden = true;
    $("#explore-status").textContent = "待命";
  }

  const resultPanel = $("#expedition-result");
  const lastResult = state.lastExpedition;
  if (lastResult) {
    const zone = getZone(lastResult.zoneId);
    resultPanel.hidden = false;
    $("#expedition-result-title").textContent = zone.name;
    const resultStatus = $("#expedition-result-status");
    resultStatus.textContent = lastResult.success ? "探索成功" : "收队返回";
    resultStatus.classList.toggle("is-failure", !lastResult.success);
    $("#expedition-result-rewards").textContent = `带回：${lastResult.rewards.join(" · ") || "没有资源"}`;
    $("#expedition-result-stamina").textContent = `剩余体力 ${lastResult.remainingStamina} · ${staminaState(lastResult.remainingStamina)}`;
    $("#expedition-result-supply").textContent = lastResult.supplySummary || "补给：轻装出发";
    const resultEvent = $("#expedition-result-event");
    resultEvent.hidden = !lastResult.eventSummary;
    $("#expedition-result-event-copy").textContent = lastResult.eventSummary || "";
    const resultBoss = $("#expedition-result-boss");
    resultBoss.hidden = !lastResult.bossSummary;
    $("#expedition-result-boss-copy").textContent = lastResult.bossSummary || "";
    $("#expedition-result-log").innerHTML = lastResult.log.slice(-5).map(item => `<li>${item}</li>`).join("");
  } else {
    resultPanel.hidden = true;
  }

  $("#zone-list").innerHTML = ZONES.map(zone => `<article class="zone-card">
    <div class="zone-art" aria-hidden="true">${zone.icon}</div>
    <div><h3>${zone.name}</h3><p>约 ${zone.duration} 秒 · 4 个节点 · 建议战力 ${zone.recommended}<br>${zone.reward} · 首领「${zone.nodes.find(node => node.boss)?.boss?.name || "未知"}」</p></div>
    <button class="secondary-action zone-button" data-zone-id="${zone.id}" type="button" ${state.exploration || state.team.length === 0 ? "disabled" : ""}>出发</button>
  </article>`).join("");
}

function render(): void {
  renderResources();
  renderFarm();
  renderHatch();
  renderFlock();
  renderExplore();
}

function createHatchResult(type: EggType): Chicken {
  return makeChicken(weightedSpecies(type), undefined, 1);
}

function createBreedResult(parentA: Chicken, parentB: Chicken, lockedA: TraitId | null, lockedB: TraitId | null): Chicken {
  let species = Math.random() < 0.5 ? parentA.species : parentB.species;
  const mutationBonus = (state.facilities.nest - 1) * 0.02;
  if (Math.random() < (parentA.species === parentB.species ? 0.1 : 0.05) + mutationBonus) species = weightedSpecies("glow");
  const lockedTraits = [lockedA, lockedB].filter((trait): trait is TraitId => Boolean(trait));
  const inherited = [...new Set(lockedTraits)];
  [...parentA.traits, ...parentB.traits].filter(trait => !inherited.includes(trait)).forEach(trait => {
    if (inherited.length < 3 && Math.random() < breedingInheritanceChance()) inherited.push(trait);
  });
  if (!inherited.length) inherited.push(randomItem([...parentA.traits, ...parentB.traits]));
  const parentTraits = new Set([...parentA.traits, ...parentB.traits]);
  let mutationTrait: TraitId | undefined;
  if (Math.random() < 0.18 + mutationBonus && inherited.length < 3) {
    const candidates = (Object.keys(TRAITS) as TraitId[]).filter(id => !parentTraits.has(id));
    mutationTrait = randomItem(candidates.length ? candidates : Object.keys(TRAITS) as TraitId[]);
    if (!inherited.includes(mutationTrait)) inherited.push(mutationTrait);
  }
  const result = makeChicken(species, inherited, Math.max(parentA.generation, parentB.generation) + 1);
  result.lineage = [lineageSnapshot(parentA), lineageSnapshot(parentB)];
  result.mutation = { speciesChanged: species !== parentA.species && species !== parentB.species, trait: mutationTrait };
  return result;
}

function startHatch(type: EggType): void {
  if (state.incubation) return;
  if (state.chickens.length >= coopCapacity()) return showToast("鸡舍已经住满，先扩建再孵蛋。");
  const isCommon = type === "common";
  const grainCost = isCommon ? 20 : 50;
  const eggKey = isCommon ? "eggs" : "glowEggs";
  if (state.resources[eggKey] < 1 || state.resources.grain < grainCost) return showToast("蛋箱或谷粒不够。鸡表示理解。");
  state.resources[eggKey] -= 1;
  state.resources.grain -= grainCost;
  const startedAt = Date.now();
  const duration = incubationDurationMs(type, state.facilities.incubator);
  state.incubation = { type, startedAt, endAt: startedAt + duration, result: createHatchResult(type) };
  addEvent(`${isCommon ? "谷仓蛋" : "闪光蛋"}进入了孵化器。`);
  saveState();
  render();
}

function startBreeding(): void {
  if (state.incubation) return;
  if (state.chickens.length >= coopCapacity()) return showToast("鸡舍没有空位安置后代。");
  const a = state.chickens.find(chicken => chicken.id === $<HTMLSelectElement>("#parent-a").value);
  const b = state.chickens.find(chicken => chicken.id === $<HTMLSelectElement>("#parent-b").value);
  if (!a || !b || a.id === b.id) return showToast("请选择两只不同的亲本。");
  const lockedA = lockedTraitFor("#lock-a", a);
  const lockedB = lockedTraitFor("#lock-b", b);
  const dustCost = breedingLockCost([lockedA, lockedB], TRAIT_LOCK_COST);
  if (state.resources.grain < 80 || state.resources.feather < 12) return showToast("繁育窝的伙食费还没凑齐。");
  if (state.resources.geneDust < dustCost) return showToast("基因粉尘不够，先手动转化一只鸡吧。");
  state.resources.grain -= 80;
  state.resources.feather -= 12;
  state.resources.geneDust -= dustCost;
  const startedAt = Date.now();
  const duration = incubationDurationMs("breed", state.facilities.incubator);
  state.incubation = { type: "breed", startedAt, endAt: startedAt + duration, result: createBreedResult(a, b, lockedA, lockedB), parents: [a.id, b.id] };
  addEvent(`${SPECIES[a.species].name}和${SPECIES[b.species].name}留下了一枚态度复杂的蛋。`);
  saveState();
  render();
}

function openEgg(): void {
  if (!state.incubation || Date.now() < state.incubation.endAt) return;
  const incubationType = state.incubation.type;
  const chicken = state.incubation.result;
  state.chickens.push(chicken);
  recordDiscovery(chicken);
  state.stats.hatched += 1;
  if (incubationType === "breed") state.stats.bred += 1;
  state.incubation = null;
  addEvent(`${SPECIES[chicken.species].name}破壳后先检查了一下伙食。`);
  $("#reveal-chicken").innerHTML = chickenMarkup(chicken);
  $("#reveal-name").textContent = SPECIES[chicken.species].name;
  const mutationCopy = [chicken.mutation?.speciesChanged ? "品种突变" : "", chicken.mutation?.trait ? `新词条：${TRAITS[chicken.mutation.trait].name}` : ""].filter(Boolean);
  $("#reveal-traits").textContent = `词条：${chicken.traits.map(id => TRAITS[id].name).join(" · ")} · 第 ${chicken.generation} 代${mutationCopy.length ? ` · ${mutationCopy.join(" · ")}` : ""}`;
  $<HTMLDialogElement>("#reveal-dialog").showModal();
  saveState();
  render();
}

function toggleTeam(chickenId: string): void {
  if (state.exploration) return showToast("探索中的小队不能临时换鸡。");
  if (state.team.includes(chickenId)) {
    state.team = state.team.filter(id => id !== chickenId);
  } else if (state.team.length >= 3) {
    return showToast("出门小队最多三只鸡。");
  } else {
    state.team.push(chickenId);
  }
  saveState();
  render();
}

function toggleFlockMode(mode: FlockMode): void {
  flockMode = mode;
  if (mode === "codex") conversionMode = false;
  render();
}

function toggleConversionMode(): void {
  conversionMode = !conversionMode;
  if (!conversionMode) conversionSelection.clear();
  render();
}

function toggleConversionSelection(chickenId: string, selected: boolean): void {
  const chicken = state.chickens.find(item => item.id === chickenId);
  if (!chicken || conversionProtected(chicken)) return;
  if (selected) conversionSelection.add(chickenId);
  else conversionSelection.delete(chickenId);
  render();
}

function openConversionDialog(): void {
  const selected = state.chickens.filter(chicken => conversionSelection.has(chicken.id) && !conversionProtected(chicken));
  if (!selected.length) return showToast("先选择要转化的鸡只。");
  if (!canConvertSelection(state.chickens.length, selected.length)) return showToast("至少保留两只鸡，避免牧场失去繁育能力。");
  const dust = selected.reduce((sum, chicken) => sum + conversionDust(chicken), 0);
  $("#convert-dialog-copy").textContent = `这一步不可撤销，将移除所选鸡只并获得 ${dust} 🧬。系统不会自动替你选择。`;
  $("#convert-dialog-list").innerHTML = selected.map(chicken => `<li>${SPECIES[chicken.species].name} · 第 ${chicken.generation} 代 · ${conversionDust(chicken)} 🧬</li>`).join("");
  $<HTMLDialogElement>("#convert-dialog").showModal();
}

function confirmConversion(): void {
  const selected = state.chickens.filter(chicken => conversionSelection.has(chicken.id) && !conversionProtected(chicken));
  if (!canConvertSelection(state.chickens.length, selected.length)) {
    $<HTMLDialogElement>("#convert-dialog").close();
    return showToast("转化条件已变化，请重新选择鸡只。");
  }
  const dust = selected.reduce((sum, chicken) => sum + conversionDust(chicken), 0);
  const selectedIds = new Set(selected.map(chicken => chicken.id));
  state.chickens = state.chickens.filter(chicken => !selectedIds.has(chicken.id));
  state.resources.geneDust += dust;
  conversionSelection.clear();
  conversionMode = false;
  addEvent(`玩家手动将 ${selected.length} 只鸡转化为 ${dust} 点基因粉尘。`);
  $<HTMLDialogElement>("#convert-dialog").close();
  showToast(`获得 ${dust} 点基因粉尘。`);
  saveState();
  render();
}

function startExpedition(zoneId: ZoneId): void {
  if (state.exploration || state.team.length === 0) return;
  const zone = getZone(zoneId);
  const firstNode = zone.nodes[0]!;
  const supplyId = selectedSupplyId;
  const supply = EXPEDITION_SUPPLIES[supplyId];
  if (!canAfford(supply.cost)) {
    selectedSupplyId = "none";
    render();
    return showToast("补给所需资源不足，请重新选择。");
  }
  const modifiers = explorationModifiers(state.team, supplyId);
  const now = Date.now();
  spendResources(supply.cost);
  state.lastExpedition = null;
  state.exploration = {
    zoneId,
    teamIds: [...state.team],
    power: teamPower(),
    phase: "moving",
    currentNodeId: firstNode.id,
    startedAt: now,
    endAt: now + travelDuration(firstNode, modifiers.moveSpeed) * 1000,
    visited: [],
    cargo: emptyCargo(),
    log: [`携带${supply.name}离开牧场，前往${firstNode.name}。`],
    failedBattles: 0,
    supplyId,
    modifiers,
    eventResolved: false,
    eventSummary: null,
    stamina: 100
  };
  addEvent(`小队携带${supply.name}前往${zone.name}，开始按节点推进。`);
  saveState();
  render();
}

function randomRange([min, max]: readonly [number, number]): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function rollNodeReward(node: RouteNode, multiplier: number): ExpeditionCargo {
  const reward = emptyCargo();
  if (node.reward.grain) reward.grain = Math.floor(randomRange(node.reward.grain) * multiplier);
  if (node.reward.feather) reward.feather = Math.floor(randomRange(node.reward.feather) * multiplier);
  if (node.reward.parts) reward.parts = Math.floor(randomRange(node.reward.parts) * multiplier);
  if (Math.random() < (node.reward.eggChance || 0) * multiplier) reward.eggs = 1;
  if (Math.random() < (node.reward.glowChance || 0) * multiplier) reward.glowEggs = 1;
  return reward;
}

function resolveExplorationEvent(exploration: Exploration): void {
  const event = randomItem(EXPLORATION_EVENTS[exploration.zoneId]);
  const advantage = eventAdvantage(event, exploration.teamIds);
  const reward = cargoFromPartial(event.baseReward);
  if (advantage) mergeCargo(reward, cargoFromPartial(event.bonusReward));
  mergeCargo(exploration.cargo, reward);
  const moveSpeed = event.baseMoveSpeed + (advantage ? event.bonusMoveSpeed : 0);
  exploration.modifiers.moveSpeed = Math.min(1, exploration.modifiers.moveSpeed + moveSpeed);
  const effects = cargoLabels(reward);
  if (moveSpeed) effects.push(`余程移速 +${Math.round(moveSpeed * 100)}%`);
  const summary = `「${event.title}」${event.description}${advantage ? `${advantage}发挥作用` : "小队按常规方式处理"}，${effects.join("、") || "没有额外收获"}。`;
  exploration.eventResolved = true;
  exploration.eventSummary = summary;
  exploration.log.push(`区域事件：${summary}`);
  exploration.log = exploration.log.slice(-8);
}

function beginTravel(exploration: Exploration, nodeId: string, now: number): void {
  const node = getRouteNode(exploration.zoneId, nodeId);
  exploration.phase = "moving";
  exploration.currentNodeId = node.id;
  exploration.startedAt = now;
  exploration.endAt = now + travelDuration(node, exploration.modifiers.moveSpeed) * 1000;
  exploration.log.push(`继续移动，前往${node.name}。`);
  exploration.log = exploration.log.slice(-8);
}

function finishExpedition(exploration: Exploration, success: boolean, bossSummary: string | null): void {
  const zone = getZone(exploration.zoneId);
  const supply = EXPEDITION_SUPPLIES[exploration.supplyId];
  const rewards = cargoLabels(exploration.cargo);
  addResources(exploration.cargo);
  state.lastExpedition = {
    zoneId: zone.id,
    success,
    rewards,
    log: [...exploration.log].slice(-8),
    eventSummary: exploration.eventSummary,
    remainingStamina: exploration.stamina,
    bossSummary,
    supplySummary: `补给：${supply.name} · 最终修正：${explorationModifierSummary(exploration.modifiers)}`
  };
  state.exploration = null;
  selectedSupplyId = "none";
  state.stats.explored += 1;
  addEvent(`${zone.name}${success ? "路线完成" : "收队返回"}：${rewards.join("、") || "没有带回资源"}。`);
  showToast(`${success ? "探索完成" : "小队收队"}：${rewards.join("、") || "未获得资源"}`);
}

function resolveRouteNode(exploration: Exploration, node: RouteNode, transitionAt: number): void {
  let success = true;
  let bossSummary: string | null = null;
  let multiplier = node.kind === "collect" ? collectionMultiplier(exploration, node) : 1;
  if (node.kind === "battle") {
    const staminaPenalty = exploration.stamina >= 50 ? 0 : Math.ceil((50 - exploration.stamina) / 5);
    const advantage = node.boss ? bossAdvantage(node.boss, exploration.teamIds) : null;
    const effectiveThreat = Math.max(1, node.recommended - (advantage && node.boss ? node.boss.threatReduction : 0));
    const battleRating = exploration.power + exploration.modifiers.battleRating - staminaPenalty;
    const chance = Math.max(0.3, Math.min(0.95, 0.62 + (battleRating - effectiveThreat) / 70));
    success = Math.random() < chance;
    multiplier = success ? 1 : 0.35;
    if (!success) exploration.failedBattles += 1;
    const actionCost = spendStamina(exploration, node.boss ? 16 : 10, advantage && node.boss ? node.boss.staminaReduction : 0);
    const failureCost = success ? 0 : spendStamina(exploration, 8);
    if (node.boss) {
      bossSummary = `「${node.boss.name}」${node.boss.description}${advantage ? `${advantage}完成克制，威胁 -${node.boss.threatReduction}、体力消耗 -${node.boss.staminaReduction}` : "当前队伍未形成克制"}。`;
      exploration.log.push(`首领特性：${bossSummary}`);
      if (success) {
        exploration.cargo.blueprints += node.boss.blueprintReward;
        exploration.log.push(`从首领据点找到 ${node.boss.blueprintReward} 张设施图纸。`);
      }
    }
    exploration.log.push(`${node.name}${success ? "战斗胜利" : "战斗失利"}（评分 ${battleRating} / 威胁 ${effectiveThreat} · 胜率 ${Math.round(chance * 100)}% · 体力 -${actionCost + failureCost}）。`);
  } else {
    const actionCost = spendStamina(exploration, 5);
    const efficiency = Math.round((multiplier - 1) * 100);
    exploration.log.push(`${node.name}采集完成（队伍效率 ${efficiency >= 0 ? "+" : ""}${efficiency}% · 体力 -${actionCost}）。`);
  }

  const reward = rollNodeReward(node, multiplier);
  mergeCargo(exploration.cargo, reward);
  const rewardCopy = cargoLabels(reward).join("、");
  if (rewardCopy) exploration.log.push(`装入行囊：${rewardCopy}。`);
  exploration.visited = [...new Set([...exploration.visited, node.id])];
  exploration.log = exploration.log.slice(-8);

  if (!exploration.eventResolved && node.next.length) resolveExplorationEvent(exploration);

  if (!node.next.length) {
    finishExpedition(exploration, success, bossSummary);
  } else {
    const nextNodeId = automaticNextNodeId(exploration.zoneId, node.id, exploration.power, exploration.modifiers.battleRating);
    const nextNode = getRouteNode(exploration.zoneId, nextNodeId);
    if (node.next.length > 1) exploration.log.push(`队伍自动选择${nextNode.name}。`);
    beginTravel(exploration, nextNode.id, transitionAt);
  }
}

function advanceExploration(now = Date.now()): void {
  let changed = false;
  let transitions = 0;
  while (state.exploration && now >= state.exploration.endAt && transitions < 16) {
    const exploration = state.exploration;
    const node = getRouteNode(exploration.zoneId, exploration.currentNodeId);
    const transitionAt = exploration.endAt;
    if (exploration.phase === "moving") {
      const travelCost = spendStamina(exploration, Math.max(2, Math.ceil(node.travelSeconds / 2)));
      exploration.phase = actionPhase(node);
      exploration.startedAt = transitionAt;
      exploration.endAt = actionEndAt(node, transitionAt);
      exploration.log.push(`抵达${node.name}，移动消耗 ${travelCost} 体力，开始${node.kind === "collect" ? "采集" : "战斗"}。`);
      exploration.log = exploration.log.slice(-8);
    } else {
      resolveRouteNode(exploration, node, transitionAt);
    }
    changed = true;
    transitions += 1;
  }
  if (changed) saveState();
}

function upgradeFacility(id: FacilityId): void {
  const level = state.facilities[id];
  if (level >= FACILITY_MAX_LEVEL) return;
  const cost = facilityUpgradeCost(id);
  if (!canAfford(cost)) {
    return showToast(cost.blueprints > state.resources.blueprints ? "设施图纸还不够，击败探索首领可以找到图纸。" : "零件或资源还不够，先去探索一趟吧。");
  }
  spendResources(cost);
  state.facilities[id] += 1;
  addEvent(`${FACILITIES[id].name}升级到 Lv.${state.facilities[id]}，鸡群假装很专业。`);
  showToast(`${FACILITIES[id].name}升级完成：${facilityEffectSummary(id)}`);
  saveState();
  render();
}

function claimMission(id: MissionId): void {
  const missionIndex = MISSIONS.findIndex(item => item.id === id);
  const mission = MISSIONS[missionIndex];
  if (!mission || !mainQuestUnlocked(missionIndex, mainQuestProgress()) || state.missions[id].claimed || missionProgress(id) < mission.target) return;
  state.missions[id].claimed = true;
  addResources(mission.reward);
  addEvent(`完成手册目标「${mission.title}」，获得 ${rewardLabel(mission.reward)}。`);
  showToast(`领取奖励：${rewardLabel(mission.reward)}`);
  saveState();
  render();
}

function collectBank(): void {
  const grain = Math.floor(state.bank.grain);
  const feather = Math.floor(state.bank.feather);
  if (!grain && !feather) return;
  state.resources.grain += grain;
  state.resources.feather += feather;
  state.stats.collected += grain + feather;
  state.bank.grain -= grain;
  state.bank.feather -= feather;
  if (Math.random() < 0.3) addEvent(randomItem(SAMPLE_EVENTS));
  showToast(`收取 ${grain} 谷粒 · ${feather} 羽毛`);
  saveState();
  render();
}

function backupLabel(): string {
  const serialized = localStorage.getItem(BACKUP_STORAGE_KEY);
  if (!serialized) return "暂无备份";
  try {
    parseSaveFile(serialized);
    const timestamp = saveFileTimestamp(serialized);
    return timestamp ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : "可恢复";
  } catch {
    return "备份已损坏";
  }
}

function renderSaveManager(): void {
  const label = backupLabel();
  $("#backup-status").textContent = label;
  $("#restore-backup-button").disabled = label === "暂无备份" || label === "备份已损坏";
}

function openSaveManager(): void {
  renderSaveManager();
  $<HTMLDialogElement>("#save-dialog").showModal();
}

function exportSave(): void {
  saveState();
  const file = createSaveFile(state);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chicken-lab-save-${file.exportedAt.slice(0, 10)}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("存档已导出。请妥善保管 JSON 文件。");
}

async function importSave(file: File): Promise<void> {
  try {
    const parsed = parseSaveFile(await file.text());
    const imported = normalizeState(parsed);
    if (!window.confirm(`导入后将覆盖当前牧场。文件中有 ${imported.chickens.length} 只鸡，确定继续吗？`)) return;
    backupCurrentSave();
    state = imported;
    state.lastTick = Date.now();
    persistState(state, false);
    conversionMode = false;
    conversionSelection.clear();
    selectedSupplyId = "none";
    flockMode = "chickens";
    render();
    renderSaveManager();
    showToast("存档导入成功，原进度已保存在本地备份中。");
  } catch (error) {
    showToast(error instanceof Error ? `导入失败：${error.message}` : "导入失败：文件无法读取。");
  }
}

function restoreBackup(): void {
  const serialized = localStorage.getItem(BACKUP_STORAGE_KEY);
  if (!serialized) return showToast("当前没有可恢复的本地备份。");
  try {
    const restored = normalizeState(parseSaveFile(serialized));
    if (!window.confirm(`将恢复备份中的 ${restored.chickens.length} 只鸡，并覆盖当前进度。确定继续吗？`)) return;
    const current = localStorage.getItem(STORAGE_KEY);
    state = restored;
    state.lastTick = Date.now();
    persistState(state, false);
    if (current) backupSerializedSave(current);
    conversionMode = false;
    conversionSelection.clear();
    selectedSupplyId = "none";
    flockMode = "chickens";
    render();
    renderSaveManager();
    showToast("已恢复本地备份，恢复前进度也已保留为备份。");
  } catch (error) {
    showToast(error instanceof Error ? `恢复失败：${error.message}` : "恢复失败：备份无法读取。");
  }
}

function handleOfflineProgress(): void {
  const now = Date.now();
  const elapsed = offlineElapsedSeconds(now, state.lastTick || now, offlineCapSeconds());
  if (elapsed > 3) {
    const before = { ...state.bank };
    applyProduction(elapsed);
    const grain = Math.floor(state.bank.grain - before.grain);
    const feather = Math.floor(state.bank.feather - before.feather);
    if (elapsed > 30) setTimeout(() => showToast(`离线期间积攒 ${grain} 谷粒 · ${feather} 羽毛`), 350);
  }
  state.lastTick = now;
  advanceExploration(now);
  saveState();
}

$all<HTMLButtonElement>(".nav-button").forEach(button => button.addEventListener("click", () => switchView(button.dataset.target as ViewId)));
$("#collect-button").addEventListener("click", collectBank);
$all<HTMLButtonElement>(".hatch-button").forEach(button => button.addEventListener("click", () => startHatch(button.dataset.eggType as EggType)));
$("#breed-button").addEventListener("click", startBreeding);
["#parent-a", "#parent-b", "#lock-a", "#lock-b"].forEach(selector => $(selector).addEventListener("change", renderHatch));
$("#open-egg-button").addEventListener("click", openEgg);
$("#reveal-close").addEventListener("click", () => $<HTMLDialogElement>("#reveal-dialog").close());
$("#detail-close").addEventListener("click", () => $<HTMLDialogElement>("#detail-dialog").close());
$all<HTMLButtonElement>("[data-flock-mode]").forEach(button => button.addEventListener("click", () => toggleFlockMode(button.dataset.flockMode as FlockMode)));
$("#conversion-mode-button").addEventListener("click", toggleConversionMode);
$("#convert-selected-button").addEventListener("click", openConversionDialog);
$("#convert-cancel").addEventListener("click", () => $<HTMLDialogElement>("#convert-dialog").close());
$("#convert-confirm").addEventListener("click", confirmConversion);
$("#flock-grid").addEventListener("click", event => {
  const detailButton = (event.target as Element).closest<HTMLElement>("[data-detail-chicken-id]");
  if (detailButton?.dataset.detailChickenId) return showChickenDetail(detailButton.dataset.detailChickenId);
  const button = (event.target as Element).closest<HTMLElement>("[data-chicken-id]");
  if (button?.dataset.chickenId) toggleTeam(button.dataset.chickenId);
});
$("#flock-grid").addEventListener("change", event => {
  const checkbox = (event.target as Element).closest<HTMLInputElement>("[data-convert-chicken-id]");
  if (checkbox?.dataset.convertChickenId) toggleConversionSelection(checkbox.dataset.convertChickenId, checkbox.checked);
});
$("#team-slots").addEventListener("click", event => {
  if ((event.target as Element).closest("[data-go-flock]")) switchView("flock");
});
$("#facility-grid").addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLElement>("[data-facility-id]");
  if (button?.dataset.facilityId) upgradeFacility(button.dataset.facilityId as FacilityId);
});
$("#mission-list").addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLElement>("[data-mission-id]");
  if (button?.dataset.missionId) return claimMission(button.dataset.missionId as MissionId);
  const viewButton = (event.target as Element).closest<HTMLElement>("[data-mission-view]");
  if (viewButton?.dataset.missionView) switchView(viewButton.dataset.missionView as ViewId);
});
$("#supply-options").addEventListener("change", event => {
  const input = (event.target as Element).closest<HTMLInputElement>('input[name="expedition-supply"]');
  if (!input || !isExpeditionSupplyId(input.value) || state.exploration) return;
  selectedSupplyId = input.value;
  render();
});
$("#zone-list").addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLElement>("[data-zone-id]");
  if (button) startExpedition(button.dataset.zoneId as ZoneId);
});
$("#save-manager-button").addEventListener("click", openSaveManager);
$("#save-dialog-close").addEventListener("click", () => $<HTMLDialogElement>("#save-dialog").close());
$("#export-save-button").addEventListener("click", exportSave);
$("#import-save-button").addEventListener("click", () => $<HTMLInputElement>("#save-file-input").click());
$("#save-file-input").addEventListener("change", event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void importSave(file);
  input.value = "";
});
$("#restore-backup-button").addEventListener("click", restoreBackup);
$("#reset-button").addEventListener("click", () => {
  if (!window.confirm("确定重置全部牧场进度吗？当前进度会先保存在本地备份中。")) return;
  backupCurrentSave();
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  state = starterState();
  conversionMode = false;
  conversionSelection.clear();
  selectedSupplyId = "none";
  flockMode = "chickens";
  persistState(state, false);
  render();
  renderSaveManager();
  showToast("牧场重新开张。重置前进度仍可从本地备份恢复。");
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveState();
  else handleOfflineProgress();
});
window.addEventListener("beforeunload", saveState);

handleOfflineProgress();
render();

let lastFrame = Date.now();
setInterval(() => {
  const now = Date.now();
  applyProduction(Math.min(5, (now - lastFrame) / 1000));
  lastFrame = now;
  advanceExploration(now);
  render();
}, 1000);
setInterval(saveState, 5000);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => {}));
}
