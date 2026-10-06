// nutri-catalog.js
// LabPlate Naehrwert-Katalog — kuratierte Zutaten mit geprueften Makros pro 100 g/ml.
// Quellen: USDA FoodData Central (CC0, public domain) und BLS 4.0 (CC BY 4.0, Max Rubner-Institut).
// Stand: 2026-10-06
// Hinweis: Werte sind USDA-basiert; einzelne Werte koennen spaeter gegen BLS 4.0 verifiziert werden.
// Verwendung: applyCatalogOverride(ingredients) ersetzt KI-Makros durch diese Werte.
// WICHTIG: Diese Datei ist die einzige Stelle, an der Makros gepflegt werden.
'use strict';

const CATALOG = {
  // ---------- PROTEINE ----------
  tofu_firm: {
    displayName: 'Tofu, fest',
    aliases: ['tofu (fest)', 'tofu fest', 'tofu, fest', 'fester tofu', 'festes tofu', 'tofu'],
    per100g: { protein: 17.3, fat: 8.7, netCarbs: 0.5, fiber: 2.3, kcal: 144 },
    source: 'USDA FDC 172475 (Tofu, raw, firm, prepared with calcium sulfate)',
  },
  tempeh: {
    displayName: 'Tempeh',
    aliases: ['tempeh'],
    per100g: { protein: 20.3, fat: 10.8, netCarbs: 7.6, fiber: 1.4, kcal: 192 },
    source: 'USDA FDC 174272 (Tempeh; Ballaststoffe fehlen bei USDA, Wert aus BLS-Schaetzung)',
  },
  chicken_breast: {
    displayName: 'Haehnchenbrust (roh)',
    aliases: ['haehnchenbrust', 'haehnchenbrust (roh)', 'haehnerbrust', 'huhn', 'haehnchen', 'chicken breast'],
    per100g: { protein: 22.5, fat: 2.6, netCarbs: 0.0, fiber: 0.0, kcal: 120 },
    source: 'USDA FDC 171077 (Chicken, broilers or fryers, breast, skinless, boneless, meat only, raw)',
  },
  salmon: {
    displayName: 'Lachs (roh)',
    aliases: ['lachs', 'lachs (roh)', 'lachsfilet', 'salmon'],
    per100g: { protein: 20.4, fat: 13.4, netCarbs: 0, fiber: 0, kcal: 208 },
    source: 'USDA FDC 175167',
  },
  beef_mince: {
    displayName: 'Rinderhackfleisch',
    aliases: ['rinderhack', 'rinderhackfleisch', 'hackfleisch', 'rind', 'beef mince'],
    per100g: { protein: 17.7, fat: 18.1, netCarbs: 0.0, fiber: 0.0, kcal: 239 },
    source: 'USDA FDC 173068 (Beef, Australian, grass-fed, ground, 85/15, raw)',
  },
  egg: {
    displayName: 'Ei',
    aliases: ['ei', 'eier', 'ei (groesse m, ca. 60 g)', 'huehnerei', 'huehnereier'],
    per100g: { protein: 12.6, fat: 9.5, netCarbs: 0.7, fiber: 0.0, kcal: 148 },
    source: 'USDA FDC 748967 (Egg, whole, raw, Grade A Large)',
  },
  lentils_dry: {
    displayName: 'Linsen (trocken)',
    aliases: ['linsen', 'linsen (trocken)', 'linsen trocken', 'rote linsen', 'gruene linsen', 'berglinsen'],
    per100g: { protein: 24.6, fat: 1.1, netCarbs: 52.7, fiber: 10.7, kcal: 352 },
    source: 'USDA FDC 172420 (Lentils, raw)',
  },
  chickpeas_cooked: {
    displayName: 'Kichererbsen (gekocht)',
    aliases: ['kichererbsen', 'kichererbsen (gekocht)', 'kichererbsen gekocht'],
    per100g: { protein: 8.9, fat: 2.6, netCarbs: 19.8, fiber: 7.6, kcal: 164 },
    source: 'USDA FDC 173757 (Chickpeas, mature seeds, cooked, boiled, without salt)',
  },
  greek_yogurt: {
    displayName: 'Griechischer Joghurt',
    aliases: ['griechischer joghurt', 'joghurt griechisch', 'greek yogurt'],
    per100g: { protein: 9.0, fat: 5.0, netCarbs: 4.0, fiber: 0.0, kcal: 97 },
    source: 'USDA FDC 171304 (Yogurt, Greek, plain, whole milk)',
  },

  // ---------- KOHLENHYDRATE / SAMEN / NUESSE ----------
  rice_dry: {
    displayName: 'Reis (trocken)',
    aliases: ['reis', 'reis (trocken)', 'reis trocken', 'weisser reis', 'basmatireis', 'jasminreis'],
    per100g: { protein: 7.1, fat: 0.7, netCarbs: 78.7, fiber: 1.3, kcal: 365 },
    source: 'USDA FDC 169756 (Rice, white, long-grain, regular, raw, unenriched)',
  },
  quinoa_dry: {
    displayName: 'Quinoa (trocken)',
    aliases: ['quinoa', 'quinoa (trocken)', 'quinoa trocken'],
    per100g: { protein: 14.1, fat: 6.1, netCarbs: 57.2, fiber: 7.0, kcal: 368 },
    source: 'USDA FDC 168874',
  },
  oats: {
    displayName: 'Haferflocken',
    aliases: ['haferflocken', 'hafer', 'oats'],
    per100g: { protein: 13.2, fat: 6.5, netCarbs: 57.6, fiber: 10.1, kcal: 380 },
    source: 'USDA FDC 173904 (Cereals, oats, regular and quick, unenriched, dry)',
  },
  sweet_potato: {
    displayName: 'Suesskartoffel',
    aliases: ['suesskartoffel', 'suesskartoffeln', 'sweet potato'],
    per100g: { protein: 1.6, fat: 0.1, netCarbs: 17.1, fiber: 3.0, kcal: 90 },
    source: 'USDA FDC 168483 (Sweet potato, cooked, baked in skin, flesh, without salt)',
  },
  chia_seeds: {
    displayName: 'Chiasamen',
    aliases: ['chiasamen', 'chia', 'chia-samen', 'chia samen'],
    per100g: { protein: 16.5, fat: 30.7, netCarbs: 7.7, fiber: 34.4, kcal: 486 },
    source: 'USDA FDC 170554',
  },
  flax_seeds: {
    displayName: 'Leinsamen',
    aliases: ['leinsamen', 'flaxseed'],
    per100g: { protein: 18.3, fat: 42.2, netCarbs: 1.6, fiber: 27.3, kcal: 534 },
    source: 'USDA FDC 169414',
  },
  almonds: {
    displayName: 'Mandeln',
    aliases: ['mandeln', 'mandel', 'almonds'],
    per100g: { protein: 21.2, fat: 49.9, netCarbs: 9.1, fiber: 12.5, kcal: 579 },
    source: 'USDA FDC 170567',
  },
  walnuts: {
    displayName: 'Walnuesse',
    aliases: ['walnuesse', 'walnuss', 'walnuts'],
    per100g: { protein: 15.2, fat: 65.2, netCarbs: 7.0, fiber: 6.7, kcal: 654 },
    source: 'USDA FDC 170187',
  },

  // ---------- GEMUESE ----------
  broccoli: {
    displayName: 'Brokkoli',
    aliases: ['brokkoli', 'brokkoli (frisch)', 'broccoli'],
    per100g: { protein: 2.8, fat: 0.4, netCarbs: 3.6, fiber: 2.6, kcal: 34 },
    source: 'USDA FDC 170379',
  },
  spinach: {
    displayName: 'Spinat',
    aliases: ['spinat', 'spinat (frisch)', 'babyspinat'],
    per100g: { protein: 2.9, fat: 0.4, netCarbs: 1.4, fiber: 2.2, kcal: 23 },
    source: 'USDA FDC 168462',
  },
  zucchini: {
    displayName: 'Zucchini',
    aliases: ['zucchini', 'zucchini (frisch)', 'courgette'],
    per100g: { protein: 1.2, fat: 0.3, netCarbs: 2.1, fiber: 1.0, kcal: 17 },
    source: 'USDA FDC 169291',
  },
  bell_pepper_red: {
    displayName: 'Paprika (rot)',
    aliases: ['paprika', 'paprika (rot)', 'paprika rot', 'rote paprika', 'rote paprikaschote'],
    per100g: { protein: 1.0, fat: 0.3, netCarbs: 4.2, fiber: 2.1, kcal: 26 },
    source: 'USDA FDC 170108 (Peppers, sweet, red, raw)',
  },
  tomato: {
    displayName: 'Tomate',
    aliases: ['tomate', 'tomaten', 'tomate (frisch)'],
    per100g: { protein: 0.9, fat: 0.2, netCarbs: 2.8, fiber: 1.2, kcal: 18 },
    source: 'USDA FDC 170457',
  },
  avocado: {
    displayName: 'Avocado',
    aliases: ['avocado', 'avocados'],
    per100g: { protein: 2.0, fat: 14.7, netCarbs: 1.8, fiber: 6.7, kcal: 160 },
    source: 'USDA FDC 171705',
  },
  cauliflower: {
    displayName: 'Blumenkohl',
    aliases: ['blumenkohl', 'cauliflower'],
    per100g: { protein: 1.9, fat: 0.3, netCarbs: 3.0, fiber: 2.0, kcal: 25 },
    source: 'USDA FDC 169986',
  },

  // ---------- FETTE / FLUESSIGES ----------
  olive_oil: {
    displayName: 'Olivenoel',
    aliases: ['olivenoel', 'olive oil'],
    per100g: { protein: 0, fat: 100, netCarbs: 0, fiber: 0, kcal: 884 },
    source: 'USDA FDC 171413',
  },
  butter: {
    displayName: 'Butter',
    aliases: ['butter', 'suessrahmbutter'],
    per100g: { protein: 0.9, fat: 81.1, netCarbs: 0.1, fiber: 0, kcal: 717 },
    source: 'USDA FDC 173410',
  },
  coconut_oil: {
    displayName: 'Kokosoel',
    aliases: ['kokosoel', 'kokosfett', 'coconut oil'],
    per100g: { protein: 0, fat: 99.1, netCarbs: 0, fiber: 0, kcal: 892 },
    source: 'USDA FDC 171412 (Oil, coconut)',
  },
  coconut_milk_light: {
    displayName: 'Kokosmilch (light)',
    aliases: ['kokosmilch (light)', 'kokosmilch light', 'light kokosmilch'],
    per100g: { protein: 1.0, fat: 7.0, netCarbs: 1.5, fiber: 0.5, kcal: 73 },
    source: 'Herstellerangabe (typisch fuer Light-Kokosmilch; kein USDA-FDC-Standardeintrag)',
  },
  coconut_milk_full: {
    displayName: 'Kokosmilch',
    aliases: ['kokosmilch', 'kokosmilch (normal)', 'kokosmilch normal', 'kokosmilch vollfett'],
    per100g: { protein: 2.3, fat: 23.8, netCarbs: 3.4, fiber: 2.2, kcal: 230 },
    source: 'USDA FDC 170172 (canned, regular)',
  },
  water: {
    displayName: 'Wasser',
    aliases: ['wasser', 'water'],
    per100g: { protein: 0, fat: 0, netCarbs: 0, fiber: 0, kcal: 0 },
    source: 'definiert (0 kcal)',
  },

  // ---------- GEWUERZE ----------
  salt: {
    displayName: 'Salz',
    aliases: ['salz', 'meersalz', 'kochsalz'],
    per100g: { protein: 0, fat: 0, netCarbs: 0, fiber: 0, kcal: 0 },
    source: 'definiert (0 kcal)',
  },
  black_pepper: {
    displayName: 'Pfeffer (schwarz)',
    aliases: ['pfeffer', 'schwarzer pfeffer', 'pfeffer (schwarz)', 'pfeffer schwarz'],
    per100g: { protein: 10.4, fat: 3.3, netCarbs: 38.7, fiber: 25.3, kcal: 251 },
    source: 'USDA FDC 170931',
  },
  curry_powder: {
    displayName: 'Currypulver',
    aliases: ['currypulver', 'curry', 'curry-pulver', 'curry pulver'],
    per100g: { protein: 14.3, fat: 14.0, netCarbs: 2.6, fiber: 53.2, kcal: 325 },
  },

  // ---------- ERWEITERUNG 2026-10-06 (USDA-verifiziert) ----------
  onion_yellow: {
    displayName: 'Zwiebel (gelb)',
    aliases: ['zwiebel', 'zwiebel (gelb)', 'zwiebel gelb', 'gelbe zwiebel', 'onion'],
    per100g: { protein: 1.1, fat: 0.1, netCarbs: 7.6, fiber: 1.7, kcal: 40 },
    source: 'USDA FDC 170000 (Onions, raw)',
  },
  garlic: {
    displayName: 'Knoblauch',
    aliases: ['knoblauch', 'knoblauchzehe', 'knoblauchzehen', 'zehe knoblauch', 'garlic'],
    per100g: { protein: 6.4, fat: 0.5, netCarbs: 31.0, fiber: 2.1, kcal: 149 },
    source: 'USDA FDC 169230 (Garlic, raw)',
  },
  ginger_fresh: {
    displayName: 'Ingwer (frisch)',
    aliases: ['ingwer', 'ingwer (frisch)', 'ingwer frisch', 'frischer ingwer', 'ginger'],
    per100g: { protein: 1.8, fat: 0.8, netCarbs: 15.8, fiber: 2.0, kcal: 80 },
    source: 'USDA FDC 169231 (Ginger root, raw)',
  },
  lime_juice: {
    displayName: 'Limettensaft',
    aliases: ['limettensaft', 'saft einer limette', 'limette saft', 'lime juice'],
    per100g: { protein: 0.4, fat: 0.1, netCarbs: 8.0, fiber: 0.4, kcal: 25 },
    source: 'USDA FDC 168156 (Lime juice, raw)',
  },
  lemon_juice: {
    displayName: 'Zitronensaft',
    aliases: ['zitronensaft', 'saft einer zitrone', 'zitrone saft', 'lemon juice'],
    per100g: { protein: 0.4, fat: 0.2, netCarbs: 6.6, fiber: 0.3, kcal: 22 },
    source: 'USDA FDC 167747 (Lemon juice, raw)',
  },
  soy_sauce: {
    displayName: 'Sojasauce',
    aliases: ['sojasauce', 'soja sauce', 'soya sauce', 'soy sauce'],
    per100g: { protein: 8.1, fat: 0.6, netCarbs: 4.1, fiber: 0.8, kcal: 53 },
    source: 'USDA FDC 174277 (Soy sauce made from soy and wheat / shoyu)',
  },
  parmesan: {
    displayName: 'Parmesan',
    aliases: ['parmesan', 'parmesankaese', 'parmigiano', 'parmigiano reggiano'],
    per100g: { protein: 35.8, fat: 25.0, netCarbs: 3.2, fiber: 0.0, kcal: 392 },
    source: 'USDA FDC 170848 (Cheese, parmesan, hard)',
  },
  mozzarella: {
    displayName: 'Mozzarella',
    aliases: ['mozzarella', 'mozzarella (frisch)', 'bueffelmozzarella'],
    per100g: { protein: 22.2, fat: 22.1, netCarbs: 2.4, fiber: 0.0, kcal: 299 },
    source: 'USDA FDC 170845 (Cheese, mozzarella, whole milk)',
  },
  gouda: {
    displayName: 'Gouda',
    aliases: ['gouda', 'gouda kaese', 'goudakaese'],
    per100g: { protein: 24.9, fat: 27.4, netCarbs: 2.2, fiber: 0.0, kcal: 356 },
    source: 'USDA FDC 171241 (Cheese, gouda)',
  },
  almond_flour: {
    displayName: 'Mandelmehl',
    aliases: ['mandelmehl', 'mandel mehl', 'almond flour'],
    per100g: { protein: 26.2, fat: 50.2, netCarbs: 6.9, fiber: 9.3, kcal: 584 },
    source: 'USDA FDC 2261420 (Flour, almond; kcal aus Makros berechnet, Foundation ohne kcal-Wert)',
  },
  peanuts: {
    displayName: 'Erdnuesse',
    aliases: ['erdnuesse', 'erdnuss', 'erdnusskerne', 'peanuts'],
    per100g: { protein: 25.2, fat: 48.8, netCarbs: 8.0, fiber: 8.5, kcal: 563 },
    source: 'USDA FDC 172434 (Peanuts, virginia, raw)',
  },
  sesame_seeds: {
    displayName: 'Sesam',
    aliases: ['sesam', 'sesamsamen', 'sesamsamen (geroestet)', 'sesamkoerner', 'sesame'],
    per100g: { protein: 17.7, fat: 49.7, netCarbs: 11.6, fiber: 11.8, kcal: 573 },
    source: 'USDA FDC 170150 (Seeds, sesame seeds, whole, dried)',
  },
  spring_onion: {
    displayName: 'Fruehlingszwiebel',
    aliases: ['fruehlingszwiebel', 'fruehlingszwiebeln', 'junge zwiebel', 'scallion'],
    per100g: { protein: 1.8, fat: 0.2, netCarbs: 4.7, fiber: 2.6, kcal: 32 },
    source: 'USDA FDC 170005 (Onions, spring or scallions, raw)',
  },
  cucumber: {
    displayName: 'Gurke',
    aliases: ['gurke', 'gurken', 'salatgurke', 'cucumber'],
    per100g: { protein: 0.7, fat: 0.1, netCarbs: 3.1, fiber: 0.5, kcal: 15 },
    source: 'USDA FDC 168409 (Cucumber, with peel, raw)',
  },
  mushroom_button: {
    displayName: 'Champignons',
    aliases: ['champignons', 'champignon', 'weisse champignons', 'button mushroom'],
    per100g: { protein: 3.1, fat: 0.3, netCarbs: 2.3, fiber: 1.0, kcal: 22 },
    source: 'USDA FDC 169251 (Mushrooms, white, raw)',
  },
  canola_oil: {
    displayName: 'Rapsoel',
    aliases: ['rapsoel', 'raps-oel', 'raps oel', 'canola oil'],
    per100g: { protein: 0, fat: 100.0, netCarbs: 0, fiber: 0, kcal: 884 },
    source: 'USDA FDC 172336 (Oil, canola)',
  },
};

// ---------- Matching ----------

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Umlaut-Variante: ae/oe/ue/ss -> ae/oe/ue/ss. Fuer Match beider Schreibweisen.
function umlautNormalize(s) {
  return String(s || '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

// Kandidaten-Schluessel fuer einen Zutatennamen:
//   "Tofu (fest)" -> ["tofu (fest)", "tofu fest", "tofu"]
function candidatesFor(name) {
  const raw = normalize(name);
  const out = new Set();
  out.add(raw);
  out.add(raw.replace(/\(/g, ' ').replace(/\)/g, ' ').replace(/\s+/g, ' ').trim());
  out.add(raw.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim());
  // Zusaetzlich umlaut-normalisierte Variante jedes Kandidaten.
  const list = Array.from(out).filter(Boolean);
  for (const c of list) {
    const u = umlautNormalize(c);
    if (u !== c) out.add(u);
  }
  return Array.from(out).filter(Boolean);
}

// Alias-Index bauen: alias -> catalogKey. Kollisionen werden auf null gesetzt.
const ALIAS_INDEX = (function () {
  const idx = {};
  function put(k, key) {
    if (!idx[k]) idx[k] = key;
    else if (idx[k] !== key) idx[k] = null;
  }
  for (const key of Object.keys(CATALOG)) {
    for (const a of CATALOG[key].aliases) {
      const n = normalize(a);
      put(n, key);
      const u = umlautNormalize(n);
      if (u !== n) put(u, key);
    }
  }
  return idx;
})();

// Sucht den Catalog-Eintrag fuer einen Zutatennamen. Returns { key, entry } oder null.
function lookupCatalog(name) {
  const cands = candidatesFor(name);
  for (const c of cands) {
    const key = ALIAS_INDEX[c];
    if (key) return { key, entry: CATALOG[key] };
  }
  return null;
}

// Ueberschreibt macrosPer100g aller Zutaten, deren Name im Catalog steht.
// Mutiert das Array in-place. Gibt Statistik zurueck.
function applyCatalogOverride(ingredients) {
  const stats = { total: 0, overridden: 0, unchanged: 0, entries: [] };
  if (!Array.isArray(ingredients)) return stats;
  for (const ing of ingredients) {
    stats.total++;
    const hit = lookupCatalog(ing && ing.name);
    if (!hit) { stats.unchanged++; continue; }
    const p = hit.entry.per100g;
    ing.macrosPer100g = {
      netCarbs: p.netCarbs,
      fat: p.fat,
      protein: p.protein,
      fiber: p.fiber,
    };
    ing._catalogKey = hit.key;
    ing._catalogSource = hit.entry.source;
    stats.overridden++;
    stats.entries.push({ name: ing.name, key: hit.key });
  }
  return stats;
}

module.exports = {
  CATALOG,
  lookupCatalog,
  applyCatalogOverride,
  candidatesFor,
};
