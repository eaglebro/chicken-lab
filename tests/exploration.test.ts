import assert from "node:assert/strict";
import test from "node:test";

import {
  ZONES,
  actionEndAt,
  actionPhase,
  automaticNextNodeId,
  cargoFromPartial,
  cargoLabels,
  collectionMultiplier,
  combineExplorationModifiers,
  emptyCargo,
  explorationModifiers,
  getRouteNode,
  matchingCapability,
  mergeCargo,
  staminaCost,
  travelDuration,
  type ExplorationChicken
} from "../src/exploration.ts";
import { SAVE_VERSION, createSaveFile, migrateBlueprintCount, migrateExplorationModifiers, parseSaveFile, saveFileTimestamp } from "../src/save-migrations.ts";

const swiftGuard: ExplorationChicken = {
  id: "swift-guard",
  name: "测试鸡",
  traits: ["swift", "steady"],
  traitNames: { swift: "疾行", steady: "沉着" },
  workRole: "谷粒采集",
  battleRole: "守卫"
};

test("three zones keep a terminal boss with blueprint rewards", () => {
  assert.deepEqual(ZONES.map(zone => zone.id), ["garden", "puddle", "windmill"]);
  assert.deepEqual(ZONES.map(zone => zone.nodes.at(-1)?.boss?.blueprintReward), [2, 2, 3]);
  for (const zone of ZONES) {
    assert.equal(zone.nodes.at(-1)?.next.length, 0);
    assert.equal(new Set(zone.nodes.map(node => node.id)).size, zone.nodes.length);
  }
});

test("team and supply modifiers share one capped snapshot", () => {
  const modifiers = explorationModifiers([swiftGuard], "fieldKit");
  assert.deepEqual(modifiers, {
    moveSpeed: 0.12,
    collectionEfficiency: 0.12,
    fatigueReduction: 4,
    battleRating: 9
  });

  assert.deepEqual(combineExplorationModifiers(
    { moveSpeed: 0.8, collectionEfficiency: 0.5, fatigueReduction: 8, battleRating: 20 },
    { moveSpeed: 0.5, collectionEfficiency: 0.3, fatigueReduction: 5, battleRating: 20 }
  ), { moveSpeed: 1, collectionEfficiency: 0.6, fatigueReduction: 10, battleRating: 30 });
});

test("automatic route uses battle rating without adding a player choice", () => {
  assert.equal(automaticNextNodeId("garden", "garden-entry", 14, 3), "garden-granary");
  assert.equal(automaticNextNodeId("garden", "garden-entry", 15, 3), "garden-fence");
  assert.equal(automaticNextNodeId("garden", "garden-granary", 0, 0), "garden-shed");
});

test("movement bonus only shortens travel and keeps a two-second floor", () => {
  const ridge = getRouteNode("windmill", "windmill-ridge");
  assert.equal(travelDuration(ridge, 0), 6);
  assert.equal(travelDuration(ridge, 0.5), 4);
  assert.equal(travelDuration(ridge, 10), 2);
});

test("arrival automatically enters the node action phase", () => {
  const collect = getRouteNode("garden", "garden-entry");
  const battle = getRouteNode("garden", "garden-fence");
  assert.equal(actionPhase(collect), "collecting");
  assert.equal(actionPhase(battle), "fighting");
  assert.equal(actionEndAt(battle, 10_000), 15_000);
});

test("low stamina reduces collection after team and supply bonuses", () => {
  const entry = getRouteNode("garden", "garden-entry");
  const modifiers = explorationModifiers([swiftGuard], "fieldKit");
  const rested = collectionMultiplier([swiftGuard], entry, 100, modifiers);
  const exhausted = collectionMultiplier([swiftGuard], entry, 0, modifiers);
  assert.ok(rested > 1);
  assert.equal(exhausted, rested * 0.75);
});

test("capability feedback uses display names and role fallback", () => {
  assert.equal(matchingCapability([swiftGuard], ["swift"], [], []), "测试鸡的「疾行」");
  assert.equal(matchingCapability([swiftGuard], [], [], ["守卫"]), "测试鸡的守卫定位");
  assert.equal(matchingCapability([swiftGuard], ["lucky"], ["羽毛收集"], ["侦察"]), null);
});

test("fatigue reduction never removes all stamina cost", () => {
  assert.equal(staminaCost(10, 4), 6);
  assert.equal(staminaCost(10, 10, 8), 1);
});

test("blueprints merge into cargo and appear in reward labels", () => {
  const cargo = emptyCargo();
  mergeCargo(cargo, cargoFromPartial({ grain: 12, blueprints: 2 }));
  mergeCargo(cargo, cargoFromPartial({ parts: 1, blueprints: 3 }));
  assert.equal(cargo.blueprints, 5);
  assert.deepEqual(cargoLabels(cargo), ["12 谷粒", "1 零件", "5 张设施图纸"]);
});

test("V6 saves gain blueprint inventory and unified modifier defaults", () => {
  assert.equal(SAVE_VERSION, 7);
  assert.equal(migrateBlueprintCount({ grain: 100 }), 0);
  assert.equal(migrateBlueprintCount({ blueprints: 4.9 }), 4);
  const fallback = { moveSpeed: 0.24, collectionEfficiency: 0, fatigueReduction: 4, battleRating: 9 };
  assert.deepEqual(migrateExplorationModifiers(undefined, fallback), fallback);
  assert.deepEqual(migrateExplorationModifiers({ moveSpeed: 0.5 }, fallback), { ...fallback, moveSpeed: 0.5 });
});

test("save files round-trip and reject malformed or future data", () => {
  const raw = { version: 7, resources: { grain: 20 }, chickens: [{ id: "a", species: "sprout" }, { id: "b", species: "round" }] };
  const wrapped = createSaveFile(raw, "2026-08-12T08:00:00.000Z");
  const serialized = JSON.stringify(wrapped);
  assert.deepEqual(parseSaveFile(serialized), raw);
  assert.deepEqual(parseSaveFile(JSON.stringify(raw)), raw);
  assert.equal(saveFileTimestamp(serialized), "2026-08-12T08:00:00.000Z");
  assert.throws(() => parseSaveFile("not json"), /有效的 JSON/);
  assert.throws(() => parseSaveFile(JSON.stringify({ version: 99, resources: {}, chickens: [{ species: "sprout" }, { species: "round" }] })), /更新版本/);
  assert.throws(() => parseSaveFile(JSON.stringify({ version: 7, resources: {}, chickens: [] })), /有效鸡群/);
});
