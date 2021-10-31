import {Configuration} from "../data/configuration";
import {IInventoryArmor} from "../data/types/IInventoryArmor";
import {buildDb} from "../data/database";
import {ArmorSlot} from "../data/enum/armor-slot";
import {DID_NOT_SELECT_EXOTIC, FORCE_USE_NO_EXOTIC} from "../data/constants";
import {ModInformation} from "../data/ModInformation";
import {ArmorStat, SpecialArmorStat, STAT_MOD_VALUES, StatModifier} from "../data/enum/armor-stat";

const slotToEnum: { [id: string]: ArmorSlot; } = {
  "Helmets": ArmorSlot.ArmorSlotHelmet,
  "Arms": ArmorSlot.ArmorSlotGauntlet,
  "Chest": ArmorSlot.ArmorSlotChest,
  "Legs": ArmorSlot.ArmorSlotLegs,
}

const db = buildDb(async () => {
})
const inventoryArmor = db.table("inventoryArmor");

addEventListener('message', async ({data}) => {
  const startTime = Date.now();
  console.debug("START RESULTS BUILDER 2")
  console.time("total")
  const config = data.config as Configuration;

  let exoticItemInfo = config.selectedExoticHash <= DID_NOT_SELECT_EXOTIC
    ? null
    : await inventoryArmor.where("hash").equals(config.selectedExoticHash).first() as IInventoryArmor


  let items = (await inventoryArmor.where("clazz").equals(config.characterClass)
    .toArray() as IInventoryArmor[])

  items = items
    // filter disabled items
    .filter(item => config.disabledItems.indexOf(item.itemInstanceId) == -1)
    // filter the selected exotic right here (config.selectedExoticHash)
    .filter(item => config.selectedExoticHash != FORCE_USE_NO_EXOTIC || !item.isExotic)
    // .filter(item => !item.isExotic || config.selectedExoticHash <= DID_NOT_SELECT_EXOTIC || config.selectedExoticHash == item.hash)
    .filter(item => exoticItemInfo == null || exoticItemInfo.slot != item.slot || exoticItemInfo.hash == item.hash)
    // config.onlyUseMasterworkedItems - only keep masterworked items
    .filter(item => !config.onlyUseMasterworkedItems || item.masterworked)
    .filter(item =>
      config.ignoreArmorAffinitiesOnMasterworkedItems
      || !item.masterworked
      || config.fixedArmorAffinities[slotToEnum[item.slot]] == 0
      || config.fixedArmorAffinities[slotToEnum[item.slot]] == item.energyAffinity
    )
  //.toArray() as IInventoryArmor[];
  console.log("items.len", items.length)
  console.log("ITEMS", items.length, items)


  const helmets = items.filter(i => i.slot == "Helmets")
  const gauntlets = items.filter(i => i.slot == "Arms")
  const chests = items.filter(i => i.slot == "Chest")
  const legs = items.filter(i => i.slot == "Legs")

  console.log({helmets, gauntlets, chests, legs})


  // runtime variables
  const runtime = {
    maximumPossibleTiers: [0, 0, 0, 0, 0, 0],
    statCombo3x100: new Set(),
    statCombo4x100: new Set(),
  }

  let results: any[] = []
  let listedResults = 0;
  let totalResults = 0;

  console.time("tm")
  for (let helmet of helmets) {
    // HALLOWEEN SPECIAL
    if (config.eventHalloweenOnlyUseMask) {
      if (
        helmet.hash != 2545426109 // warlock
        && helmet.hash != 199733460 // Titan
        && helmet.hash != 3224066584 // Hunter
      ) continue;
    }
    // /HALLOWEEN SPECIAL
    for (let gauntlet of gauntlets) {
      if (helmet.isExotic && gauntlet.isExotic) continue;
      for (let chest of chests) {
        if ((helmet.isExotic || gauntlet.isExotic) && chest.isExotic) continue;
        for (let leg of legs) {
          if ((helmet.isExotic || gauntlet.isExotic || chest.isExotic) && leg.isExotic) continue;
          /**
           *  At this point we already have:
           *  - Masterworked items, if they must be masterworked (config.onlyUseMasterworkedItems)
           *  - disabled items were already removed (config.disabledItems)
           */
          const result = handlePermutation(runtime, config, helmet, gauntlet, chest, leg,
            (config.limitParsedResults && listedResults >= 5e4) || listedResults >= 1e6
          );
          // Only add 50k to the list if the setting is activated.
          // We will still calculate the rest so that we get accurate results for the runtime values
          if (result != null) {
            totalResults++;
            if (result !== "DONOTSEND") {
              results.push(result)
              listedResults++;
            }
          }
          //}
          if (results.length >= 5000) {
            // @ts-ignore
            postMessage({runtime, results, done: false, total: 0});
            results = []
          }
        }
      }
    }
  }
  console.timeEnd("tm")
  console.timeEnd("total")

  //for (let n = 0; n < 6; n++)
  //  runtime.maximumPossibleTiers[n] = Math.floor(Math.min(100, runtime.maximumPossibleTiers[n]) / 10)

  // @ts-ignore
  postMessage({
    runtime,
    results,
    done: true,
    stats: {
      permutationCount: totalResults,
      itemCount: items.length,
      totalTime: Date.now() - startTime
    }
  });
})

/**
 * Returns null, if the permutation is invalid.
 * This code does not utilize fancy filters and other stuff.
 * This results in ugly code BUT it is way way WAY faster!
 */
function handlePermutation(
  runtime: any,
  config: Configuration,
  helmet: IInventoryArmor,
  gauntlet: IInventoryArmor,
  chest: IInventoryArmor,
  leg: IInventoryArmor,
  doNotOutput = false
): any {
  const items = [helmet, gauntlet, chest, leg]
  // yes. this is ugly, but it is fast
  const stats: [number, number, number, number, number, number] = [
    helmet.mobility + gauntlet.mobility + chest.mobility + leg.mobility,
    helmet.resilience + gauntlet.resilience + chest.resilience + leg.resilience,
    helmet.recovery + gauntlet.recovery + chest.recovery + leg.recovery,
    helmet.discipline + gauntlet.discipline + chest.discipline + leg.discipline,
    helmet.intellect + gauntlet.intellect + chest.intellect + leg.intellect,
    helmet.strength + gauntlet.strength + chest.strength + leg.strength,
  ]

  var totalStatBonus = config.assumeClassItemMasterworked ? 2 : 0;

  for (let item of items) {  // add masterworked value, if necessary
    if (item.masterworked
      || (!item.isExotic && config.assumeLegendariesMasterworked)
      || (item.isExotic && config.assumeExoticsMasterworked))
      totalStatBonus += 2;
  }
  stats[0] += totalStatBonus;
  stats[1] += totalStatBonus;
  stats[2] += totalStatBonus;
  stats[3] += totalStatBonus;
  stats[4] += totalStatBonus;
  stats[5] += totalStatBonus;

  const statsWithoutMods = [stats[0], stats[1], stats[2], stats[3], stats[4], stats[5]]

  // Apply configurated mods to the stat value
  // Apply mods
  for (const mod of config.enabledMods) {
    for (const bonus of ModInformation[mod].bonus) {
      var statId = bonus.stat == SpecialArmorStat.ClassAbilityRegenerationStat
        ? [1, 0, 3][config.characterClass]
        : bonus.stat
      stats[statId] += bonus.value;
    }
  }


  // required mods for each stat
  const requiredMods = [
    Math.ceil(Math.max(0, config.minimumStatTier[0] - stats[0] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTier[1] - stats[1] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTier[2] - stats[2] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTier[3] - stats[3] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTier[4] - stats[4] / 10)),
    Math.ceil(Math.max(0, config.minimumStatTier[5] - stats[5] / 10)),
  ]
  const requiredModsTotal = requiredMods[0] + requiredMods[1] + requiredMods[2] + requiredMods[3] + requiredMods[4] + requiredMods[5]
  let usedMods: number[] = []
  // only calculate mods if necessary. If we are already above the limit there's no reason to do the rest
  if (requiredModsTotal > config.maximumStatMods) {
    return null;
  } else if (requiredModsTotal > 0) {
    //console.log({requiredModsTotal, usedMods})
    for (let statId = 0; statId < 6; statId++) {
      if (requiredMods[statId] == 0) continue;
      const statDifference = stats[statId] % 10;
      if (statDifference > 0 && statDifference % 10 >= 5) {
        usedMods.push((1 + (statId * 2)) as StatModifier)
        requiredMods[statId]--;
        stats[statId] += 5
      }
      for (let n = 0; n < requiredMods[statId]; n++) {
        usedMods.push((1 + (statId * 2 + 1)) as StatModifier)
        stats[statId] += 10
      }
    }

    // force mod limits from configuration
    // this means: first, convert all major mods to minor mods, if necessary
    // then, look if there are more minor mods than allowed, return false;
    // also, if more minor mods are there than allowed, return false too;

    usedMods = usedMods.sort();

    for (let statId = 0; statId < 6; statId++) {
      const minorModId = (1 + (statId * 2)) as StatModifier
      const majorModId = (1 + minorModId) as StatModifier
      // convert major mods
      let amountMajor = usedMods.filter(d => d == majorModId).length;
      while (amountMajor > config.statModLimitation[statId as ArmorStat][1]) {
        usedMods.splice(usedMods.indexOf(majorModId), 1)
        usedMods.push(minorModId)
        usedMods.push(minorModId)
        amountMajor--;
      }

      const amountMinor = usedMods.filter(d => d == minorModId).length
      if (amountMinor > config.statModLimitation[statId as ArmorStat][0])
        return null;
    }

    if (usedMods.length > config.maximumStatMods)
      return null;
  }

  // Check if we should add our results at all
  if (config.onlyShowResultsWithNoWastedStats) {
    // Definitely return when we encounter stats above 100
    if (stats.filter(d => d > 100).length > 0)
      return null;
    // definitely return when we encounter stats that can not be fixed
    if (stats.filter(d => d % 5 != 0).length > 0)
      return null;

    // now find out how many mods we need to fix our stats to 0 waste
    // Yes, this is basically duplicated code. But necessary.
    let waste = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, i) => [v % 10, i, v]).sort((a, b) => b[0] - a[0])

    for (let id = usedMods.length; id < config.maximumStatMods; id++) {
      let result = waste.filter(a => a[0] >= 5).filter(k => k[2] < 100).sort((a, b) => a[0] - b[0])[0]
      if (!result) break;
      const minorModId = (1 + (result[1] * 2)) as StatModifier;
      const minorModCount = usedMods.filter(d => d == minorModId).length
      if (minorModCount < config.statModLimitation[result[1] as ArmorStat][0]) {
        stats[result[1]] += 5
        usedMods.push(1 + 2 * result[1])
      } else {
        id--;
      }
      result[0] -= 5;
    }
    const waste1 = getWaste(stats);
    if (waste1 > 0)
      return null;
  }
  if (usedMods.length > config.maximumStatMods)
    return null;


  // get maximum possible stat and write them into the runtime
  // Get maximal possible stats and write them in the runtime variable

  for (let n = 0; n < 6; n++) {
    const freeMods = (config.maximumStatMods - usedMods.length)
    const usedMajorMods = Math.min(freeMods, config.statModLimitation[n as ArmorStat][1])
    const usedMinorMods = Math.min(freeMods - usedMajorMods, config.statModLimitation[n as ArmorStat][0])
    let freeSpace = 10 * usedMajorMods + 5 * usedMinorMods;

    const maximum = stats[n] + freeSpace;
    if (maximum > runtime.maximumPossibleTiers[n])
      runtime.maximumPossibleTiers[n] = maximum
  }

  // Get maximal possible stats and write them in the runtime variable
  // Calculate how many 100 stats we can achieve
  let openModSlots = config.maximumStatMods - usedMods.length
  if (true) { // TODO: remove this if

    let possible100Stats = []

    for (let n = 0; n < 6; n++) {
      const armorStat = n as ArmorStat;
      let value = Math.max(0, 100 - stats[armorStat])

      if (value <= 0) {
        possible100Stats.push([armorStat, 0])
        continue;
      }
      else if (openModSlots == 0) continue;
      const minorModId = (1 + (armorStat * 2)) as StatModifier;
      const majorModId = 1 + minorModId as StatModifier;
      const usedMajorMods = usedMods.filter(d => d == majorModId).length
      const usedMinorMods = usedMods.filter(d => d == minorModId).length
      const availableMajorMods = Math.min(openModSlots, config.statModLimitation[armorStat][1] - usedMajorMods)
      const availableMinorMods = Math.min(openModSlots - availableMajorMods, config.statModLimitation[armorStat][0] - usedMinorMods)
      if (value - 10 * availableMajorMods - 5 * availableMinorMods > 0)
        continue;

      let tmpUsedMods = 0;
      for (let mj = 0; mj < availableMajorMods && value > 0; mj++, tmpUsedMods++) {
        value -= 10;
      }
      for (let mi = 0; mi < availableMinorMods && value > 0; mi++, tmpUsedMods++) {
        value -= 5;
      }
      possible100Stats.push([armorStat, tmpUsedMods])
    }
    if (possible100Stats.length >= 3) {
      possible100Stats = possible100Stats.sort((a, b) => a[1] - b[1])
      const requiredSteps3x100 = possible100Stats[0][1] + possible100Stats[1][1] + possible100Stats[2][1];
      if (requiredSteps3x100 <= openModSlots) {
        runtime.statCombo3x100.add((1 << possible100Stats[0][0]) + (1 << possible100Stats[1][0]) + (1 << possible100Stats[2][0]));

        if (possible100Stats.length >= 4 && ((requiredSteps3x100 + possible100Stats[3][1]) <= openModSlots)) {
          runtime.statCombo4x100.add(
            (1 << possible100Stats[0][0])
            + (1 << possible100Stats[1][0])
            + (1 << possible100Stats[2][0])
            + (1 << possible100Stats[3][0])
          );
        }
      }
    }
  }
  if (doNotOutput) return "DONOTSEND";

  // Add mods to reduce stat waste
  // TODO: here's still potential to speed up code
  const freeMods = 10 * (config.maximumStatMods - usedMods.length)
  if (config.tryLimitWastedStats && freeMods > 0) {

    let waste = [
      stats[ArmorStat.Mobility],
      stats[ArmorStat.Resilience],
      stats[ArmorStat.Recovery],
      stats[ArmorStat.Discipline],
      stats[ArmorStat.Intellect],
      stats[ArmorStat.Strength]
    ].map((v, i) => [v % 10, i, v]).sort((a, b) => b[0] - a[0])

    for (let id = usedMods.length; id < config.maximumStatMods; id++) {
      let result = waste.filter(a => a[0] >= 5).filter(k => k[2] < 100).sort((a, b) => a[0] - b[0])[0]
      if (!result) break;

      const minorModId = (1 + (result[1] * 2)) as StatModifier;
      const minorModCount = usedMods.filter(d => d == minorModId).length
      if (minorModCount < config.statModLimitation[result[1] as ArmorStat][0]) {
        stats[result[1]] += 5
        usedMods.push(1 + 2 * result[1])
      } else {
        id--;
      }
      result[0] -= 5;
    }
  }


  const waste1 = getWaste(stats);
  if (config.onlyShowResultsWithNoWastedStats && waste1 > 0)
    return null;

  const exotic = helmet.isExotic ? helmet : gauntlet.isExotic ? gauntlet : chest.isExotic ? chest : leg.isExotic ? leg : null
  return {
    exotic: exotic == null ? null : {
      icon: exotic.icon,
      name: exotic.name
    },
    modCount: usedMods.length,
    modCost: usedMods.reduce((p, d: StatModifier) => p + STAT_MOD_VALUES[d][2], 0),
    mods: usedMods,
    stats: stats,
    statsNoMods: statsWithoutMods,
    tiers: getSkillTier(stats),
    waste: waste1,
    items: items.map((instance: IInventoryArmor) => {
      return {
        energy: instance.energyAffinity,
        icon: instance.icon,
        itemInstanceId: instance.itemInstanceId,
        name: instance.name,
        exotic: !!instance.isExotic,
        masterworked: instance.masterworked,
        mayBeBugged: instance.mayBeBugged,
        transferState: 0, // TRANSFER_NONE
        stats: [
          instance.mobility, instance.resilience, instance.recovery,
          instance.discipline, instance.intellect, instance.strength
        ]
      }
    })
  }

}


function getSkillTier(stats: number[]) {
  return Math.floor(Math.min(100, stats[ArmorStat.Mobility]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Resilience]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Recovery]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Discipline]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Intellect]) / 10)
    + Math.floor(Math.min(100, stats[ArmorStat.Strength]) / 10)
}

function getWaste(stats: number[]) {
  return (stats[ArmorStat.Mobility] > 100 ? stats[ArmorStat.Mobility] - 100 : stats[ArmorStat.Mobility] % 10)
    + (stats[ArmorStat.Resilience] > 100 ? stats[ArmorStat.Resilience] - 100 : stats[ArmorStat.Resilience] % 10)
    + (stats[ArmorStat.Recovery] > 100 ? stats[ArmorStat.Recovery] - 100 : stats[ArmorStat.Recovery] % 10)
    + (stats[ArmorStat.Discipline] > 100 ? stats[ArmorStat.Discipline] - 100 : stats[ArmorStat.Discipline] % 10)
    + (stats[ArmorStat.Intellect] > 100 ? stats[ArmorStat.Intellect] - 100 : stats[ArmorStat.Intellect] % 10)
    + (stats[ArmorStat.Strength] > 100 ? stats[ArmorStat.Strength] - 100 : stats[ArmorStat.Strength] % 10)
}
