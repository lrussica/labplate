'use strict';
module.exports = {

  // --- CHEESE (7) ---
  pecorino: {
    displayName: 'Pecorino Romano (gereift)',
    aliases: ['pecorino', 'pecorino romano', 'schafskaese'],
    per100g: { protein: 28.0, fat: 32.0, netCarbs: 0.0, fiber: 0.0, kcal: 387 },
    source: 'USDA FDC 170849 (Cheese, romano)',
  },
  grana_padano: {
    displayName: 'Grana Padano',
    aliases: ['grana padano', 'grana'],
    per100g: { protein: 33.0, fat: 28.0, netCarbs: 0.0, fiber: 0.0, kcal: 398 },
    source: 'USDA FDC 171244 (Cheese, parmesan, hard)',
  },
  ricotta: {
    displayName: 'Ricotta',
    aliases: ['ricotta', 'ricotta (frisch)'],
    per100g: { protein: 11.3, fat: 13.0, netCarbs: 3.0, fiber: 0.0, kcal: 174 },
    source: 'USDA FDC 170845 (Cheese, ricotta, whole milk)',
  },
  gorgonzola: {
    displayName: 'Gorgonzola',
    aliases: ['gorgonzola', 'gorgonzola dolce'],
    per100g: { protein: 21.4, fat: 28.7, netCarbs: 2.3, fiber: 0.0, kcal: 353 },
    source: 'USDA FDC 171251 (Cheese, blue)',
  },
  provolone: {
    displayName: 'Provolone',
    aliases: ['provolone', 'provolone dolce'],
    per100g: { protein: 25.6, fat: 26.6, netCarbs: 2.1, fiber: 0.0, kcal: 351 },
    source: 'USDA FDC 171255 (Cheese, provolone)',
  },
  cheddar: {
    displayName: 'Cheddar',
    aliases: ['cheddar', 'cheddar (gereift)'],
    per100g: { protein: 24.9, fat: 33.1, netCarbs: 1.3, fiber: 0.0, kcal: 402 },
    source: 'USDA FDC 173414 (Cheese, cheddar)',
  },
  blue_cheese: {
    displayName: 'Blaueschimmelkaese',
    aliases: ['blauschimmelkaese', 'blue cheese', 'roquefort'],
    per100g: { protein: 21.4, fat: 28.7, netCarbs: 2.3, fiber: 0.0, kcal: 353 },
    source: 'USDA FDC 171251 (Cheese, blue)',
  },

  // --- CONDIMENT (1) ---
  fish_sauce: {
    displayName: 'Fischsauce (Nam Pla)',
    aliases: ['fischsauce', 'fish sauce', 'nam pla'],
    per100g: { protein: 5.1, fat: 0.0, netCarbs: 3.6, fiber: 0.0, kcal: 35 },
    source: 'USDA FDC 174532 (Sauce, fish, ready-to-serve)',
  },

  // --- FAT (6) ---
  lard: {
    displayName: 'Schweineschmalz',
    aliases: ['schmalz', 'schweineschmalz', 'lard'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 902 },
    source: 'USDA FDC 171411 (Lard)',
  },
  guanciale_fat: {
    displayName: 'Guanciale-Fett',
    aliases: ['guanciale fett', 'guanciale fat'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 902 },
    source: 'USDA (geschaetzt: Schweinebacken-Fett)',
  },
  pancetta_fat: {
    displayName: 'Pancetta-Fett',
    aliases: ['pancetta fett', 'pancetta fat'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 902 },
    source: 'USDA (geschaetzt: Schweinebauch-Fett)',
  },
  beef_tallow: {
    displayName: 'Rindertalg',
    aliases: ['rindertalg', 'talg', 'beef tallow'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 902 },
    source: 'USDA FDC 171412 (Fat, beef tallow)',
  },
  duck_fat: {
    displayName: 'Entenfett',
    aliases: ['entenfett', 'duck fat'],
    per100g: { protein: 0.0, fat: 99.8, netCarbs: 0.0, fiber: 0.0, kcal: 882 },
    source: 'USDA FDC (geschaetzt: Gefluegelfett)',
  },
  sesame_oil: {
    displayName: 'Sesamoel',
    aliases: ['sesamoel', 'sesam oel', 'sesame oil'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 884 },
    source: 'USDA FDC 171016 (Oil, sesame, salad or cooking)',
  },

  // --- LIQUID (5) ---
  white_wine: {
    displayName: 'Weisswein (trocken)',
    aliases: ['weisswein', 'white wine'],
    per100g: { protein: 0.1, fat: 0.0, netCarbs: 2.6, fiber: 0.0, kcal: 82 },
    source: 'USDA FDC 174837 (Alcoholic beverage, wine, table, white)',
  },
  red_wine: {
    displayName: 'Rotwein (trocken)',
    aliases: ['rotwein', 'red wine'],
    per100g: { protein: 0.1, fat: 0.0, netCarbs: 2.6, fiber: 0.0, kcal: 85 },
    source: 'USDA FDC 173190 (Alcoholic beverage, wine, table, red)',
  },
  vinegar: {
    displayName: 'Essig (Weisswein)',
    aliases: ['essig', 'weissweinessig', 'vinegar'],
    per100g: { protein: 0.0, fat: 0.0, netCarbs: 0.9, fiber: 0.0, kcal: 21 },
    source: 'USDA FDC 172237 (Vinegar, cider)',
  },
  rice_vinegar: {
    displayName: 'Reisessig',
    aliases: ['reisesessig', 'rice vinegar'],
    per100g: { protein: 0.0, fat: 0.0, netCarbs: 0.5, fiber: 0.0, kcal: 18 },
    source: 'USDA (geschaetzt: Rice vinegar)',
  },
  beer: {
    displayName: 'Bier',
    aliases: ['bier', 'beer'],
    per100g: { protein: 0.5, fat: 0.0, netCarbs: 3.6, fiber: 0.0, kcal: 43 },
    source: 'USDA FDC 174136 (Alcoholic beverage, beer, regular, all)',
  },

  // --- MEAT_FISH (5) ---
  guanciale: {
    displayName: 'Guanciale (Schweinebacke, roh)',
    aliases: ['guanciale', 'schweinebacke'],
    per100g: { protein: 9.5, fat: 68.0, netCarbs: 0.0, fiber: 0.0, kcal: 655 },
    source: 'USDA (geschaetzt: Pork jowl, raw)',
  },
  pancetta: {
    displayName: 'Pancetta (Rohspeck, gewuerzt)',
    aliases: ['pancetta', 'rohspeck'],
    per100g: { protein: 14.0, fat: 36.0, netCarbs: 0.5, fiber: 0.0, kcal: 393 },
    source: 'USDA FDC 167900 (Pork, bacon, unprepared)',
  },
  anchovy: {
    displayName: 'Sardellen (in Oel)',
    aliases: ['sardellen', 'anchovy', 'anchovies'],
    per100g: { protein: 28.9, fat: 9.7, netCarbs: 0.0, fiber: 0.0, kcal: 210 },
    source: 'USDA FDC 174184 (Fish, anchovy, european, canned in oil, drained)',
  },
  bacon: {
    displayName: 'Bacon / Speck (roh)',
    aliases: ['bacon', 'schinkenspeck'],
    per100g: { protein: 37.0, fat: 42.0, netCarbs: 1.4, fiber: 0.0, kcal: 541 },
    source: 'USDA FDC 167899 (Pork, cured, bacon, unprepared)',
  },
  chorizo: {
    displayName: 'Chorizo (Wurst)',
    aliases: ['chorizo', 'chorizo (wurst)'],
    per100g: { protein: 24.1, fat: 38.3, netCarbs: 2.0, fiber: 0.0, kcal: 455 },
    source: 'USDA FDC 174613 (Chorizo, pork and beef)',
  },

};
