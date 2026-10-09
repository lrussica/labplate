'use strict';
module.exports = {

  // --- HERB (8 verbleibend; basil, oregano, cilantro, dill = alias) ---
  sage: {
    displayName: 'Salbei (frisch)',
    aliases: ['salbei', 'sage', 'sage fresh'],
    per100g: { protein: 3.0, fat: 0.8, netCarbs: 1.0, fiber: 1.6, kcal: 49 },
    source: 'USDA FDC 170935 (Sage, fresh)',
  },
  chive: {
    displayName: 'Schnittlauch',
    aliases: ['schnittlauch', 'chive', 'chives'],
    per100g: { protein: 3.3, fat: 0.7, netCarbs: 1.9, fiber: 2.5, kcal: 30 },
    source: 'USDA FDC 171571 (Chives, raw)',
  },
  scallion_green: {
    displayName: 'Fruehlingszwiebel (gruen)',
    aliases: ['fruehlingszwiebel gruen', 'scallion green'],
    per100g: { protein: 1.8, fat: 0.2, netCarbs: 4.7, fiber: 2.6, kcal: 32 },
    source: 'USDA FDC 170005 (Onions, spring or scallions, raw)',
  },
  tarragon: {
    displayName: 'Estragon (frisch)',
    aliases: ['estragon', 'tarragon', 'tarragon fresh'],
    per100g: { protein: 3.0, fat: 0.7, netCarbs: 1.0, fiber: 7.4, kcal: 24 },
    source: 'USDA (geschaetzt: Tarragon, fresh)',
  },

  // --- NUT (6 verbleibend; cashew, sesame = alias) ---
  pine_nut: {
    displayName: 'Pinienkerne',
    aliases: ['pinienkerne', 'pine nut', 'pine nuts'],
    per100g: { protein: 13.7, fat: 68.4, netCarbs: 9.4, fiber: 3.7, kcal: 673 },
    source: 'USDA FDC 170591 (Nuts, pine nuts, dried)',
  },
  pistachio: {
    displayName: 'Pistazien',
    aliases: ['pistazien', 'pistazie', 'pistachio'],
    per100g: { protein: 20.2, fat: 45.3, netCarbs: 16.6, fiber: 10.6, kcal: 562 },
    source: 'USDA FDC 170184 (Nuts, pistachio nuts, raw)',
  },

  // --- THICKENER (4) ---
  flour: {
    displayName: 'Mehl (Weizen, Type 405)',
    aliases: ['mehl', 'weizenmehl', 'flour', 'wheat flour'],
    per100g: { protein: 10.3, fat: 1.0, netCarbs: 74.4, fiber: 2.7, kcal: 364 },
    source: 'USDA FDC 168894 (Wheat flour, white, all-purpose, enriched)',
  },
  cornstarch: {
    displayName: 'Speisestaerke (Mais)',
    aliases: ['speisestaerke', 'maisstaerke', 'cornstarch'],
    per100g: { protein: 0.3, fat: 0.1, netCarbs: 91.3, fiber: 0.9, kcal: 381 },
    source: 'USDA FDC 169698 (Cornstarch)',
  },
  arrowroot: {
    displayName: 'Pfeilwurzelmehl (Arrowroot)',
    aliases: ['pfeilwurzelmehl', 'arrowroot'],
    per100g: { protein: 0.3, fat: 0.1, netCarbs: 87.9, fiber: 3.4, kcal: 357 },
    source: 'USDA FDC 168886 (Arrowroot flour)',
  },
  potato_starch: {
    displayName: 'Kartoffelstaerke',
    aliases: ['kartoffelstaerke', 'kartoffelmehl', 'potato starch'],
    per100g: { protein: 0.1, fat: 0.1, netCarbs: 83.1, fiber: 0.0, kcal: 357 },
    source: 'USDA (geschaetzt: Potato starch)',
  },

};
