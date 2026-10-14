// welle3_ad.js — tapioca_starch, rice_flour, vinegar_rice, cream
module.exports = {
  tapioca_starch: {
    displayName: 'Tapiokastaerke',
    aliases: ['tapiokastaerke','tapioca starch','tapioca','amidon de tapioca','amido di tapioca'],
    per100g: { protein: 0.0, fat: 0.0, netCarbs: 87.0, fiber: 0.9, kcal: 358 },
    source: 'USDA FDC 168000 (Tapioca, pearl, dry)'
  },
  rice_flour: {
    displayName: 'Reismehl',
    aliases: ['reismehl','rice flour','farine de riz','farina di riso','pirinç unu'],
    per100g: { protein: 6.0, fat: 1.4, netCarbs: 76.0, fiber: 2.4, kcal: 359 },
    source: 'USDA FDC 169714 (Rice flour, white)'
  },
  vinegar_rice: {
    displayName: 'Reisessig',
    aliases: ['reisessig','rice vinegar','vinaigre de riz','aceto di riso','pirinc sirkesi'],
    per100g: { protein: 0.0, fat: 0.0, netCarbs: 2.5, fiber: 0.0, kcal: 18 },
    source: 'USDA FDC 173470 (Vinegar, rice)'
  },
  cream: {
    displayName: 'Sahne',
    aliases: ['sahne','schlagsahne','cream','heavy cream','creme','panna','krema'],
    per100g: { protein: 2.1, fat: 36.1, netCarbs: 2.8, fiber: 0.0, kcal: 345 },
    source: 'USDA FDC 170859 (Cream, heavy whipping)'
  }
};
