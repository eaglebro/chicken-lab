import type { TraitId } from "./exploration.ts";

export type SpeciesRarity = "普通" | "少见" | "稀有" | "传奇";

export interface ProductionChicken {
  id: string;
  grain: number;
  feather: number;
  traitProduction: number[];
}

export interface ConversionChicken {
  id: string;
  rarity: SpeciesRarity;
  traitCount: number;
  generation: number;
}

export interface DiscoverySnapshot<TSpecies extends string = string> {
  species: TSpecies[];
  traits: TraitId[];
}

export function traitProductionMultiplier(productionBonuses: number[]): number {
  return 1 + productionBonuses.reduce((sum, bonus) => sum + bonus, 0);
}

export function productionRates(chickens: ProductionChicken[], awayIds: ReadonlySet<string>): { grain: number; feather: number } {
  return chickens.reduce((rates, chicken) => {
    if (awayIds.has(chicken.id)) return rates;
    const multiplier = traitProductionMultiplier(chicken.traitProduction);
    rates.grain += chicken.grain * multiplier;
    rates.feather += chicken.feather * multiplier;
    return rates;
  }, { grain: 0, feather: 0 });
}

export function breedingLockCost(lockedTraits: Array<TraitId | null>, costPerTrait: number): number {
  return lockedTraits.filter(Boolean).length * costPerTrait;
}

export function conversionDust(chicken: ConversionChicken): number {
  const rarityDust: Record<SpeciesRarity, number> = { 普通: 4, 少见: 6, 稀有: 10, 传奇: 16 };
  return rarityDust[chicken.rarity] + Math.max(0, chicken.traitCount - 1) * 2 + Math.max(0, chicken.generation - 1);
}

export function conversionProtected(chickenId: string, teamIds: readonly string[], explorationTeamIds: readonly string[], breedingParentIds: readonly string[]): boolean {
  return teamIds.includes(chickenId) || explorationTeamIds.includes(chickenId) || breedingParentIds.includes(chickenId);
}

export function canConvertSelection(totalChickens: number, selectedCount: number): boolean {
  return selectedCount > 0 && totalChickens - selectedCount >= 2;
}

export function mergeDiscovery<TSpecies extends string>(current: DiscoverySnapshot<TSpecies>, species: TSpecies, traits: TraitId[]): DiscoverySnapshot<TSpecies> {
  return {
    species: [...new Set([...current.species, species])],
    traits: [...new Set([...current.traits, ...traits])]
  };
}
