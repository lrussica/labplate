// welle3_az.js — Batch 42
module.exports = {
  liver: {
    displayName: "Leber (Lamm)",
    aliases: ["leber","lammleber","liver","lamb liver","foie d agneau","fegato di agnello","kuzu cigeri"],
    per100g: { protein: 20.4, fat: 4.0, netCarbs: 1.8, fiber: 0.0, kcal: 135 },
    source: "USDA FDC 174398 (Lamb, variety meats, liver, raw)"
  },
  kidney_beef: {
    displayName: "Rinderniere",
    aliases: ["rinderniere","niere vom rind","beef kidney","kidney beef","rognon de boeuf","rognone di manzo","dana bobrek"],
    per100g: { protein: 17.4, fat: 3.1, netCarbs: 0.3, fiber: 0.0, kcal: 99 },
    source: "USDA FDC 174409 (Beef, variety meats, kidney, raw)"
  },
  suet: {
    displayName: "Rindernierenfett",
    aliases: ["rindernierenfett","nierenfett","suet","beef suet","graisse de rognon","grasso di rognone","ic yagi"],
    per100g: { protein: 1.5, fat: 94.0, netCarbs: 0.0, fiber: 0.0, kcal: 854 },
    source: "USDA FDC 171314 (Fat, beef tallow)"
  },
  stout: {
    displayName: "Stout (Guinness)",
    aliases: ["stout","guinness","irishtout","biere stout","birra stout","siyah bira"],
    per100g: { protein: 0.3, fat: 0.0, netCarbs: 3.8, fiber: 0.0, kcal: 35 },
    source: "Schaetzung (Stout, 4,2 vol%)"
  },
  port_wine: {
    displayName: "Portwein",
    aliases: ["portwein","port","port wine","vin de porto","vino porto","porto sarabi"],
    per100g: { protein: 0.1, fat: 0.0, netCarbs: 14.0, fiber: 0.0, kcal: 157 },
    source: "USDA FDC 174820 (Alcoholic beverage, wine, dessert, sweet)"
  },
  cheddar: {
    displayName: "Cheddar",
    aliases: ["cheddar","cheddar kaese","cheese cheddar","fromage cheddar","formaggio cheddar","cheddar peyniri"],
    per100g: { protein: 24.9, fat: 33.1, netCarbs: 1.3, fiber: 0.0, kcal: 403 },
    source: "USDA FDC 173414 (Cheese, cheddar)"
  }
};
