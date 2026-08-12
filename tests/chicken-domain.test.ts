import assert from "node:assert/strict";
import test from "node:test";

import {
  breedingLockCost,
  canConvertSelection,
  conversionDust,
  conversionProtected,
  mergeDiscovery,
  productionRates,
  traitProductionMultiplier
} from "../src/chicken-domain.ts";

test("production excludes chickens currently away on exploration", () => {
  const chickens = [
    { id: "home", grain: 2, feather: 0.5, traitProduction: [0.2] },
    { id: "away", grain: 5, feather: 2, traitProduction: [0.5] }
  ];
  assert.equal(traitProductionMultiplier([0.2, -0.1]), 1.1);
  assert.deepEqual(productionRates(chickens, new Set(["away"])), { grain: 2.4, feather: 0.6 });
});

test("breeding locks charge once for each selected parent trait", () => {
  assert.equal(breedingLockCost([null, null], 4), 0);
  assert.equal(breedingLockCost(["swift", null], 4), 4);
  assert.equal(breedingLockCost(["swift", "steady"], 4), 8);
});

test("manual conversion protects active chickens and keeps two breeders", () => {
  assert.equal(conversionProtected("team", ["team"], [], []), true);
  assert.equal(conversionProtected("away", [], ["away"], []), true);
  assert.equal(conversionProtected("parent", [], [], ["parent"]), true);
  assert.equal(conversionProtected("free", ["team"], ["away"], ["parent"]), false);
  assert.equal(canConvertSelection(4, 2), true);
  assert.equal(canConvertSelection(4, 3), false);
  assert.equal(canConvertSelection(4, 0), false);
});

test("conversion dust reflects rarity, extra traits, and generation", () => {
  assert.equal(conversionDust({ id: "common", rarity: "普通", traitCount: 1, generation: 1 }), 4);
  assert.equal(conversionDust({ id: "legend", rarity: "传奇", traitCount: 3, generation: 4 }), 23);
});

test("codex discovery accumulates without duplicates", () => {
  const current = { species: ["sprout"], traits: ["swift"] as const };
  const next = mergeDiscovery({ species: current.species, traits: [...current.traits] }, "miner", ["swift", "steady"]);
  assert.deepEqual(next, { species: ["sprout", "miner"], traits: ["swift", "steady"] });
});
