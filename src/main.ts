import "../styles.css";

const STORAGE_KEY = "chicken-lab-save-v1";
const MAX_OFFLINE_SECONDS = 4 * 60 * 60;

type SpeciesId = "sprout" | "round" | "cloud" | "blaze" | "miner" | "dawn";
type TraitId = "diligent" | "lucky" | "ironHead" | "smallBelly" | "fluffy" | "loud" | "sleepy" | "snackThief";
type EggType = "common" | "glow";
type IncubationType = EggType | "breed";
type ViewId = "farm" | "hatch" | "flock" | "explore";
type ZoneId = "garden" | "puddle" | "windmill";

interface SpeciesDefinition {
  name: string;
  rarity: "普通" | "少见" | "稀有" | "传奇";
  accessory: string;
  grain: number;
  feather: number;
  power: number;
}

interface TraitDefinition {
  name: string;
  production: number;
  power: number;
}

interface Chicken {
  id: string;
  species: SpeciesId;
  traits: TraitId[];
  generation: number;
  level: number;
}

interface Resources {
  grain: number;
  feather: number;
  eggs: number;
  glowEggs: number;
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
  startedAt: number;
  endAt: number;
}

interface ExpeditionResult {
  zoneId: ZoneId;
  success: boolean;
  rewards: string[];
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
  lastTick: number;
}

interface Zone {
  id: ZoneId;
  name: string;
  icon: string;
  duration: number;
  recommended: number;
  reward: string;
  grain: readonly [number, number];
  feather: readonly [number, number];
  eggChance: number;
  glowChance: number;
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
  sprout: { name: "草团鸡", rarity: "普通", accessory: "🌱", grain: 1.5, feather: 0.12, power: 8 },
  round: { name: "滚滚鸡", rarity: "普通", accessory: "●", grain: 1.1, feather: 0.2, power: 12 },
  cloud: { name: "云绒鸡", rarity: "少见", accessory: "☁", grain: 0.85, feather: 0.42, power: 11 },
  blaze: { name: "火羽鸡", rarity: "稀有", accessory: "🔥", grain: 1.25, feather: 0.28, power: 20 },
  miner: { name: "矿盔鸡", rarity: "稀有", accessory: "⛏", grain: 1.8, feather: 0.08, power: 22 },
  dawn: { name: "晨鸣鸡", rarity: "传奇", accessory: "☀", grain: 1.65, feather: 0.5, power: 30 }
};

const TRAITS: Record<TraitId, TraitDefinition> = {
  diligent: { name: "勤快", production: 0.2, power: 0 },
  lucky: { name: "幸运", production: 0.05, power: 3 },
  ironHead: { name: "铁头", production: 0, power: 7 },
  smallBelly: { name: "小胃王", production: 0.1, power: 1 },
  fluffy: { name: "蓬松", production: 0.08, power: 4 },
  loud: { name: "大嗓门", production: -0.05, power: 8 },
  sleepy: { name: "赖床", production: -0.12, power: -1 },
  snackThief: { name: "偷吃", production: 0.16, power: 2 }
};

const ZONES: Zone[] = [
  { id: "garden", name: "菜园边草坡", icon: "🌿", duration: 18, recommended: 18, reward: "谷粒 · 普通蛋", grain: [45, 75], feather: [2, 5], eggChance: 0.48, glowChance: 0 },
  { id: "puddle", name: "雨后的泥洼", icon: "💧", duration: 32, recommended: 32, reward: "羽毛 · 闪光蛋", grain: [35, 60], feather: [7, 14], eggChance: 0.24, glowChance: 0.16 },
  { id: "windmill", name: "旧风车山丘", icon: "🌬", duration: 55, recommended: 48, reward: "大量资源 · 稀有蛋", grain: [80, 140], feather: [12, 22], eggChance: 0.35, glowChance: 0.3 }
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
  const pool: ReadonlyArray<readonly [SpeciesId, number]> = type === "glow"
    ? [["cloud", 35], ["blaze", 30], ["miner", 25], ["dawn", 10]]
    : [["sprout", 44], ["round", 28], ["cloud", 18], ["blaze", 8], ["dawn", 2]];
  let roll = Math.random() * 100;
  for (const [id, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return id;
  }
  return pool[0]![0];
}

function makeChicken(speciesId: SpeciesId, traitIds?: TraitId[], generation = 1): Chicken {
  const allTraits = Object.keys(TRAITS) as TraitId[];
  const traits = traitIds || [randomItem(allTraits)];
  return { id: uid(), species: speciesId, traits: [...new Set(traits)].slice(0, 3), generation, level: 1 };
}

function starterState(): GameState {
  return {
    version: 1,
    resources: { grain: 180, feather: 24, eggs: 2, glowEggs: 0 },
    bank: { grain: 12, feather: 1 },
    chickens: [
      makeChicken("sprout", ["diligent"]),
      makeChicken("round", ["ironHead"]),
      makeChicken("cloud", ["fluffy", "sleepy"])
    ],
    team: [],
    incubation: null,
    exploration: null,
    lastExpedition: null,
    events: ["第一批鸡已经占领了鸡舍。", "牧场开张，谷粒闻起来很有前途。"],
    lastTick: Date.now()
  };
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return starterState();
    const loaded = JSON.parse(raw) as GameState;
    const fresh = starterState();
    return { ...fresh, ...loaded, resources: { ...fresh.resources, ...loaded.resources }, bank: { ...fresh.bank, ...loaded.bank } };
  } catch {
    return starterState();
  }
}

let state: GameState = loadState();
let activeView: ViewId = "farm";
let toastTimer: number | undefined;

function saveState(): void {
  state.lastTick = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function traitProductionMultiplier(chicken: Chicken): number {
  return 1 + chicken.traits.reduce((sum, id) => sum + (TRAITS[id]?.production || 0), 0);
}

function chickenPower(chicken: Chicken): number {
  const base = SPECIES[chicken.species].power;
  return Math.max(1, Math.round(base + chicken.traits.reduce((sum, id) => sum + (TRAITS[id]?.power || 0), 0)));
}

function teamPower(): number {
  return state.team.reduce((sum, id) => {
    const chicken = state.chickens.find(item => item.id === id);
    return sum + (chicken ? chickenPower(chicken) : 0);
  }, 0);
}

function productionRates(): Pick<Resources, "grain" | "feather"> {
  const away = state.exploration ? new Set(state.exploration.teamIds) : new Set();
  return state.chickens.reduce((rates, chicken) => {
    if (away.has(chicken.id)) return rates;
    const species = SPECIES[chicken.species];
    const multiplier = traitProductionMultiplier(chicken);
    rates.grain += species.grain * multiplier;
    rates.feather += species.feather * multiplier;
    return rates;
  }, { grain: 0, feather: 0 });
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
    <span class="chicken-body"></span><span class="chicken-wing"></span><span class="chicken-head"></span>
    <span class="chicken-comb"></span><span class="chicken-eye"></span><span class="chicken-beak"></span>
    <span class="chicken-leg one"></span><span class="chicken-leg two"></span>
    <span class="chicken-accessory" aria-hidden="true">${species.accessory}</span>
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
  $("#egg-count").textContent = formatNumber(state.resources.eggs);
  $("#glow-egg-count").textContent = `库存 ${state.resources.glowEggs}`;
}

function renderFarm(): void {
  const rates = productionRates();
  const visibleChickens = state.chickens.slice(0, 3);
  $("#coop-flock").innerHTML = visibleChickens.map(chicken => chickenMarkup(chicken, "small")).join("");
  $("#ranch-level").textContent = `牧场 Lv.${Math.max(1, Math.floor(state.chickens.length / 3))}`;
  $("#flock-summary").textContent = `${state.chickens.length} 只鸡`;
  $("#bank-grain").textContent = formatNumber(state.bank.grain);
  $("#bank-feather").textContent = formatNumber(state.bank.feather);
  $("#production-rate").textContent = `每分钟生产 ${rates.grain.toFixed(1)} 谷粒 · ${rates.feather.toFixed(1)} 羽毛`;
  $("#collect-button").disabled = state.bank.grain < 1 && state.bank.feather < 1;
  $("#next-egg-copy").textContent = state.resources.eggs > 0 ? `${state.resources.eggs} 枚普通蛋` : "等待探索带蛋回来";
  $("#team-power-copy").textContent = `战力 ${teamPower()}`;
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
  $all<HTMLButtonElement>(".hatch-button").forEach(button => {
    const type = button.dataset.eggType as EggType;
    const lacks = type === "common" ? state.resources.eggs < 1 || state.resources.grain < 20 : state.resources.glowEggs < 1 || state.resources.grain < 50;
    button.disabled = busy || lacks;
  });

  const options = state.chickens.map(chicken => `<option value="${chicken.id}">${SPECIES[chicken.species].name} · ${chicken.traits.map(id => TRAITS[id].name).join("/")}</option>`).join("");
  const parentA = $<HTMLSelectElement>("#parent-a");
  const parentB = $<HTMLSelectElement>("#parent-b");
  const selectedA = parentA.value;
  const selectedB = parentB.value;
  parentA.innerHTML = options;
  parentB.innerHTML = options;
  if (selectedA && state.chickens.some(item => item.id === selectedA)) parentA.value = selectedA;
  if (selectedB && state.chickens.some(item => item.id === selectedB)) parentB.value = selectedB;
  if (!selectedB && state.chickens[1]) parentB.value = state.chickens[1].id;
  $("#breed-button").disabled = busy || state.chickens.length < 2 || state.resources.grain < 80 || state.resources.feather < 12;
}

function renderFlock(): void {
  $("#team-count").textContent = `编队 ${state.team.length}/3`;
  $("#flock-grid").innerHTML = state.chickens.map(chicken => {
    const species = SPECIES[chicken.species];
    const inTeam = state.team.includes(chicken.id);
    return `<article class="chicken-card ${inTeam ? "is-teammate" : ""}">
      <div class="chicken-card-visual">${chickenMarkup(chicken, "small")}</div>
      <div class="chicken-card-body">
        <div class="chicken-card-title"><h2>${species.name}</h2><span class="rarity">${species.rarity}</span></div>
        <div class="stat-line"><span>战力 ${chickenPower(chicken)}</span><span>第 ${chicken.generation} 代</span></div>
        <div class="trait-list">${chicken.traits.map(id => `<span class="trait">${TRAITS[id].name}</span>`).join("")}</div>
        <button class="team-toggle" data-chicken-id="${chicken.id}" type="button">${inTeam ? "撤回鸡舍" : "加入编队"}</button>
      </div>
    </article>`;
  }).join("");
}

function renderExplore(): void {
  const power = teamPower();
  $("#team-power").textContent = `战力 ${power}`;
  $("#explore-status").textContent = state.exploration ? "外出中" : "待命";
  const teamChickens = state.team.map(id => state.chickens.find(chicken => chicken.id === id)).filter(Boolean);
  $("#team-slots").innerHTML = [0, 1, 2].map(index => {
    const chicken = teamChickens[index];
    return chicken ? `<div class="team-slot">${chickenMarkup(chicken, "mini")}<strong>${SPECIES[chicken.species].name}</strong></div>` : `<button class="team-slot" data-go-flock type="button">空位<br>去编队</button>`;
  }).join("");

  const active = $("#expedition-active");
  if (state.exploration) {
    const zone = getZone(state.exploration.zoneId);
    const total = state.exploration.endAt - state.exploration.startedAt;
    const ratio = Math.min(1, Math.max(0, (Date.now() - state.exploration.startedAt) / total));
    active.hidden = false;
    $("#expedition-name").textContent = zone.name;
    $("#expedition-time").textContent = formatTime((state.exploration.endAt - Date.now()) / 1000);
    $("#expedition-progress").style.width = `${ratio * 100}%`;
  } else {
    active.hidden = true;
  }

  $("#zone-list").innerHTML = ZONES.map(zone => `<article class="zone-card">
    <div class="zone-art" aria-hidden="true">${zone.icon}</div>
    <div><h3>${zone.name}</h3><p>${zone.duration} 秒 · 建议战力 ${zone.recommended}<br>${zone.reward}</p></div>
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

function getZone(zoneId: ZoneId): Zone {
  const zone = ZONES.find(item => item.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
  return zone;
}

function createHatchResult(type: EggType): Chicken {
  return makeChicken(weightedSpecies(type), undefined, 1);
}

function createBreedResult(parentA: Chicken, parentB: Chicken): Chicken {
  let species = Math.random() < 0.5 ? parentA.species : parentB.species;
  if (Math.random() < (parentA.species === parentB.species ? 0.1 : 0.05)) species = weightedSpecies("glow");
  const inherited = [...new Set([...parentA.traits, ...parentB.traits].filter(() => Math.random() < 0.62))];
  if (!inherited.length) inherited.push(randomItem([...parentA.traits, ...parentB.traits]));
  if (Math.random() < 0.18 && inherited.length < 3) inherited.push(randomItem(Object.keys(TRAITS) as TraitId[]));
  return makeChicken(species, inherited, Math.max(parentA.generation, parentB.generation) + 1);
}

function startHatch(type: EggType): void {
  if (state.incubation) return;
  const isCommon = type === "common";
  const grainCost = isCommon ? 20 : 50;
  const eggKey = isCommon ? "eggs" : "glowEggs";
  if (state.resources[eggKey] < 1 || state.resources.grain < grainCost) return showToast("蛋箱或谷粒不够。鸡表示理解。");
  state.resources[eggKey] -= 1;
  state.resources.grain -= grainCost;
  const duration = isCommon ? 7000 : 11000;
  state.incubation = { type, startedAt: Date.now(), endAt: Date.now() + duration, result: createHatchResult(type) };
  addEvent(`${isCommon ? "谷仓蛋" : "闪光蛋"}进入了孵化器。`);
  saveState();
  render();
}

function startBreeding(): void {
  if (state.incubation) return;
  const a = state.chickens.find(chicken => chicken.id === $<HTMLSelectElement>("#parent-a").value);
  const b = state.chickens.find(chicken => chicken.id === $<HTMLSelectElement>("#parent-b").value);
  if (!a || !b || a.id === b.id) return showToast("请选择两只不同的亲本。");
  if (state.resources.grain < 80 || state.resources.feather < 12) return showToast("繁育窝的伙食费还没凑齐。");
  state.resources.grain -= 80;
  state.resources.feather -= 12;
  state.incubation = { type: "breed", startedAt: Date.now(), endAt: Date.now() + 13000, result: createBreedResult(a, b), parents: [a.id, b.id] };
  addEvent(`${SPECIES[a.species].name}和${SPECIES[b.species].name}留下了一枚态度复杂的蛋。`);
  saveState();
  render();
}

function openEgg(): void {
  if (!state.incubation || Date.now() < state.incubation.endAt) return;
  const chicken = state.incubation.result;
  state.chickens.push(chicken);
  state.incubation = null;
  addEvent(`${SPECIES[chicken.species].name}破壳后先检查了一下伙食。`);
  $("#reveal-chicken").innerHTML = chickenMarkup(chicken);
  $("#reveal-name").textContent = SPECIES[chicken.species].name;
  $("#reveal-traits").textContent = `词条：${chicken.traits.map(id => TRAITS[id].name).join(" · ")} · 第 ${chicken.generation} 代`;
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

function startExpedition(zoneId: ZoneId): void {
  if (state.exploration || state.team.length === 0) return;
  const zone = getZone(zoneId);
  state.exploration = { zoneId, teamIds: [...state.team], power: teamPower(), startedAt: Date.now(), endAt: Date.now() + zone.duration * 1000 };
  addEvent(`小队出发前往${zone.name}，走反了两次才成功。`);
  saveState();
  render();
}

function randomRange([min, max]: readonly [number, number]): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function resolveExpedition(): void {
  if (!state.exploration || Date.now() < state.exploration.endAt) return;
  const zone = getZone(state.exploration.zoneId);
  const chance = Math.max(0.3, Math.min(0.95, 0.58 + (state.exploration.power - zone.recommended) / 80));
  const success = Math.random() < chance;
  const multiplier = success ? 1 : 0.42;
  const grain = Math.max(1, Math.floor(randomRange(zone.grain) * multiplier));
  const feather = Math.max(0, Math.floor(randomRange(zone.feather) * multiplier));
  const egg = Math.random() < zone.eggChance * multiplier ? 1 : 0;
  const glowEgg = success && Math.random() < zone.glowChance ? 1 : 0;
  state.resources.grain += grain;
  state.resources.feather += feather;
  state.resources.eggs += egg;
  state.resources.glowEggs += glowEgg;
  const rewardParts = [`${grain} 谷粒`, `${feather} 羽毛`];
  if (egg) rewardParts.push("1 枚普通蛋");
  if (glowEgg) rewardParts.push("1 枚闪光蛋");
  state.lastExpedition = { zoneId: zone.id, success, rewards: rewardParts };
  state.exploration = null;
  addEvent(`${zone.name}${success ? "探索成功" : "勉强返回"}：${rewardParts.join("、")}。`);
  showToast(`${success ? "探索成功" : "小队回来了"}：${rewardParts.join("、")}`);
  saveState();
}

function collectBank(): void {
  const grain = Math.floor(state.bank.grain);
  const feather = Math.floor(state.bank.feather);
  if (!grain && !feather) return;
  state.resources.grain += grain;
  state.resources.feather += feather;
  state.bank.grain -= grain;
  state.bank.feather -= feather;
  if (Math.random() < 0.3) addEvent(randomItem(SAMPLE_EVENTS));
  showToast(`收取 ${grain} 谷粒 · ${feather} 羽毛`);
  saveState();
  render();
}

function handleOfflineProgress(): void {
  const now = Date.now();
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (now - (state.lastTick || now)) / 1000));
  if (elapsed > 3) {
    const before = { ...state.bank };
    applyProduction(elapsed);
    const grain = Math.floor(state.bank.grain - before.grain);
    const feather = Math.floor(state.bank.feather - before.feather);
    if (elapsed > 30) setTimeout(() => showToast(`离线期间积攒 ${grain} 谷粒 · ${feather} 羽毛`), 350);
  }
  state.lastTick = now;
  resolveExpedition();
  saveState();
}

$all<HTMLButtonElement>(".nav-button").forEach(button => button.addEventListener("click", () => switchView(button.dataset.target as ViewId)));
$("#collect-button").addEventListener("click", collectBank);
$all<HTMLButtonElement>(".hatch-button").forEach(button => button.addEventListener("click", () => startHatch(button.dataset.eggType as EggType)));
$("#breed-button").addEventListener("click", startBreeding);
$("#open-egg-button").addEventListener("click", openEgg);
$("#reveal-close").addEventListener("click", () => $<HTMLDialogElement>("#reveal-dialog").close());
$("#flock-grid").addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLElement>("[data-chicken-id]");
  if (button?.dataset.chickenId) toggleTeam(button.dataset.chickenId);
});
$("#team-slots").addEventListener("click", event => {
  if ((event.target as Element).closest("[data-go-flock]")) switchView("flock");
});
$("#zone-list").addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLElement>("[data-zone-id]");
  if (button) startExpedition(button.dataset.zoneId as ZoneId);
});
$("#reset-button").addEventListener("click", () => {
  if (!window.confirm("确定重置全部牧场进度吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = starterState();
  saveState();
  render();
  showToast("牧场重新开张。三只鸡对此毫不知情。");
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
  resolveExpedition();
  render();
}, 1000);
setInterval(saveState, 5000);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => {}));
}
