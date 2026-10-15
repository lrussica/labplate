// welle3_ah.js — Batch 24: dals, indische Gewürze, wonton, napa
module.exports = {
  urad_dal: {
    displayName: 'Urad Dal (geschält, getrocknet)',
    aliases: ['urad dal','urad','schwarze linsen','black gram dal','urad dhal'],
    per100g: { protein: 25.0, fat: 1.5, netCarbs: 59.0, fiber: 18.0, kcal: 341 },
    source: 'USDA FDC 174257 (Lentils, raw) — Urad-Naeherung'
  },
  chana_dal: {
    displayName: 'Chana Dal (geschälte Kichererbse, getrocknet)',
    aliases: ['chana dal','chana dhal','split chickpeas','geschälte kichererbsen'],
    per100g: { protein: 20.0, fat: 5.0, netCarbs: 55.0, fiber: 12.0, kcal: 360 },
    source: 'USDA FDC 173757 (Chickpeas, split, raw)'
  },
  toor_dal: {
    displayName: 'Toor Dal (gelbe Erbsen, getrocknet)',
    aliases: ['toor dal','tuvar dal','arhar dal','yellow pigeon peas','gelbe hülsenfrüchte'],
    per100g: { protein: 22.0, fat: 1.5, netCarbs: 60.0, fiber: 15.0, kcal: 343 },
    source: 'USDA FDC 172422 (Pigeon peas, mature seeds, raw)'
  },
  fenugreek: {
    displayName: 'Bockshornkleesamen',
    aliases: ['bockshornklee','fenugreek','methi','fenugrec','fieno greco','çemen otu'],
    per100g: { protein: 23.0, fat: 6.4, netCarbs: 33.0, fiber: 24.6, kcal: 323 },
    source: 'USDA FDC 171323 (Fenugreek seed)'
  },
  mustard_seeds: {
    displayName: 'Senfkörner (schwarz)',
    aliases: ['senfkörner','senfsaat','mustard seeds','black mustard','graines de moutarde','semi di senape','hardal tohumu'],
    per100g: { protein: 26.0, fat: 36.0, netCarbs: 15.0, fiber: 12.0, kcal: 508 },
    source: 'USDA FDC 170178 (Mustard seed, yellow)'
  },
  curry_leaves: {
    displayName: 'Curryblätter (frisch)',
    aliases: ['curryblätter','curry leaves','feuilles de curry','foglie di curry','köri yaprağı'],
    per100g: { protein: 6.1, fat: 1.0, netCarbs: 15.0, fiber: 6.4, kcal: 108 },
    source: 'Schaetzung (Murraya koenigii, frisch)'
  },
  baking_soda: {
    displayName: 'Natron (Backsoda)',
    aliases: ['natron','backsoda','baking soda','bicarbonate de soude','bicarbonato di sodio','karbonat'],
    per100g: { protein: 0.0, fat: 0.0, netCarbs: 0.0, fiber: 0.0, kcal: 0 },
    source: 'USDA FDC 172821 (Leavening agents, baking soda)'
  },
  wonton_wrapper: {
    displayName: 'Wonton-Teigblätter',
    aliases: ['wonton blätter','wonton wrapper','wonton teig','pâte wonton','sfoglie wonton','wonton hamuru'],
    per100g: { protein: 9.0, fat: 2.0, netCarbs: 55.0, fiber: 1.5, kcal: 290 },
    source: 'Schaetzung (Wonton-Wrapper, kommerziell)'
  },
  napa_cabbage: {
    displayName: 'Napa-Kohl (Chinakohl)',
    aliases: ['napa kohl','chinakohl','napa cabbage','chou chinois','cavolo cinese','çin lahanası'],
    per100g: { protein: 1.2, fat: 0.2, netCarbs: 2.2, fiber: 1.2, kcal: 16 },
    source: 'USDA FDC 169978 (Cabbage, chinese, pe-tsai, raw)'
  }
};
