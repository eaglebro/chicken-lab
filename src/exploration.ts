export type TraitId = "diligent" | "lucky" | "ironHead" | "smallBelly" | "fluffy" | "loud" | "sleepy" | "snackThief" | "sharpEyes" | "forager" | "steady" | "swift";
export type ZoneId = "garden" | "puddle" | "windmill";
export type RouteNodeKind = "collect" | "battle";
export type ExplorationActionPhase = "collecting" | "fighting";
export type ExpeditionSupplyId = "none" | "featherWraps" | "trailRations" | "fieldKit";

export interface ExplorationModifiers {
  moveSpeed: number;
  collectionEfficiency: number;
  fatigueReduction: number;
  battleRating: number;
}

export interface ExplorationChicken {
  id: string;
  name: string;
  traits: TraitId[];
  traitNames: Partial<Record<TraitId, string>>;
  workRole: string;
  battleRole: string;
}

export interface ExpeditionCargo {
  grain: number;
  feather: number;
  parts: number;
  eggs: number;
  glowEggs: number;
  blueprints: number;
}

export interface RouteNodeReward {
  grain?: readonly [number, number];
  feather?: readonly [number, number];
  parts?: readonly [number, number];
  eggChance?: number;
  glowChance?: number;
}

export interface BossTrait {
  name: string;
  description: string;
  preferredTraits: readonly TraitId[];
  preferredBattleRoles: readonly string[];
  threatReduction: number;
  staminaReduction: number;
  blueprintReward: number;
}

export interface RouteNode {
  id: string;
  name: string;
  icon: string;
  kind: RouteNodeKind;
  description: string;
  travelSeconds: number;
  actionSeconds: number;
  recommended: number;
  next: readonly string[];
  reward: RouteNodeReward;
  boss?: BossTrait;
}

export interface ExplorationEvent {
  id: string;
  title: string;
  description: string;
  preferredTraits: readonly TraitId[];
  preferredWorkRoles: readonly string[];
  preferredBattleRoles: readonly string[];
  baseReward: Partial<ExpeditionCargo>;
  bonusReward: Partial<ExpeditionCargo>;
  baseMoveSpeed: number;
  bonusMoveSpeed: number;
}

export interface Zone {
  id: ZoneId;
  name: string;
  icon: string;
  duration: number;
  recommended: number;
  reward: string;
  nodes: readonly RouteNode[];
}

export interface ExpeditionSupply {
  name: string;
  icon: string;
  description: string;
  cost: Partial<Record<"grain" | "feather" | "parts", number>>;
  modifiers: Partial<ExplorationModifiers>;
}

export const EXPEDITION_SUPPLIES: Record<ExpeditionSupplyId, ExpeditionSupply> = {
  none: { name: "轻装出发", icon: "◇", description: "不消耗资源，依靠队伍自身能力。", cost: {}, modifiers: {} },
  featherWraps: { name: "轻羽绑腿", icon: "🪶", description: "移动速度 +20%，更快通过节点间路程。", cost: { feather: 8 }, modifiers: { moveSpeed: 0.2 } },
  trailRations: { name: "耐力口粮", icon: "🌾", description: "每次体力消耗额外减少 3 点。", cost: { grain: 60 }, modifiers: { fatigueReduction: 3 } },
  fieldKit: { name: "野外工具包", icon: "⚙", description: "采集效率 +12%，战斗评分 +6。", cost: { parts: 2 }, modifiers: { collectionEfficiency: 0.12, battleRating: 6 } }
};

export const ZONES: Zone[] = [
  {
    id: "garden", name: "菜园边草坡", icon: "🌿", duration: 18, recommended: 18, reward: "谷粒 · 普通蛋 · 2 张图纸",
    nodes: [
      { id: "garden-entry", name: "菜畦入口", icon: "🌱", kind: "collect", description: "先在低矮菜畦里搜集散落谷粒。", travelSeconds: 2, actionSeconds: 3, recommended: 0, next: ["garden-granary", "garden-fence"], reward: { grain: [12, 18], feather: [1, 2] } },
      { id: "garden-granary", name: "旧谷仓", icon: "🌾", kind: "collect", description: "路程较远但资源稳定，还有机会找到鸡蛋。", travelSeconds: 4, actionSeconds: 4, recommended: 0, next: ["garden-shed"], reward: { grain: [24, 34], eggChance: 0.18 } },
      { id: "garden-fence", name: "篱笆捷径", icon: "⚔", kind: "battle", description: "更快抵达木棚，但要赶走守路的黄鼠狼。", travelSeconds: 3, actionSeconds: 5, recommended: 18, next: ["garden-shed"], reward: { grain: [18, 28], parts: [0, 1], eggChance: 0.3 } },
      { id: "garden-shed", name: "木棚守卫", icon: "🛡", kind: "battle", description: "击退木棚前的守卫后带着收获返回。", travelSeconds: 3, actionSeconds: 5, recommended: 22, next: [], reward: { grain: [20, 30], parts: [0, 1], eggChance: 0.35 }, boss: { name: "伏击本能", description: "守卫会从木棚后突然扑出，缺乏观察与防守的小队容易失去阵形。", preferredTraits: ["sharpEyes", "steady"], preferredBattleRoles: ["侦察", "守卫"], threatReduction: 6, staminaReduction: 4, blueprintReward: 2 } }
    ]
  },
  {
    id: "puddle", name: "雨后的泥洼", icon: "💧", duration: 32, recommended: 32, reward: "羽毛 · 零件 · 闪光蛋 · 2 张图纸",
    nodes: [
      { id: "puddle-entry", name: "浅水滩", icon: "💧", kind: "collect", description: "沿浅水边收集被雨水冲来的羽毛。", travelSeconds: 4, actionSeconds: 5, recommended: 0, next: ["puddle-reeds", "puddle-mud"], reward: { grain: [8, 14], feather: [4, 7] } },
      { id: "puddle-reeds", name: "芦苇湾", icon: "🪶", kind: "collect", description: "绕行芦苇湾，耗时更长但羽毛产出稳定。", travelSeconds: 5, actionSeconds: 5, recommended: 0, next: ["puddle-nest"], reward: { feather: [7, 12], eggChance: 0.16 } },
      { id: "puddle-mud", name: "泥脊近路", icon: "⚔", kind: "battle", description: "穿过泥脊与甲虫群交战，胜利后更容易找到零件。", travelSeconds: 4, actionSeconds: 7, recommended: 32, next: ["puddle-nest"], reward: { feather: [4, 8], parts: [1, 2] } },
      { id: "puddle-nest", name: "沉水旧巢", icon: "🛡", kind: "battle", description: "清理盘踞旧巢的水蛇，搜索最后一批补给。", travelSeconds: 5, actionSeconds: 7, recommended: 36, next: [], reward: { grain: [12, 20], feather: [5, 9], parts: [1, 2], glowChance: 0.16 }, boss: { name: "泥沼缠绕", description: "水蛇借助泥沼拖慢小队，持续挣脱会快速消耗体力。", preferredTraits: ["swift", "steady"], preferredBattleRoles: ["守卫"], threatReduction: 8, staminaReduction: 6, blueprintReward: 2 } }
    ]
  },
  {
    id: "windmill", name: "旧风车山丘", icon: "🌬", duration: 55, recommended: 48, reward: "大量资源 · 稀有蛋 · 3 张图纸",
    nodes: [
      { id: "windmill-entry", name: "迎风坡", icon: "⚔", kind: "battle", description: "顶风穿过碎石坡，先解决拦路的野鸡群。", travelSeconds: 7, actionSeconds: 8, recommended: 44, next: ["windmill-store", "windmill-ridge"], reward: { grain: [18, 28], feather: [3, 6], parts: [1, 2] } },
      { id: "windmill-store", name: "废弃仓房", icon: "📦", kind: "collect", description: "绕道仓房翻找旧物，稳定获得资源和零件。", travelSeconds: 8, actionSeconds: 10, recommended: 0, next: ["windmill-top"], reward: { grain: [30, 48], feather: [6, 10], parts: [1, 3], eggChance: 0.18 } },
      { id: "windmill-ridge", name: "山脊近道", icon: "⚔", kind: "battle", description: "沿陡峭近道强攻山脊，风险更高但稀有蛋机会更大。", travelSeconds: 6, actionSeconds: 14, recommended: 52, next: ["windmill-top"], reward: { grain: [25, 40], feather: [7, 12], parts: [2, 3], glowChance: 0.2 } },
      { id: "windmill-top", name: "风车顶层", icon: "🛡", kind: "battle", description: "击败占据风车的山猫，完成本次探索。", travelSeconds: 8, actionSeconds: 14, recommended: 58, next: [], reward: { grain: [35, 55], feather: [8, 13], parts: [2, 4], eggChance: 0.2, glowChance: 0.28 }, boss: { name: "狂风压制", description: "山猫借风车气流压制进攻，需要机动或统领能力稳定阵线。", preferredTraits: ["swift", "loud"], preferredBattleRoles: ["侦察", "统领"], threatReduction: 10, staminaReduction: 8, blueprintReward: 3 } }
    ]
  }
];

export const EXPLORATION_EVENTS: Record<ZoneId, readonly ExplorationEvent[]> = {
  garden: [
    { id: "garden-seeds", title: "藏起来的种子袋", description: "篱笆下面压着一袋没有受潮的种子。", preferredTraits: ["forager", "sharpEyes"], preferredWorkRoles: ["谷粒采集"], preferredBattleRoles: [], baseReward: { grain: 8 }, bonusReward: { grain: 12 }, baseMoveSpeed: 0, bonusMoveSpeed: 0 },
    { id: "garden-cart", title: "翻倒的手推车", description: "旧车轮卡在土里，车斗中还留着一些零件。", preferredTraits: ["ironHead", "steady"], preferredWorkRoles: [], preferredBattleRoles: ["守卫"], baseReward: { parts: 1 }, bonusReward: { parts: 1 }, baseMoveSpeed: 0, bonusMoveSpeed: 0 }
  ],
  puddle: [
    { id: "puddle-feathers", title: "漂来的羽毛束", description: "水面漂来一束仍然干净的长羽。", preferredTraits: ["fluffy", "forager"], preferredWorkRoles: ["羽毛收集"], preferredBattleRoles: [], baseReward: { feather: 5 }, bonusReward: { feather: 7 }, baseMoveSpeed: 0, bonusMoveSpeed: 0 },
    { id: "puddle-current", title: "泥地暗流", description: "小队发现了一条能避开深泥的浅水通道。", preferredTraits: ["swift", "sharpEyes"], preferredWorkRoles: [], preferredBattleRoles: ["侦察"], baseReward: { grain: 4 }, bonusReward: { parts: 1 }, baseMoveSpeed: 0.06, bonusMoveSpeed: 0.12 }
  ],
  windmill: [
    { id: "windmill-tailwind", title: "短暂顺风", description: "山谷中的风向突然改变，后半程变得轻松。", preferredTraits: ["swift"], preferredWorkRoles: [], preferredBattleRoles: ["侦察"], baseReward: { feather: 3 }, bonusReward: { feather: 3 }, baseMoveSpeed: 0.08, bonusMoveSpeed: 0.12 },
    { id: "windmill-gears", title: "散落的齿轮箱", description: "破木箱中混着还能使用的风车零件。", preferredTraits: ["sharpEyes", "steady"], preferredWorkRoles: ["均衡生产"], preferredBattleRoles: ["支援"], baseReward: { parts: 1 }, bonusReward: { parts: 2 }, baseMoveSpeed: 0, bonusMoveSpeed: 0 }
  ]
};

export function emptyCargo(): ExpeditionCargo {
  return { grain: 0, feather: 0, parts: 0, eggs: 0, glowEggs: 0, blueprints: 0 };
}

export function combineExplorationModifiers(...sources: Array<Partial<ExplorationModifiers>>): ExplorationModifiers {
  const combined = sources.reduce<ExplorationModifiers>((total, source) => ({
    moveSpeed: total.moveSpeed + (source.moveSpeed || 0),
    collectionEfficiency: total.collectionEfficiency + (source.collectionEfficiency || 0),
    fatigueReduction: total.fatigueReduction + (source.fatigueReduction || 0),
    battleRating: total.battleRating + (source.battleRating || 0)
  }), { moveSpeed: 0, collectionEfficiency: 0, fatigueReduction: 0, battleRating: 0 });
  return {
    moveSpeed: Math.min(1, combined.moveSpeed),
    collectionEfficiency: Math.min(0.6, combined.collectionEfficiency),
    fatigueReduction: Math.min(10, combined.fatigueReduction),
    battleRating: Math.min(30, combined.battleRating)
  };
}

export function explorationModifiers(team: ExplorationChicken[], supplyId: ExpeditionSupplyId = "none"): ExplorationModifiers {
  const rolePower: Record<string, number> = { 支援: 2, 守卫: 3, 突击: 4, 侦察: 3, 统领: 6 };
  const teamModifiers = team.reduce<ExplorationModifiers>((total, chicken) => {
    total.moveSpeed += chicken.traits.includes("swift") ? 0.12 : 0;
    total.fatigueReduction += (chicken.traits.includes("steady") ? 2 : 0)
      + (chicken.traits.includes("swift") ? 1 : 0)
      + (["守卫", "支援"].includes(chicken.battleRole) ? 1 : 0);
    total.battleRating += rolePower[chicken.battleRole] || 0;
    return total;
  }, { moveSpeed: 0, collectionEfficiency: 0, fatigueReduction: 0, battleRating: 0 });
  return combineExplorationModifiers(teamModifiers, EXPEDITION_SUPPLIES[supplyId].modifiers);
}

export function collectionMultiplier(team: ExplorationChicken[], node: RouteNode, stamina: number, modifiers: ExplorationModifiers): number {
  const favorsGrain = Boolean(node.reward.grain);
  const favorsFeather = Boolean(node.reward.feather);
  const bonus = team.reduce((sum, chicken) => {
    let chickenBonus = chicken.workRole === "均衡生产" ? 0.03 : 0;
    if (favorsGrain && chicken.workRole === "谷粒采集") chickenBonus += 0.07;
    if (favorsFeather && chicken.workRole === "羽毛收集") chickenBonus += 0.07;
    if (chicken.traits.includes("forager")) chickenBonus += 0.05;
    if (chicken.traits.includes("diligent")) chickenBonus += 0.03;
    if (favorsFeather && chicken.traits.includes("fluffy")) chickenBonus += 0.04;
    if (chicken.traits.includes("sharpEyes")) chickenBonus += 0.02;
    return sum + chickenBonus;
  }, 0);
  const staminaFactor = stamina >= 40 ? 1 : 0.75 + stamina * 0.00625;
  return (1 + Math.min(0.6, bonus + modifiers.collectionEfficiency)) * staminaFactor;
}

export function matchingCapability(team: ExplorationChicken[], preferredTraits: readonly TraitId[], preferredWorkRoles: readonly string[], preferredBattleRoles: readonly string[]): string | null {
  for (const chicken of team) {
    const trait = chicken.traits.find(id => preferredTraits.includes(id));
    if (trait) return `${chicken.name}的「${chicken.traitNames[trait] || trait}」`;
    if (preferredWorkRoles.includes(chicken.workRole)) return `${chicken.name}的${chicken.workRole}定位`;
    if (preferredBattleRoles.includes(chicken.battleRole)) return `${chicken.name}的${chicken.battleRole}定位`;
  }
  return null;
}

export function getZone(zoneId: ZoneId): Zone {
  const zone = ZONES.find(item => item.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
  return zone;
}

export function getRouteNode(zoneId: ZoneId, nodeId: string): RouteNode {
  const node = getZone(zoneId).nodes.find(item => item.id === nodeId);
  if (!node) throw new Error(`Unknown route node: ${zoneId}/${nodeId}`);
  return node;
}

export function automaticNextNodeId(zoneId: ZoneId, nodeId: string, power: number, battleRatingBonus: number): string {
  const node = getRouteNode(zoneId, nodeId);
  if (node.next.length === 0) throw new Error(`Route node has no successor: ${zoneId}/${nodeId}`);
  if (node.next.length === 1) return node.next[0]!;
  const candidates = node.next.map(nextId => getRouteNode(zoneId, nextId));
  const battle = candidates.find(next => next.kind === "battle");
  const collect = candidates.find(next => next.kind === "collect");
  return battle && power + battleRatingBonus >= battle.recommended ? battle.id : collect?.id || candidates[0]!.id;
}

export function staminaCost(baseCost: number, fatigueReduction: number, extraReduction = 0): number {
  return Math.max(1, baseCost - fatigueReduction - extraReduction);
}

export function staminaState(stamina: number): string {
  if (stamina >= 70) return "充沛";
  if (stamina >= 35) return "疲劳";
  return "透支";
}

export function travelDuration(node: RouteNode, moveSpeedBonus: number): number {
  return Math.max(2, Math.round(node.travelSeconds / (1 + moveSpeedBonus)));
}

export function actionPhase(node: RouteNode): ExplorationActionPhase {
  return node.kind === "collect" ? "collecting" : "fighting";
}

export function actionEndAt(node: RouteNode, transitionAt: number): number {
  return transitionAt + node.actionSeconds * 1000;
}

export function cargoFromPartial(reward: Partial<ExpeditionCargo>): ExpeditionCargo {
  return {
    grain: reward.grain || 0,
    feather: reward.feather || 0,
    parts: reward.parts || 0,
    eggs: reward.eggs || 0,
    glowEggs: reward.glowEggs || 0,
    blueprints: reward.blueprints || 0
  };
}

export function mergeCargo(target: ExpeditionCargo, reward: ExpeditionCargo): void {
  (Object.keys(target) as Array<keyof ExpeditionCargo>).forEach(key => {
    target[key] += reward[key];
  });
}

export function cargoLabels(cargo: ExpeditionCargo): string[] {
  const labels: Array<[keyof ExpeditionCargo, string]> = [["grain", "谷粒"], ["feather", "羽毛"], ["parts", "零件"], ["blueprints", "张设施图纸"], ["eggs", "枚普通蛋"], ["glowEggs", "枚闪光蛋"]];
  return labels.filter(([key]) => cargo[key] > 0).map(([key, label]) => `${cargo[key]} ${label}`);
}
