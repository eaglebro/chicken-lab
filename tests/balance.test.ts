import assert from "node:assert/strict";
import test from "node:test";

import { facilityCostFactor, incubationDurationMs, offlineCapSeconds, offlineElapsedSeconds } from "../src/balance.ts";

test("facility costs grow steadily without the old steep jump", () => {
  assert.equal(facilityCostFactor(1), 1);
  assert.equal(facilityCostFactor(2), 1.5);
  assert.equal(facilityCostFactor(4), 3.375);
});

test("incubation pacing is short in the first hour and scales predictably", () => {
  assert.equal(incubationDurationMs("common", 1), 6000);
  assert.equal(incubationDurationMs("glow", 1), 9000);
  assert.equal(incubationDurationMs("breed", 4), 7700);
});

test("offline storage starts modestly and has a clear upper bound", () => {
  assert.equal(offlineCapSeconds(1), 3 * 60 * 60);
  assert.equal(offlineCapSeconds(4), 7.5 * 60 * 60);
  assert.equal(offlineCapSeconds(8), 13.5 * 60 * 60);
});

test("offline settlement uses only the interval since the last saved tick", () => {
  const now = 10 * 60 * 60 * 1000;
  assert.equal(offlineElapsedSeconds(now, now - 90_000, 3 * 60 * 60), 90);
  assert.equal(offlineElapsedSeconds(now, now - 8 * 60 * 60 * 1000, 3 * 60 * 60), 3 * 60 * 60);
  assert.equal(offlineElapsedSeconds(now, now + 1000, 3 * 60 * 60), 0);
  assert.equal(offlineElapsedSeconds(now, now, 3 * 60 * 60), 0);
});
