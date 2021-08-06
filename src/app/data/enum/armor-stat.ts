import {EnumDictionary} from "../types/EnumDictionary";

export enum ArmorStat {
  Mobility,
  Resilience,
  Recovery,
  Discipline,
  Intellect,
  Strength
}

export const ArmorStatNames: EnumDictionary<ArmorStat, string> = {
  [ArmorStat.Mobility]: "Mobility",
  [ArmorStat.Resilience]: "Resilience",
  [ArmorStat.Recovery]: "Recovery",
  [ArmorStat.Discipline]: "Discipline",
  [ArmorStat.Intellect]: "Intellect",
  [ArmorStat.Strength]: "Strength"
}

type Literal<T extends ArmorStat> = `${T}`;
export type ArmorStatLiteral = Literal<ArmorStat>;

export enum SpecialArmorStat {
  ClassAbilityRegenerationStat = 10
}
