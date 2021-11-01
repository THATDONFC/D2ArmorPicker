import {Component, OnInit} from '@angular/core';
import {ConfigurationService} from "../../../../services/configuration.service";
import {MAXIMUM_STAT_MOD_AMOUNT} from "../../../../data/constants";
import {ArmorStat, ArmorStatNames} from "../../../../data/enum/armor-stat";
import {EnumDictionary} from "../../../../data/types/EnumDictionary";

@Component({
  selector: 'app-desired-mod-selection',
  templateUrl: './desired-mod-limit-selection.component.html',
  styleUrls: ['./desired-mod-limit-selection.component.scss']
})
export class DesiredModLimitSelectionComponent implements OnInit {
  ArmorStatNames = ArmorStatNames;
  readonly ModRange = new Array(MAXIMUM_STAT_MOD_AMOUNT + 1);
  selection: number = MAXIMUM_STAT_MOD_AMOUNT;

  config_statModLimitation: EnumDictionary<ArmorStat, [number, number]> = {
    [ArmorStat.Mobility]: [5, 5],
    [ArmorStat.Resilience]: [5, 5],
    [ArmorStat.Recovery]: [5, 5],
    [ArmorStat.Discipline]: [5, 5],
    [ArmorStat.Intellect]: [5, 5],
    [ArmorStat.Strength]: [5, 5]
  };

  constructor(public config: ConfigurationService) {
  }

  ngOnInit(): void {
    this.config.configuration.subscribe(c => {
      this.selection = c.maximumStatMods;
      this.config_statModLimitation = c.statModLimitation;
    })
  }

  setValue(i: number) {
    this.selection = i;
    this.config.modifyConfiguration(c => c.maximumStatMods = i);
  }

  get armorStats() {
    return [
      ArmorStat.Mobility,
      ArmorStat.Resilience,
      ArmorStat.Recovery,
      ArmorStat.Discipline,
      ArmorStat.Intellect,
      ArmorStat.Strength,
    ]
  }

  setLimitation(stat: ArmorStat, minorOrMajor: 0 | 1, amount: number) {
    if (this.config_statModLimitation != null && this.config_statModLimitation[stat][minorOrMajor] != amount)
      this.config.modifyConfiguration(cb => {
        cb.statModLimitation[stat][minorOrMajor] = amount;
      })
  }
}
