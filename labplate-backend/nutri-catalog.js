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
    aliases: ['mandeln', 'mandel', 'almonds', 'almond'],
    per100g: { protein: 21.2, fat: 49.9, netCarbs: 9.1, fiber: 12.5, kcal: 579 },
    source: 'USDA FDC 170567',
  },
  walnuts: {
    displayName: 'Walnuesse',
    aliases: ['walnuesse', 'walnuss', 'walnuts', 'walnut'],
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

  // ---------- KRAEUTER + GRUNDZUTATEN 2026-10-06 (USDA-verifiziert) ----------
  coriander_fresh: {
    displayName: 'Koriander (frisch)',
    aliases: ['koriander', 'koriander (frisch)', 'frische korianderblaetter', 'frische korianderblätter', 'korianderblaetter', 'korianderblätter', 'cilantro'],
    per100g: { protein: 2.1, fat: 0.5, netCarbs: 0.9, fiber: 2.8, kcal: 23 },
    source: 'USDA FDC 169997 (Coriander/cilantro leaves, raw)',
  },
  parsley_fresh: {
    displayName: 'Petersilie (frisch)',
    aliases: ['petersilie', 'petersilie (frisch)', 'frische petersilie', 'glatte petersilie', 'parsley'],
    per100g: { protein: 3.0, fat: 0.8, netCarbs: 3.0, fiber: 3.3, kcal: 36 },
    source: 'USDA FDC 170416 (Parsley, fresh)',
  },
  basil_fresh: {
    displayName: 'Basilikum (frisch)',
    aliases: ['basilikum', 'basilikum (frisch)', 'frischer basilikum', 'basil'],
    per100g: { protein: 3.2, fat: 0.6, netCarbs: 1.1, fiber: 1.6, kcal: 23 },
    source: 'USDA FDC 172232 (Basil, fresh)',
  },
  dill_fresh: {
    displayName: 'Dill (frisch)',
    aliases: ['dill', 'dill (frisch)', 'frischer dill', 'dillspitzen'],
    per100g: { protein: 3.5, fat: 1.1, netCarbs: 4.9, fiber: 2.1, kcal: 43 },
    source: 'USDA FDC 172233 (Dill weed, fresh)',
  },
  mint_fresh: {
    displayName: 'Minze (frisch)',
    aliases: ['minze', 'minze (frisch)', 'frische minze', 'pfefferminze', 'minzblaetter', 'minzblätter', 'mint'],
    per100g: { protein: 3.8, fat: 0.9, netCarbs: 6.9, fiber: 8.0, kcal: 70 },
    source: 'USDA FDC 173474 (Peppermint, fresh)',
  },
  oregano_dried: {
    displayName: 'Oregano (getrocknet)',
    aliases: ['oregano', 'oregano (getrocknet)', 'getrockneter oregano'],
    per100g: { protein: 9.0, fat: 4.3, netCarbs: 26.4, fiber: 42.5, kcal: 265 },
    source: 'USDA FDC 171328 (Spices, oregano, dried)',
  },
  thyme_fresh: {
    displayName: 'Thymian (frisch)',
    aliases: ['thymian', 'thymian (frisch)', 'frischer thymian', 'thyme'],
    per100g: { protein: 5.6, fat: 1.7, netCarbs: 10.4, fiber: 14.0, kcal: 101 },
    source: 'USDA FDC 173470 (Thyme, fresh)',
  },
  rosemary_fresh: {
    displayName: 'Rosmarin (frisch)',
    aliases: ['rosmarin', 'rosmarin (frisch)', 'frischer rosmarin', 'rosmarinnadeln', 'rosemary'],
    per100g: { protein: 3.3, fat: 5.9, netCarbs: 6.6, fiber: 14.1, kcal: 131 },
    source: 'USDA FDC 173473 (Rosemary, fresh)',
  },
  tomato_paste: {
    displayName: 'Tomatenmark',
    aliases: ['tomatenmark', 'tomaten paste', 'tomato paste'],
    per100g: { protein: 4.2, fat: 0.7, netCarbs: 15.5, fiber: 4.7, kcal: 85 },
    source: 'USDA FDC 2685580 (Tomato paste, canned; kcal aus Makros berechnet, Foundation ohne kcal)',
  },
  vegetable_broth: {
    displayName: 'Gemuesebruehe',
    aliases: ['gemuesebruehe', 'gemüsebrühe', 'gemuese bruehe', 'gemüse brühe', 'gemuesefond', 'gemüsefond', 'bruehe', 'brühe', 'vegetable broth'],
    per100g: { protein: 0.2, fat: 0.1, netCarbs: 0.9, fiber: 0.0, kcal: 5 },
    source: 'USDA FDC 171583 (Soup, vegetable broth, ready to serve)',
  },
  mustard: {
    displayName: 'Senf',
    aliases: ['senf', 'senf (gelb)', 'gelber senf', 'dijon-senf', 'dijon senf', 'mustard'],
    per100g: { protein: 3.7, fat: 3.3, netCarbs: 1.8, fiber: 4.0, kcal: 60 },
    source: 'USDA FDC 172234 (Mustard, prepared, yellow)',
  },
  vinegar_apple: {
    displayName: 'Apfelessig',
    aliases: ['apfelessig', 'apfel-essig', 'apple cider vinegar', 'cidre-essig'],
    per100g: { protein: 0, fat: 0, netCarbs: 0.9, fiber: 0, kcal: 21 },
    source: 'USDA FDC 173469 (Vinegar, cider)',
  },
  vinegar_balsamic: {
    displayName: 'Balsamico-Essig',
    aliases: ['balsamico', 'balsamico-essig', 'balsamicoessig', 'balsamessig', 'balsamic vinegar'],
    per100g: { protein: 0.5, fat: 0, netCarbs: 17.0, fiber: 0, kcal: 88 },
    source: 'USDA FDC 172241 (Vinegar, balsamic)',
  },
  cinnamon: {
    displayName: 'Zimt',
    aliases: ['zimt', 'zimt (gemahlen)', 'gemahlener zimt', 'zimtpulver', 'cinnamon', 'cinnamon_ground'],
    per100g: { protein: 4.0, fat: 1.2, netCarbs: 27.5, fiber: 53.1, kcal: 247 },
    source: 'USDA FDC 171320 (Spices, cinnamon, ground)',
  },
  cumin: {
    displayName: 'Kreuzkuemmel',
    aliases: ['kreuzkuemmel', 'kreuzkümmel', 'kumin', 'cumin', 'cumin_seed'],
    per100g: { protein: 17.8, fat: 22.3, netCarbs: 33.7, fiber: 10.5, kcal: 375 },
    source: 'USDA FDC 170923 (Spices, cumin seed)',
  },
  paprika_powder: {
    displayName: 'Paprikapulver',
    aliases: ['paprikapulver', 'paprika (gemahlen)', 'gemahlener paprika', 'paprika edelsuess', 'paprika edelsüß', 'paprika powder', 'paprika_sweet'],
    per100g: { protein: 14.1, fat: 12.9, netCarbs: 19.1, fiber: 34.9, kcal: 282 },
    source: 'USDA FDC 171329 (Spices, paprika)',
  },
  curry_paste_red: {
    displayName: 'Curry-Paste (rot)',
    aliases: ['curry-paste (rot)', 'curry-paste rot', 'curry paste (rot)', 'curry paste rot',
              'currypaste (rot)', 'currypaste rot', 'rote curry paste', 'rote curry-paste',
              'rote currypaste', 'thai curry paste', 'thai currypaste', 'red curry paste'],
    per100g: { protein: 3.5, fat: 12.0, netCarbs: 13.0, fiber: 5.0, kcal: 173 },
    source: 'Herstellerangabe (typisch fuer Thai Red Curry Paste; kein USDA-FDC-Standardeintrag)',
  },

  // ---------- ERWEITERUNG 24 Zutaten 2026-10-06 ----------
  turkey_breast: {
    displayName: 'Putenbrust',
    aliases: ['pute', 'putenbrust', 'putenbrustfilet', 'truthahn', 'turkey', 'turkey breast'],
    per100g: { protein: 23.7, fat: 1.5, netCarbs: 0.1, fiber: 0.0, kcal: 114 },
    source: 'USDA FDC 171098 (Turkey, whole, breast, meat only, raw)',
  },
  pork_tenderloin: {
    displayName: 'Schweinefilet',
    aliases: ['schweinefilet', 'schweinfilet', 'schweinefilet (mager)', 'pork tenderloin', 'pork fillet'],
    per100g: { protein: 21.0, fat: 2.2, netCarbs: 0.0, fiber: 0.0, kcal: 109 },
    source: 'USDA FDC 168249 (Pork, tenderloin, separable lean only, raw)',
  },
  shrimp: {
    displayName: 'Garnelen',
    aliases: ['garnelen', 'garnele', 'shrimp', 'prawns', 'prawn', 'crevetten'],
    per100g: { protein: 20.1, fat: 0.5, netCarbs: 0.0, fiber: 0.0, kcal: 85 },
    source: 'USDA FDC 175179 (Crustaceans, shrimp, raw)',
  },
  tuna_canned: {
    displayName: 'Thunfisch (Dose, in Wasser)',
    aliases: ['thunfisch (dose)', 'thunfisch in wasser', 'tuna', 'tuna canned'],
    per100g: { protein: 25.5, fat: 0.8, netCarbs: 0.0, fiber: 0.0, kcal: 116 },
    source: 'USDA FDC 171986 (Fish, tuna, light, canned in water, without salt, drained)',
  },
  feta: {
    displayName: 'Feta',
    aliases: ['feta', 'feta (schafskaese)', 'feta schafskäse', 'feta cheese'],
    per100g: { protein: 14.2, fat: 21.5, netCarbs: 3.9, fiber: 0.0, kcal: 265 },
    source: 'USDA FDC 173420 (Cheese, feta)',
  },
  cottage_cheese: {
    displayName: 'Huettenkaese',
    aliases: ['huettenkaese', 'hüttenkäse', 'cottage cheese', 'koerniger frischkaese', 'körniger frischkäse'],
    per100g: { protein: 12.4, fat: 1.0, netCarbs: 2.7, fiber: 0.0, kcal: 72 },
    source: 'USDA FDC 173417 (Cheese, cottage, lowfat, 1% milkfat)',
  },
  cream_cheese: {
    displayName: 'Frischkaese',
    aliases: ['frischkaese', 'frischkäse', 'cream cheese', 'philadelphia'],
    per100g: { protein: 6.2, fat: 34.4, netCarbs: 5.5, fiber: 0.0, kcal: 350 },
    source: 'USDA FDC 173418 (Cheese, cream)',
  },
  kale: {
    displayName: 'Gruenkohl',
    aliases: ['gruenkohl', 'grünkohl', 'kale', 'federkohl'],
    per100g: { protein: 2.9, fat: 1.5, netCarbs: 0.3, fiber: 4.1, kcal: 35 },
    source: 'USDA FDC 168421 (Kale, raw)',
  },
  brussels_sprouts: {
    displayName: 'Rosenkohl',
    aliases: ['rosenkohl', 'brussels sprouts', 'kohlsprossen'],
    per100g: { protein: 3.4, fat: 0.3, netCarbs: 5.2, fiber: 3.8, kcal: 43 },
    source: 'USDA FDC 170383 (Brussels sprouts, raw)',
  },
  cabbage_white: {
    displayName: 'Weisskohl',
    aliases: ['weisskohl', 'weißkohl', 'kraut', 'weisskraut', 'weißkraut', 'cabbage'],
    per100g: { protein: 1.3, fat: 0.1, netCarbs: 3.3, fiber: 2.5, kcal: 25 },
    source: 'USDA FDC 169975 (Cabbage, raw)',
  },
  leek: {
    displayName: 'Lauch',
    aliases: ['lauch', 'porree', 'leek'],
    per100g: { protein: 1.5, fat: 0.3, netCarbs: 12.4, fiber: 1.8, kcal: 61 },
    source: 'USDA FDC 169246 (Leeks, bulb and lower leaf-portion, raw)',
  },
  asparagus: {
    displayName: 'Spargel',
    aliases: ['spargel', 'asparagus', 'gruener spargel', 'grüner spargel'],
    per100g: { protein: 2.2, fat: 0.1, netCarbs: 1.8, fiber: 2.1, kcal: 20 },
    source: 'USDA FDC 168389 (Asparagus, raw)',
  },
  eggplant: {
    displayName: 'Aubergine',
    aliases: ['aubergine', 'auberginen', 'eggplant', 'melanzani'],
    per100g: { protein: 1.0, fat: 0.2, netCarbs: 2.9, fiber: 3.0, kcal: 25 },
    source: 'USDA FDC 169228 (Eggplant, raw)',
  },
  celery: {
    displayName: 'Sellerie (Staudensellerie)',
    aliases: ['sellerie', 'staudensellerie', 'bleichsellerie', 'celery'],
    per100g: { protein: 0.7, fat: 0.2, netCarbs: 1.4, fiber: 1.6, kcal: 14 },
    source: 'USDA FDC 169988 (Celery, raw)',
  },
  carrot: {
    displayName: 'Karotte',
    aliases: ['karotte', 'karotten', 'moehre', 'möhre', 'moehren', 'möhren', 'carrot', 'carrots'],
    per100g: { protein: 0.9, fat: 0.2, netCarbs: 6.8, fiber: 2.8, kcal: 41 },
    source: 'USDA FDC 170393 (Carrots, raw)',
  },
  cream_heavy: {
    displayName: 'Sahne (Schlagsahne)',
    aliases: ['sahne', 'schlagsahne', 'suesse sahne', 'süße sahne', 'heavy cream', 'whipping cream'],
    per100g: { protein: 2.8, fat: 36.1, netCarbs: 2.8, fiber: 0.0, kcal: 340 },
    source: 'USDA FDC 170859 (Cream, fluid, heavy whipping)',
  },
  creme_fraiche: {
    displayName: 'Schmand / Creme fraiche',
    aliases: ['schmand', 'creme fraiche', 'crème fraîche', 'saure sahne', 'sour cream'],
    per100g: { protein: 2.4, fat: 19.4, netCarbs: 4.6, fiber: 0.0, kcal: 198 },
    source: 'USDA FDC 171257 (Cream, sour, cultured)',
  },
  milk_whole: {
    displayName: 'Vollmilch',
    aliases: ['milch', 'vollmilch', 'milch (3.5%)', 'whole milk'],
    per100g: { protein: 3.2, fat: 3.3, netCarbs: 4.8, fiber: 0.0, kcal: 61 },
    source: 'USDA FDC 171265 (Milk, whole, 3.25% milkfat)',
  },
  cashews: {
    displayName: 'Cashewkerne',
    aliases: ['cashew', 'cashews', 'cashewkerne', 'cashewnuesse', 'cashewnüsse'],
    per100g: { protein: 18.2, fat: 43.8, netCarbs: 26.9, fiber: 3.3, kcal: 553 },
    source: 'USDA FDC 170162 (Nuts, cashew nuts, raw)',
  },
  hazelnuts: {
    displayName: 'Haselnuesse',
    aliases: ['haselnuss', 'haselnuesse', 'haselnüsse', 'hazelnuts', 'hazelnut'],
    per100g: { protein: 15.0, fat: 60.8, netCarbs: 7.0, fiber: 9.7, kcal: 628 },
    source: 'USDA FDC 170581 (Nuts, hazelnuts or filberts)',
  },
  pumpkin_seeds: {
    displayName: 'Kuerbiskerne',
    aliases: ['kuerbiskerne', 'kürbiskerne', 'kuerbiskern', 'kürbiskern', 'pepitas', 'pumpkin seeds'],
    per100g: { protein: 30.2, fat: 49.0, netCarbs: 4.7, fiber: 6.0, kcal: 559 },
    source: 'USDA FDC 170556 (Seeds, pumpkin and squash seed kernels, dried)',
  },
  coconut_flakes: {
    displayName: 'Kokosraspeln',
    aliases: ['kokosraspeln', 'kokosflocken', 'kokosnuss raspeln', 'coconut flakes', 'coconut shredded'],
    per100g: { protein: 6.9, fat: 64.5, netCarbs: 7.3, fiber: 16.3, kcal: 660 },
    source: 'USDA FDC 170170 (Nuts, coconut meat, dried, not sweetened)',
  },
  ghee: {
    displayName: 'Butterschmalz (Ghee)',
    aliases: ['ghee', 'butterschmalz', 'butter clarified'],
    per100g: { protein: 0.0, fat: 100.0, netCarbs: 0.0, fiber: 0.0, kcal: 900 },
    source: 'USDA FDC 171314 (Butter, clarified butter / ghee)',
  },
  potato: {
    displayName: 'Kartoffel',
    aliases: ['kartoffel', 'kartoffeln', 'erdapfel', 'potato', 'potatoes'],
    per100g: { protein: 2.1, fat: 0.1, netCarbs: 15.4, fiber: 2.1, kcal: 77 },
    source: 'USDA FDC 170026 (Potatoes, flesh and skin, raw)',
  },
  // ---------- WELLE 2a (Block E, 2026-10-09) ----------
  // Gemuese & Obst. Naehrwerte USDA FoodData Central.
  // Wo exakter FDC-Code unsicher: '(geschaetzt, zu verifizieren)'.
  apple: {
    displayName: 'Apfel (roh, mit Schale)',
    aliases: ['apfel', 'aepfel', 'apple'],
    per100g: { protein: 0.3, fat: 0.2, netCarbs: 11.4, fiber: 2.4, kcal: 52 },
    source: 'USDA FDC 1750340 (Apples, raw, with skin)',
  },
  arugula: {
    displayName: 'Rucola',
    aliases: ['rucola', 'rauke', 'arugula', 'rocket'],
    per100g: { protein: 2.6, fat: 0.7, netCarbs: 1.4, fiber: 1.6, kcal: 25 },
    source: 'USDA FDC 169387 (Arugula, raw)',
  },
  beetroot: {
    displayName: 'Rote Bete (roh)',
    aliases: ['rote bete', 'randen', 'beetroot', 'beet'],
    per100g: { protein: 1.6, fat: 0.2, netCarbs: 6.8, fiber: 2.8, kcal: 43 },
    source: 'USDA FDC 169145 (Beets, raw)',
  },
  corn: {
    displayName: 'Mais (gekocht)',
    aliases: ['mais', 'maiskoerner', 'corn', 'sweetcorn'],
    per100g: { protein: 3.4, fat: 1.5, netCarbs: 16.7, fiber: 2.4, kcal: 96 },
    source: 'USDA FDC 168425 (Corn, sweet, yellow, cooked, boiled, drained, without salt)',
  },
  dried_cranberry: {
    displayName: 'Cranberries (getrocknet, gesuesst)',
    aliases: ['cranberries', 'getrocknete cranberries', 'craisins', 'dried cranberry'],
    per100g: { protein: 0.2, fat: 0.1, netCarbs: 76.5, fiber: 5.7, kcal: 308 },
    source: 'USDA FDC 173209 (Cranberries, dried, sweetened)',
  },
  edamame: {
    displayName: 'Edamame (gekocht)',
    aliases: ['edamame', 'sojabohnen (gruen)', 'edamame beans'],
    per100g: { protein: 10.9, fat: 5.2, netCarbs: 3.7, fiber: 5.2, kcal: 121 },
    source: 'USDA FDC 168411 (Edamame, frozen, prepared)',
  },
  fennel: {
    displayName: 'Fenchel (roh)',
    aliases: ['fenchel', 'fenchelknolle', 'fennel'],
    per100g: { protein: 1.2, fat: 0.2, netCarbs: 4.2, fiber: 3.1, kcal: 31 },
    source: 'USDA FDC 169385 (Fennel, bulb, raw)',
  },
  grape: {
    displayName: 'Weintrauben',
    aliases: ['weintrauben', 'trauben', 'grape', 'grapes'],
    per100g: { protein: 0.7, fat: 0.2, netCarbs: 16.2, fiber: 0.9, kcal: 69 },
    source: 'USDA FDC 174683 (Grapes, red or green, raw)',
  },
  green_beans: {
    displayName: 'Gruene Bohnen (gekocht)',
    aliases: ['gruene bohnen', 'prinzessbohnen', 'green beans', 'haricots verts'],
    per100g: { protein: 1.9, fat: 0.3, netCarbs: 4.3, fiber: 3.2, kcal: 35 },
    source: 'USDA FDC 169961 (Beans, snap, green, cooked, boiled, drained, without salt)',
  },
  mango: {
    displayName: 'Mango (roh)',
    aliases: ['mango', 'mangos'],
    per100g: { protein: 0.8, fat: 0.4, netCarbs: 13.4, fiber: 1.6, kcal: 60 },
    source: 'USDA FDC 169910 (Mangos, raw)',
  },
  orange: {
    displayName: 'Orange (roh)',
    aliases: ['orange', 'orangen', 'apfelsine'],
    per100g: { protein: 0.9, fat: 0.1, netCarbs: 9.4, fiber: 2.4, kcal: 47 },
    source: 'USDA FDC 169097 (Oranges, raw, all commercial varieties)',
  },
  pear: {
    displayName: 'Birne (roh, mit Schale)',
    aliases: ['birne', 'birnen', 'pear'],
    per100g: { protein: 0.4, fat: 0.1, netCarbs: 12.1, fiber: 3.1, kcal: 57 },
    source: 'USDA FDC 169119 (Pears, raw)',
  },
  peas: {
    displayName: 'Erbsen (gruen, gekocht)',
    aliases: ['erbsen', 'gruene erbsen', 'peas', 'green peas'],
    per100g: { protein: 5.4, fat: 0.4, netCarbs: 10.1, fiber: 5.5, kcal: 84 },
    source: 'USDA FDC 170420 (Peas, green, cooked, boiled, drained, without salt)',
  },
  pomegranate: {
    displayName: 'Granatapfel',
    aliases: ['granatapfel', 'granatapfelkerne', 'pomegranate'],
    per100g: { protein: 1.7, fat: 1.2, netCarbs: 14.7, fiber: 4.0, kcal: 83 },
    source: 'USDA FDC 169134 (Pomegranates, raw)',
  },
  radish: {
    displayName: 'Radieschen (roh)',
    aliases: ['radieschen', 'rettich (rot)', 'radish'],
    per100g: { protein: 0.7, fat: 0.1, netCarbs: 1.8, fiber: 1.6, kcal: 16 },
    source: 'USDA FDC 169276 (Radishes, raw)',
  },
  romaine: {
    displayName: 'Romain-Salat',
    aliases: ['romainsalat', 'roemischer salat', 'romaine', 'cos lettuce'],
    per100g: { protein: 1.2, fat: 0.3, netCarbs: 1.6, fiber: 2.1, kcal: 17 },
    source: 'USDA FDC 169247 (Lettuce, cos or romaine, raw)',
  },
  tomato_canned: {
    displayName: 'Tomaten (Dose, ohne Salz)',
    aliases: ['tomaten dose', 'dosentomaten', 'gehackte tomaten', 'passata',
              'tomato canned', 'canned tomatoes'],
    per100g: { protein: 1.6, fat: 0.3, netCarbs: 3.3, fiber: 1.9, kcal: 32 },
    source: 'USDA FDC 170457 (Tomatoes, red, ripe, canned, whole, no salt added)',
  },

  // ---------- WELLE 2b (Block E, 2026-10-09) ----------
  // Fleisch & Fisch. Naehrwerte USDA FoodData Central (roh, ohne Haut).
  beef_steak: {
    displayName: 'Rumpsteak (roh)',
    aliases: ['rumpsteak', 'steak', 'rindersteak', 'entrecote', 'beef steak'],
    per100g: { protein: 21.5, fat: 5.4, netCarbs: 0.0, fiber: 0.0, kcal: 140 },
    source: 'USDA FDC 168608 (Beef, round, top round, separable lean and fat, trimmed to 0\' fat, select, raw)',
  },
  beef_roast: {
    displayName: 'Rinderbraten (roh)',
    aliases: ['rinderbraten', 'rinderbrust', 'beef roast', 'pot roast'],
    per100g: { protein: 21.0, fat: 8.0, netCarbs: 0.0, fiber: 0.0, kcal: 160 },
    source: 'USDA FDC 168634 (Beef, chuck, arm pot roast, separable lean and fat, trimmed to 1/8\' fat, select, raw)',
  },
  chicken_thigh: {
    displayName: 'Haehnchenschenkel (roh)',
    aliases: ['haehnchenschenkel', 'haehnchenkeule', 'chicken thigh'],
    per100g: { protein: 18.6, fat: 8.5, netCarbs: 0.0, fiber: 0.0, kcal: 155 },
    source: 'USDA FDC 171471 (Chicken, broilers or fryers, thigh, meat and skin, raw)',
  },
  duck_breast: {
    displayName: 'Entenbrust (roh, ohne Haut)',
    aliases: ['entenbrust', 'ente', 'duck breast', 'duck'],
    per100g: { protein: 23.5, fat: 4.0, netCarbs: 0.0, fiber: 0.0, kcal: 135 },
    source: 'USDA FDC 172843 (Duck, domesticated, meat only, raw)',
  },
  lamb_chop: {
    displayName: 'Lammkotelett (roh)',
    aliases: ['lammkotelett', 'lammkarree', 'lamb chop'],
    per100g: { protein: 20.5, fat: 12.0, netCarbs: 0.0, fiber: 0.0, kcal: 200 },
    source: 'USDA FDC 174345 (Lamb, domestic, loin, separable lean and fat, trimmed to 1/4\' fat, choice, raw)',
  },
  lamb_leg: {
    displayName: 'Lammkeule (roh)',
    aliases: ['lammkeule', 'lammfleisch (keule)', 'lamb leg'],
    per100g: { protein: 20.0, fat: 8.8, netCarbs: 0.0, fiber: 0.0, kcal: 162 },
    source: 'USDA FDC 172620 (Lamb, Australian, imported, fresh, composite of trimmed retail cuts, separable lean and fat, raw)',
  },
  pork_chop: {
    displayName: 'Schweinekotelett (roh)',
    aliases: ['schweinekotelett', 'kotelett', 'pork chop', 'schweinekarree'],
    per100g: { protein: 21.5, fat: 7.0, netCarbs: 0.0, fiber: 0.0, kcal: 155 },
    source: 'USDA FDC 168262 (Pork, fresh, loin, blade (chops), separable lean and fat, raw)',
  },
  cod: {
    displayName: 'Kabeljau (roh)',
    aliases: ['kabeljau', 'dorsch', 'cod', 'codfish'],
    per100g: { protein: 17.8, fat: 0.7, netCarbs: 0.0, fiber: 0.0, kcal: 82 },
    source: 'USDA FDC 171953 (Fish, cod, Pacific, raw)',
  },
  trout: {
    displayName: 'Forelle (roh)',
    aliases: ['forelle', 'regenbogenforelle', 'trout'],
    per100g: { protein: 20.5, fat: 6.2, netCarbs: 0.0, fiber: 0.0, kcal: 148 },
    source: 'USDA FDC 173716 (Fish, trout, rainbow, farmed, raw)',
  },
  sea_bass: {
    displayName: 'Wolfsbarsch (roh)',
    aliases: ['wolfsbarsch', 'seebarsch', 'branzino', 'sea bass', 'loup de mer'],
    per100g: { protein: 18.4, fat: 2.0, netCarbs: 0.0, fiber: 0.0, kcal: 97 },
    source: 'USDA FDC 174233 (Fish, bass, striped, raw)',
  },
  tuna_steak: {
    displayName: 'Thunfisch (frisch, roh)',
    aliases: ['thunfisch', 'thunfischsteak', 'tuna steak', 'tuna fresh', 'ahi'],
    per100g: { protein: 23.3, fat: 4.9, netCarbs: 0.0, fiber: 0.0, kcal: 144 },
    source: 'USDA FDC 175159 (Fish, tuna, yellowfin, fresh, raw)',
  },
  scallop: {
    displayName: 'Jakobsmuschel (roh)',
    aliases: ['jakobsmuschel', 'muschel', 'scallop', 'coquille saint-jacques'],
    per100g: { protein: 20.5, fat: 0.8, netCarbs: 3.2, fiber: 0.0, kcal: 111 },
    source: 'USDA FDC 175168 (Mollusks, scallop, mixed species, raw)',
  },
  goat_cheese: {
    displayName: 'Ziegenkaese',
    aliases: ['ziegenkaese', 'ziegenfrischkaese', 'goat cheese', 'chevre'],
    per100g: { protein: 21.0, fat: 30.0, netCarbs: 0.9, fiber: 0.0, kcal: 364 },
    source: 'USDA FDC 171258 (Cheese, goat, semisoft type)',
  },
  seitan: {
    displayName: 'Seitan (Weizeneiweiss)',
    aliases: ['seitan', 'weizeneiweiss', 'weizengluten', 'wheat gluten'],
    per100g: { protein: 25.0, fat: 1.9, netCarbs: 9.0, fiber: 0.6, kcal: 145 },
    source: 'USDA FDC 168146 (Vital wheat gluten)',
  },
  noodle_cooked: {
    displayName: 'Nudeln (gekocht, generisch)',
    aliases: ['nudeln (gekocht)', 'noodle', 'noodles', 'wok-nudeln', 'ei-nudeln'],
    per100g: { protein: 5.0, fat: 1.0, netCarbs: 24.0, fiber: 1.0, kcal: 131 },
    source: 'USDA FDC 168927 (Pasta, cooked, unenriched, without added salt)',
  },

  // ---------- WELLE 2c (Block E, 2026-10-09) ----------
  // Beilagen-Getreide (A10.side). USDA FoodData Central, trocken.
  bread: {
    displayName: 'Brot (Weissbrot)',
    aliases: ['brot', 'weissbrot', 'baguette', 'bauernbrot', 'bread'],
    per100g: { protein: 9.0, fat: 3.2, netCarbs: 49.0, fiber: 2.7, kcal: 265 },
    source: 'USDA FDC 174928 (Bread, white, commercially prepared)',
  },
  bulgur: {
    displayName: 'Bulgur (trocken)',
    aliases: ['bulgur', 'burghul', 'bulgurweizen'],
    per100g: { protein: 12.3, fat: 1.3, netCarbs: 63.4, fiber: 12.5, kcal: 342 },
    source: 'USDA FDC 170688 (Bulgur, dry)',
  },
  couscous: {
    displayName: 'Couscous (trocken)',
    aliases: ['couscous', 'cous cous'],
    per100g: { protein: 12.8, fat: 0.6, netCarbs: 72.4, fiber: 5.0, kcal: 376 },
    source: 'USDA FDC 169702 (Couscous, dry)',
  },
  farro: {
    displayName: 'Farro / Emmer (trocken)',
    aliases: ['farro', 'emmer', 'emmerweizen'],
    per100g: { protein: 15.0, fat: 2.5, netCarbs: 59.5, fiber: 8.5, kcal: 353 },
    source: 'USDA FDC (geschaetzt, zu verifizieren: Emmer wheat, dry)',
  },
  polenta: {
    displayName: 'Polenta (Maisgriess, trocken)',
    aliases: ['polenta', 'maisgriess', 'maisgries', 'cornmeal'],
    per100g: { protein: 8.1, fat: 1.2, netCarbs: 77.0, fiber: 3.9, kcal: 370 },
    source: 'USDA FDC 168922 (Cornmeal, degermed, unenriched, yellow)',
  },

  // ---------- WELLE 1 (Block E, 2026-10-09) ----------
  // Vier Ziel-Keys, die als Alias-Ziele gebraucht werden.
  // Quellen: USDA FoodData Central.
  pasta_dry: {
    displayName: 'Pasta, trocken (Hartweizen)',
    aliases: ['pasta (trocken)', 'nudeln (trocken)', 'spaghetti', 'penne', 'rigatoni',
              'fusilli', 'tagliatelle', 'linguine', 'farfalle', 'orecchiette',
              'bucatini', 'conchiglie', 'gemelli', 'trofie', 'fettuccine',
              'pappardelle', 'ziti', 'cavatappi', 'elbow macaroni',
              'macaroni', 'pasta trocken', 'hartweizennudeln'],
    per100g: { protein: 13.0, fat: 1.5, netCarbs: 61.0, fiber: 3.2, kcal: 371 },
    source: 'USDA FDC 168928 (Pasta, dry, unenriched)',
  },
  beans_cooked: {
    displayName: 'Bohnen (gekocht)',
    aliases: ['bohnen', 'bohnen (gekocht)', 'kidneybohnen', 'schwarze bohnen',
              'weisse bohnen', 'cannellini', 'kidney beans', 'black beans',
              'white beans', 'beans cooked'],
    per100g: { protein: 8.7, fat: 0.5, netCarbs: 14.5, fiber: 6.4, kcal: 127 },
    source: 'USDA FDC 175202 (Beans, kidney, mature seeds, cooked, boiled, without salt)',
  },
  lamb_meat: {
    displayName: 'Lammfleisch (roh)',
    aliases: ['lamm', 'lammfleisch', 'lamm (roh)',
              'lamb', 'lamb meat', 'lammruecken'],
    per100g: { protein: 20.0, fat: 8.8, netCarbs: 0.0, fiber: 0.0, kcal: 162 },
    source: 'USDA FDC 172620 (Lamb, Australian, imported, fresh, composite of trimmed retail cuts, separable lean and fat, raw)',
  },
  pork_meat: {
    displayName: 'Schweinefleisch (roh)',
    aliases: ['schwein', 'schweinefleisch', 'schwein (roh)',
              'schweinenacken', 'pork', 'pork meat'],
    per100g: { protein: 20.9, fat: 8.2, netCarbs: 0.0, fiber: 0.0, kcal: 158 },
    source: 'USDA FDC 167895 (Pork, fresh, composite of trimmed retail cuts (leg, loin, shoulder), separable lean and fat, raw)',
  },

};

// ---------- WELLE 3 (Block E, 2026-10-09) ----------
// In drei Modulen, um Chat-Limits zu respektieren.
// Object.assign mutiert CATALOG; ALIAS_INDEX wird danach gebaut.
Object.assign(CATALOG, require('./nutri-catalog-welle3_a.js'));
Object.assign(CATALOG, require('./nutri-catalog-welle3_b.js'));
Object.assign(CATALOG, require('./nutri-catalog-welle3_c.js'));


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
