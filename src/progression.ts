export interface MainQuestProgress {
  id: string;
  target: number;
  progress: number;
  claimed: boolean;
}

export interface CodexProgress {
  discoveredSpecies: number;
  totalSpecies: number;
  discoveredTraits: number;
  totalTraits: number;
}

export interface CodexCompletion extends CodexProgress {
  discovered: number;
  total: number;
  percent: number;
  tier: "初识鸡群" | "育种学徒" | "牧场博物家" | "图鉴完成";
}

export interface AchievementProgress {
  id: string;
  target: number;
  progress: number;
  unlocked: boolean;
}

export function activeMainQuestIndex(quests: readonly MainQuestProgress[]): number {
  const firstUnclaimed = quests.findIndex(quest => !quest.claimed);
  return firstUnclaimed < 0 ? quests.length : firstUnclaimed;
}

export function mainQuestUnlocked(index: number, quests: readonly MainQuestProgress[]): boolean {
  return index <= activeMainQuestIndex(quests);
}

export function mainQuestCompletedCount(quests: readonly MainQuestProgress[]): number {
  return quests.filter(quest => quest.claimed).length;
}

export function codexCompletion(progress: CodexProgress): CodexCompletion {
  const discoveredSpecies = Math.min(progress.totalSpecies, Math.max(0, progress.discoveredSpecies));
  const discoveredTraits = Math.min(progress.totalTraits, Math.max(0, progress.discoveredTraits));
  const total = Math.max(0, progress.totalSpecies) + Math.max(0, progress.totalTraits);
  const discovered = discoveredSpecies + discoveredTraits;
  const percent = total ? Math.round(discovered / total * 100) : 100;
  const tier = percent >= 100 ? "图鉴完成" : percent >= 70 ? "牧场博物家" : percent >= 35 ? "育种学徒" : "初识鸡群";
  return { ...progress, discoveredSpecies, discoveredTraits, discovered, total, percent, tier };
}

export function achievementProgress(id: string, target: number, progress: number): AchievementProgress {
  const safeTarget = Math.max(1, target);
  const safeProgress = Math.max(0, progress);
  return { id, target: safeTarget, progress: Math.min(safeTarget, safeProgress), unlocked: safeProgress >= safeTarget };
}

export function achievementCompletion(achievements: readonly AchievementProgress[]): { unlocked: number; total: number; percent: number } {
  const unlocked = achievements.filter(achievement => achievement.unlocked).length;
  const total = achievements.length;
  return { unlocked, total, percent: total ? Math.round(unlocked / total * 100) : 100 };
}
