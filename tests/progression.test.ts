import assert from "node:assert/strict";
import test from "node:test";

import { achievementCompletion, achievementProgress, activeMainQuestIndex, codexCompletion, mainQuestCompletedCount, mainQuestUnlocked } from "../src/progression.ts";

test("main quests unlock in order even when later requirements are already met", () => {
  const quests = [
    { id: "collect", target: 40, progress: 40, claimed: true },
    { id: "hatch", target: 1, progress: 1, claimed: false },
    { id: "team", target: 3, progress: 3, claimed: false }
  ];

  assert.equal(activeMainQuestIndex(quests), 1);
  assert.equal(mainQuestUnlocked(0, quests), true);
  assert.equal(mainQuestUnlocked(1, quests), true);
  assert.equal(mainQuestUnlocked(2, quests), false);
  assert.equal(mainQuestCompletedCount(quests), 1);
});

test("all main quests remain visible and complete after the last reward", () => {
  const quests = [
    { id: "collect", target: 40, progress: 40, claimed: true },
    { id: "hatch", target: 1, progress: 2, claimed: true }
  ];

  assert.equal(activeMainQuestIndex(quests), 2);
  assert.equal(mainQuestUnlocked(1, quests), true);
  assert.equal(mainQuestCompletedCount(quests), 2);
});

test("codex completion combines species and traits and reports a tier", () => {
  assert.deepEqual(codexCompletion({ discoveredSpecies: 3, totalSpecies: 8, discoveredTraits: 3, totalTraits: 12 }), {
    discoveredSpecies: 3,
    totalSpecies: 8,
    discoveredTraits: 3,
    totalTraits: 12,
    discovered: 6,
    total: 20,
    percent: 30,
    tier: "初识鸡群"
  });
  assert.equal(codexCompletion({ discoveredSpecies: 8, totalSpecies: 8, discoveredTraits: 12, totalTraits: 12 }).tier, "图鉴完成");
});

test("achievements are read-only milestones with capped display progress", () => {
  const achievements = [
    achievementProgress("collector", 1000, 1200),
    achievementProgress("breeder", 3, 1),
    achievementProgress("explorer", 6, 6)
  ];
  assert.deepEqual(achievements[0], { id: "collector", target: 1000, progress: 1000, unlocked: true });
  assert.deepEqual(achievementCompletion(achievements), { unlocked: 2, total: 3, percent: 67 });
});
