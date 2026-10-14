// welle3_ac.js — white_fish, palm_oil, kecap_manis, paprika
module.exports = {
  white_fish: {
    displayName: 'Weissfisch (Filet)',
    aliases: ['weissfisch','white fish','poisson blanc','pesce bianco','beyaz balik'],
    per100g: { protein: 18.0, fat: 2.0, netCarbs: 0.0, fiber: 0.0, kcal: 90 },
    source: 'USDA FDC 175167 (Fish, cod, Pacific, raw)'
  },
  palm_oil: {
    displayName: 'Palmöl',
    aliases: ['palmoel','dende','azeite de dendê','palm oil'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 884 },
    source: 'USDA FDC 171015 (Oil, palm)'
  },
  kecap_manis: {
    displayName: 'Kecap Manis (süsse Sojasauce)',
    aliases: ['kecap manis','suesze sojasauce','sweet soy sauce','ketjap manis'],
    per100g: { protein: 2.0, fat: 0.0, netCarbs: 60.0, fiber: 0.0, kcal: 250 },
    source: 'Schaetzung (Kecap Manis)'
  },
  paprika: {
    displayName: 'Paprikapulver',
    aliases: ['paprikapulver','paprika powder','paprika doux','paprika dolce','tatli kirmizi biber'],
    per100g: { protein: 14.1, fat: 12.9, netCarbs: 19.1, fiber: 34.9, kcal: 282 },
    source: 'USDA FDC 170932 (Spices, paprika)'
  }
};
