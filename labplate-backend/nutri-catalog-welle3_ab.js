// welle3_ab.js — coriander, corn_cob, arepa
module.exports = {
  coriander: {
    displayName: 'Koriander (gemahlen)',
    aliases: ['gemahlener koriander','ground coriander','coriandre moulu','coriandolo macinato','öğütülmüş kişniş'],
    per100g: { protein: 12.4, fat: 17.8, netCarbs: 13.1, fiber: 41.9, kcal: 298 },
    source: 'USDA FDC 170922 (Spices, coriander seed)'
  },
  corn_cob: {
    displayName: 'Maiskolben',
    aliases: ['maiskolben','corn on the cob','maïs en épi','pannocchia','mısır koçanı'],
    per100g: { protein: 3.3, fat: 1.4, netCarbs: 16.3, fiber: 2.7, kcal: 86 },
    source: 'USDA FDC 169343 (Corn, sweet, yellow, raw)'
  },
  arepa: {
    displayName: 'Arepa (Maisfladen)',
    aliases: ['maisfladen','arepa de maiz','corn cake'],
    per100g: { protein: 5.0, fat: 5.0, netCarbs: 38.0, fiber: 3.0, kcal: 210 },
    source: 'Schaetzung (Arepa, gegart)'
  }
};
