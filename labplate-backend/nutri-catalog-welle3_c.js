'use strict';
module.exports = {

  // --- SPICE (17) ---
  curry_leaf: {
    displayName: 'Curryblaetter (frisch)',
    aliases: ['curryblaetter', 'curry leaf', 'curry leaves'],
    per100g: { protein: 6.1, fat: 1.0, netCarbs: 57.0, fiber: 20.0, kcal: 197 },
    source: 'USDA (geschaetzt: Curry leaves, fresh)',
  },
  bay_leaf: {
    displayName: 'Lorbeerblatt (getrocknet)',
    aliases: ['lorbeerblatt', 'lorbeer', 'bay leaf', 'bay leaves'],
    per100g: { protein: 7.6, fat: 8.4, netCarbs: 48.6, fiber: 26.3, kcal: 313 },
    source: 'USDA FDC 172232 (Spices, bay leaf)',
  },
  cinnamon_stick: {
    displayName: 'Zimtstange',
    aliases: ['zimtstange', 'zimt (stange)', 'cinnamon stick'],
    per100g: { protein: 4.0, fat: 1.2, netCarbs: 27.5, fiber: 53.1, kcal: 247 },
    source: 'USDA FDC 171320 (Spices, cinnamon, ground)',
  },
  clove: {
    displayName: 'Gewuerznelke',
    aliases: ['gewuerznelke', 'nelke', 'clove', 'cloves'],
    per100g: { protein: 6.0, fat: 13.0, netCarbs: 31.6, fiber: 33.9, kcal: 274 },
    source: 'USDA FDC 171321 (Spices, cloves, ground)',
  },
  cardamom: {
    displayName: 'Kardamom',
    aliases: ['kardamom', 'cardamom'],
    per100g: { protein: 10.8, fat: 6.7, netCarbs: 40.5, fiber: 28.0, kcal: 311 },
    source: 'USDA FDC 170917 (Spices, cardamom)',
  },
  coriander_seed: {
    displayName: 'Koriandersamen',
    aliases: ['koriandersamen', 'coriander seed'],
    per100g: { protein: 12.4, fat: 17.8, netCarbs: 13.1, fiber: 41.9, kcal: 298 },
    source: 'USDA FDC 170922 (Spices, coriander seed)',
  },
  mustard_seed: {
    displayName: 'Senfkoerner',
    aliases: ['senfkoerner', 'senfsaat', 'mustard seed'],
    per100g: { protein: 26.1, fat: 36.2, netCarbs: 15.9, fiber: 12.2, kcal: 508 },
    source: 'USDA FDC 170891 (Spices, mustard seed, yellow)',
  },
  paprika_smoked: {
    displayName: 'Paprikapulver (geraeuchert)',
    aliases: ['paprikapulver geraeuchert', 'paprika smoked', 'pimenton'],
    per100g: { protein: 14.1, fat: 12.9, netCarbs: 23.2, fiber: 34.9, kcal: 282 },
    source: 'USDA FDC 171329 (Spices, paprika, smoked)',
  },
  turmeric: {
    displayName: 'Kurkuma',
    aliases: ['kurkuma', 'gelbwurz', 'turmeric'],
    per100g: { protein: 9.7, fat: 3.2, netCarbs: 44.4, fiber: 22.7, kcal: 312 },
    source: 'USDA FDC 172231 (Spices, turmeric, ground)',
  },
  cumin_ground: {
    displayName: 'Kreuzkuemmel (gemahlen)',
    aliases: ['kreuzkuemmel gemahlen', 'cumin ground'],
    per100g: { protein: 17.8, fat: 22.3, netCarbs: 33.7, fiber: 10.5, kcal: 375 },
    source: 'USDA FDC 170923 (Spices, cumin seed)',
  },
  coriander_ground: {
    displayName: 'Koriander (gemahlen)',
    aliases: ['koriander gemahlen', 'coriander ground'],
    per100g: { protein: 12.4, fat: 17.8, netCarbs: 13.1, fiber: 41.9, kcal: 298 },
    source: 'USDA FDC 170922 (Spices, coriander seed)',
  },
  chili_powder: {
    displayName: 'Chilipulver',
    aliases: ['chilipulver', 'chili powder'],
    per100g: { protein: 13.5, fat: 14.3, netCarbs: 29.7, fiber: 34.8, kcal: 282 },
    source: 'USDA FDC 171328 (Spices, chili powder)',
  },
  garam_masala: {
    displayName: 'Garam Masala',
    aliases: ['garam masala'],
    per100g: { protein: 14.0, fat: 15.0, netCarbs: 28.0, fiber: 24.0, kcal: 379 },
    source: 'USDA (geschaetzt: Garam Masala, Mischung)',
  },
  nutmeg: {
    displayName: 'Muskatnuss',
    aliases: ['muskatnuss', 'muskat', 'nutmeg'],
    per100g: { protein: 5.8, fat: 36.3, netCarbs: 28.5, fiber: 20.8, kcal: 525 },
    source: 'USDA FDC 171320 (Spices, nutmeg, ground)',
  },

  // --- VEGETABLE + DIVERSE (7) ---
  shallot: {
    displayName: 'Schalotte',
    aliases: ['schalotte', 'schalotten', 'shallot', 'shallots'],
    per100g: { protein: 2.5, fat: 0.1, netCarbs: 13.6, fiber: 3.2, kcal: 72 },
    source: 'USDA FDC 170497 (Shallots, raw)',
  },
  chili: {
    displayName: 'Chili (frisch)',
    aliases: ['chili', 'chilischote', 'peperoni', 'chili pepper'],
    per100g: { protein: 1.9, fat: 0.4, netCarbs: 7.3, fiber: 1.5, kcal: 40 },
    source: 'USDA FDC 170106 (Peppers, hot chili, red, raw)',
  },
  lemongrass: {
    displayName: 'Zitronengras',
    aliases: ['zitronengras', 'lemongrass', 'lemon grass'],
    per100g: { protein: 1.8, fat: 0.5, netCarbs: 25.3, fiber: 0.0, kcal: 99 },
    source: 'USDA FDC 169286 (Lemon grass (citronella), raw)',
  },
  yogurt: {
    displayName: 'Joghurt (natur, 3,5%)',
    aliases: ['joghurt', 'naturjoghurt', 'yogurt', 'yoghurt'],
    per100g: { protein: 3.5, fat: 3.3, netCarbs: 4.7, fiber: 0.0, kcal: 61 },
    source: 'USDA FDC 170886 (Yogurt, plain, whole milk)',
  },
  capers: {
    displayName: 'Kapern',
    aliases: ['kapern', 'capers'],
    per100g: { protein: 2.4, fat: 0.9, netCarbs: 1.7, fiber: 3.2, kcal: 23 },
    source: 'USDA FDC 172238 (Capers, canned)',
  },
  artichoke: {
    displayName: 'Artischocke',
    aliases: ['artischocke', 'artischocken', 'artichoke'],
    per100g: { protein: 3.3, fat: 0.2, netCarbs: 6.3, fiber: 5.4, kcal: 47 },
    source: 'USDA FDC 169213 (Artichokes, (globe or french), raw)',
  },
  olive: {
    displayName: 'Oliven (gruen/schwarz)',
    aliases: ['oliven', 'olive', 'olives'],
    per100g: { protein: 1.0, fat: 15.3, netCarbs: 3.1, fiber: 3.2, kcal: 145 },
    source: 'USDA FDC 169094 (Olives, ripe, canned (small-extra large))',
  },

};
