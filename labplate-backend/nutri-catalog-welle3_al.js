// welle3_al.js — Batch 28: burger, wings, mac, thyme, dates
module.exports = {
  burger_bun: {
    displayName: 'Burgerbrötchen (Weißbrot)',
    aliases: ['burgerbrötchen','hamburgerbrötchen','burger bun','bun','pain burger','panino burger','burger ekmeği'],
    per100g: { protein: 9.5, fat: 4.0, netCarbs: 50.0, fiber: 2.3, kcal: 275 },
    source: 'Schaetzung (Burger-Bun, kommerziell)'
  },
  lettuce: {
    displayName: 'Kopfsalat (roh)',
    aliases: ['kopfsalat','salat','lettuce','laitue','lattuga','marul'],
    per100g: { protein: 1.4, fat: 0.2, netCarbs: 1.8, fiber: 1.3, kcal: 15 },
    source: 'USDA FDC 169247 (Lettuce, iceberg, raw)'
  },
  ketchup: {
    displayName: 'Ketchup',
    aliases: ['ketchup','tomatenketchup','tomato ketchup','ketchup de tomate','ketchup di pomodoro','ketçap'],
    per100g: { protein: 1.0, fat: 0.1, netCarbs: 22.0, fiber: 0.3, kcal: 101 },
    source: 'USDA FDC 174533 (Catsup)'
  },
  chicken_wings: {
    displayName: 'Hähnchenflügel (roh, mit Haut)',
    aliases: ['hähnchenflügel','chicken wings','ailes de poulet','alette di pollo','tavuk kanat'],
    per100g: { protein: 18.3, fat: 12.8, netCarbs: 0.0, fiber: 0.0, kcal: 191 },
    source: 'USDA FDC 171478 (Chicken, broilers, wing, meat and skin, raw)'
  },
  hot_sauce: {
    displayName: 'Hot Sauce (Tabasco/Cayenne)',
    aliases: ['hot sauce','tabasco','cayenne sauce','sauce piquante','salsa piccante','acı sos'],
    per100g: { protein: 1.3, fat: 0.8, netCarbs: 0.5, fiber: 0.4, kcal: 12 },
    source: 'USDA FDC 174526 (Sauce, ready-to-serve, pepper, TABASCO)'
  },
  macaroni: {
    displayName: 'Makkaroni (roh)',
    aliases: ['makkaroni','macaroni','maccheroni','makarna','penne'],
    per100g: { protein: 13.0, fat: 1.5, netCarbs: 74.0, fiber: 3.2, kcal: 371 },
    source: 'USDA FDC 168928 (Pasta, dry, enriched)'
  },
  thyme: {
    displayName: 'Thymian (frisch)',
    aliases: ['thymian','thyme','thym','timo','kekik'],
    per100g: { protein: 5.6, fat: 1.7, netCarbs: 15.0, fiber: 14.0, kcal: 101 },
    source: 'USDA FDC 173470 (Thyme, fresh)'
  },
  dates: {
    displayName: 'Datteln (getrocknet, entsteint)',
    aliases: ['datteln','dates','dattes','datteri','hurma'],
    per100g: { protein: 2.5, fat: 0.4, netCarbs: 72.0, fiber: 8.0, kcal: 282 },
    source: 'USDA FDC 171393 (Dates, medjool)'
  }
};
