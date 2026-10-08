// plausibility-checks.js
// Kulinarische Plausibilitaets-Pruefungen.
// Grundsatz: MARKIEREN, nicht blockieren. Alle Befunde sind Warnungen.
// Stand: 2026-10-07
'use strict';

const FAT_NAME_RE = /\b(oliven|l|raps|kokos|sesam|erdnuss|nuss|sonnenblumen|traubenkern)[\s-]?(öl|oel|oil)\b|\bbutter\b|\bschmalz\b|\bghee\b|\bkokosfett\b|\bmargarine\b/i;
const FAT_PLANT_ONLY_RE = /\b(olivenöl|olivenoel|rapsöl|rapsoel|kokosöl|kokos oel|kokosfett|butter|schmalz|ghee|margarine)\b/i;
const HIGH_FIBER_RE = /\b(chiasamen|chia|leinsamen|flohsamen|psyllium|flosamen|weizenkleie|haferkleie)\b/i;
const PROTEIN_DISH_RE = /\b(hähnchen|haehnchen|huhn|hähn|haehn|pute|truthahn|rind|schwein|beef|pork|fisch|lachs|thunfisch|garnele|shrimp|steak|kotelett|filet|hackfleisch|hack)\b/i;
const ACID_RE = /\b(essig|vinegar|balsamico|apfelessig)\b/i;
const TOFU_DISH_RE = /\b(tofu|tempeh)\b/i;

// --- P1 (Maillard vor Schmoren) ---
// Fleisch-Praefix-Erkennung. Bewusst ohne \b am Ende, damit Komposita
// wie "Rindfleisch", "Haehnchenbrust", "Rindergulasch" erkannt werden.
// Bruehe/Fond wird separat ausgeschlossen (siehe BROTH_EXCLUDE_RE),
// damit "Rinderbruehe" nicht als Fleisch zaehlt.
const MEAT_RE = /(?:rind|kalb|schwein|lamm|hähnchen|haehnchen|huhn|hühner|pute|truthahn|ente|gans|fisch|lachs|thunfisch|forelle|kabeljau|garnele|shrimp|scampi|steak|kotelett|filet|hackfleisch|gulasch|schnitzel|ossobuco|brisket|entrec[oô]te)/i;
const BROTH_EXCLUDE_RE = /\b(brühe|bruehe|fond|bouillon|stock|sud)\b/i;
// Fluessigkeits-/Loesch-Signale im Step-Text.
// Breit gefasst: Fluessigkeitsname ODER typisches Loesch-Verb.
const LIQUID_STEP_RE = /(?:wasser|brühe|bruehe|fond|wein|bier|sahne|milch|kokosmilch|soße|soosse|passata|tomaten|pürierte\s+tomaten|puerierte\s+tomaten|ablöschen|abloeschen|aufgießen|aufgiessen|angießen|angiessen|hinzugießen|hinzugiessen)/i;
// Kochwasser-Steps sind KEINE Schmor-Fluessigkeit (Fix 2026-10-08):
// 'Wasser zum Kochen bringen' / 'kochendes Wasser' sind Vorbereitung, kein Loeschen.
const BOILING_WATER_STEP_RE = /(?:wasser\s+(?:zum|zum\s+)?kochen|kochend(?:e|es|em|er)?\s+wasser|kochwasser|wasser\s+in\s+(?:einem|dem)\s+topf|topf\s+(?:mit\s+)?wasser)/i;
// Anbrat-Signale. Bewusst OHNE generisches "braten", damit "im Ofen braten"
// nicht als Maillard-Vorstufe zaehlt.
const SEAR_STEP_RE = /(?:scharf\s+an(?:ge)?br[äa]t|heiß\s+an(?:ge)?br[äa]t|heiss\s+an(?:ge)?br[äa]t|kräftig\s+an(?:ge)?br[äa]t|kraeftig\s+an(?:ge)?br[äa]t|goldbraun(?:\s+ge)?braten|farbe\s+nehmen\s+lassen|maillard|an(?:ge)?br[äa]t|an(?:ge)?r[oö]st|an(?:ge)?schwitz|an(?:ge)?br[äa]un)/i;

// --- P5 (Saeure-Korrektur) ---
// Saeurequellen. Bewusst spezifisch:
//   - Zitrone/Limette nur mit Saft/Abrieb/Schale (kein Zitronengras/-melisse)
//   - Senf mit Wortgrenze (kein Senfkoerner)
//   - Oliven NICHT (kulinarisch keine echte Saeurequelle)
//   - Tomatenmark, Wein, Mayo zaehlen
const ACID_SOURCE_RE = /(?:zitronensaft|zitronenabrieb|zitronenschale|limettensaft|limettenabrieb|essig|apfelwein|balsamico|weißwein|weisswein|rotwein|verjus|joghurt|buttermilch|sauerrahm|crème\s+fraîche|creme\s+fraiche|kapern|\bsenf\b|tomatenmark|tomaten|passata|tamarinde|sumach|mayonnaise|mayo\b)/i;
const DESSERT_TITLE_RE = /(?:dessert|nachtisch|mousse|pudding|kuchen)/i;

// --- P2 (Riposo della Carne) ---
// Fleischsorten, die typischerweise Riposo brauchen: ganze Stuecke, die scharf
// angebraten/gegrillt und dann geschnitten werden. NICHT: Hackfleisch/Gulasch/
// Wurst/Speck/Bruehe/Fond — die sind entweder durchgegart oder werden geschmort.
// Nur Wortgrenze am Anfang: faengt Komposita wie "Rumpsteak", "Rindersteak",
// "Haehnchenbrustfilet". Wortgrenze am Ende wuerde bei Komposita scheitern.
const RIPOSO_CANDIDATE_RE = /\b(?:rind|kalb|lamm|schwein|rump|steak|kotelett|filet|haehnchen|hähnchen|hühner|huehner|pute|truthahn|ente|gans|lachs|thunfisch|forelle|fisch)/i;
// Keine Wortgrenzen: faengt "Rindergulasch", "Rinderhackfleisch", "Rinderbruehe".
const RIPOSO_EXCLUDE_RE = /(?:hack|gulasch|wurst|speck|schinken|salami|leberwurst|brühe|bruehe|fond|bouillon)/i;
// Scharfes Braten / Grillen, NICHT "anschwitzen" (mittlere Hitze, kein Riposo).
const GRILL_SEAR_RE = /(?:scharf\s+an(?:ge)?br[äa]t|heiß\s+an(?:ge)?br[äa]t|heiss\s+an(?:ge)?br[äa]t|kräftig\s+an(?:ge)?br[äa]t|kraeftig\s+an(?:ge)?br[äa]t|goldbraun|kruste|scharf\s+(?:ge)?braten|an(?:ge)?br[äa]t|\bgrill(?:en|te)?\b|\bgegrillt\b)/i;
// Titel-Fallback: Wenn der Titel Brat-Signale traegt, aber kein Step das
// Braten explizit nennt, soll P2 trotzdem greifen (Fix 2026-10-08).
const SEAR_TITLE_RE = /(?:scharf|gebraten|angebraten|gegrillt|knusprig|kruste)/i;
// Ruhe-/Zieh-Signale.
const REST_STEP_RE = /\b(?:ruhen\s+lassen|ruhen|rasten|ziehen\s+lassen|abgedeckt\s+ruhen|warm\s+halten|ziehen|ruhephase)\b/i;
// Verneinung: 'ohne Ruhen', 'nicht ruhen lassen' — darf NICHT als Ruheschritt zaehlen.
const REST_NEGATION_RE = /\b(?:ohne|kein(?:e|en)?|nicht)\s+(?:zu\s+)?(?:ruhen|ruhe|rasten|ziehen)/i;

// --- P4 (Deglassatura) ---
// Koch-Step-Signale, die auf Saucenbildung hindeuten (Schmoren/Koecheln/Reduzieren).
// Wenn danach kein Loesch-Schritt kommt, bleibt der Fond-Rueckstand ungenutzt.
const SAUCE_COOK_STEP_RE = /(?:koecheln|köcheln|schmoren|reduzieren|einkochen|weiterkochen|sanft\s+garen|ziehen\s+lassen)/i;
// Loesch-Signal: Fluessigkeit + typisches Verb.
// Fix 2026-10-08: Kokosmilch/Sahne/Milch/Tomaten loesen den Fond funktional
// (Thai-Curry, Cream Sauce, Tomatensauce) — ohne Saeure, aber gleichwertig.
const DEGLACE_STEP_RE = /(?:(?:wein|weisswein|weißwein|rotwein|bruehe|brühe|fond|wasser|bier|essig|kokosmilch|sahne|milch|tomaten|tomatendose|passata|tomatenmark)[^\n.!?]{0,40}?\b(?:abloeschen|ablöschen|aufgiessen|aufgießen|angießen|angiessen|hinzugiessen|hinzugießen|deglacieren|abschrecken|hinzufuegen|hinzufügen|dazugeben|zugeben|einruehren|einrühren|zum\s+Kochen|aufkochen))|(?:\b(?:abloeschen|ablöschen|deglacieren)\b)/i;

// --- P9 (Emulsion ohne Bindemittel) ---
// Titel-Klassiker:
const EMULSION_TITLE_RE = /\b(?:mayonnaise|mayo|aioli|hollandaise|vinaigrette|dressing)\b/i;
const VINAIGRETTE_TITLE_RE = /\b(?:vinaigrette|dressing)\b/i;
// Emulsions-Verben im Step-Text.
const EMULSION_VERB_RE = /\b(?:verruehr|verrühr|emulgier|aufschlag|aufschl[aä]g|mixe?n?|pürier|puerier)\w*/i;
// Waessrige Fluessigkeit (Basis fuer eine echte Emulsion).
const AQUEOUS_RE = /\b(?:wasser|essig|balsamico|apfelessig|zitronensaft|limettensaft|weisswein|weißwein|rotwein|bruehe|brühe|fond|milch|kokosmilch|joghurt|buttermilch|sauerrahm)\b/i;
// Sauren-Komponente (fuer Vinaigrette-Pflicht).
const ACID_FOR_EMULSION_RE = /\b(?:essig|balsamico|apfelessig|zitronensaft|limettensaft|weisswein|weißwein|rotwein|verjus)\b/i;
// Bindemittel (echte Emulgatoren).
const EMULSIFIER_RE = /\b(?:ei|eier|eigelb|senf|dijon|tomatenmark|lecithin|xanthan|käse|kaese|sahne|mehl|stärke|staerke)\b/i;

// --- P6 (Umami-Anker) ---
// Fleisch/Fisch/Meeresfruechte zaehlen als Umami — P6 prueft sie nicht.
// Nur Wortgrenze am Anfang — faengt Komposita wie Rindfleisch, Haehnchenbrust.
const P6_MEAT_FISH_RE = /\b(?:rind|kalb|schwein|lamm|haehnchen|hähnchen|huhn|hühner|pute|truthahn|ente|gans|fisch|lachs|thunfisch|forelle|kabeljau|garnele|shrimp|scampi|steak|kotelett|filet|hackfleisch|gulasch|schnitzel|speck|schinken|salami|wurst|anchov|sardine|makrele|garnel|scamp)/i;
// Gericht-Kategorien, die P6 ausschliessen.
const P6_EXCLUDE_CATEGORIES = ['salad', 'dessert', 'soup', 'other'];
// Titel-Signale fuer Ausschluss (Salat/Suppe/Dessert).
const P6_EXCLUDE_TITLE_RE = /\b(?:salat|salad|suppe|soup|dessert|nachtisch|mousse|pudding|kuchen|smoothie)\b/i;
// Echte Umami-Traeger (Glutamat, Inosinat, Guanylat).
const UMAMI_SOURCE_RE = /\b(?:parmesan|pecorino|grana|tomatenmark|passata|tomate|tomaten|sojasauce|sojasoße|soja\s+sauce|miso|shiitake|champignon|pilz|pilze|getrocknete\s+pilze|anchov|fischsauce|hefeextrakt|worcestersh|worcester|ketchup|umami)\b/i;

// --- P10 (Drei Cremes gleichzeitig) ---
// Verschiedene Cremes/Sahnen/Schmelzkaese, die eine Sauce dick und pappig machen.
// Ergaenzt R1 (Fett-Ueberladung) um die Creme-Komponente.
const CREAM_NAME_RE = /\b(sahne|crème\s+fraîche|creme\s+fraiche|schmand|kokosmilch|frischkäse|frischkaese|mascarpone|doppelrahm|sojacreme|sojacrème|hafercreme|hafercrème)\b/gi;

// --- P3 (Riduzione) ---
// Reduktions-Verben.
const REDUCTION_ACTION_RE = /\b(?:reduzier\w*|einkoch\w*|eindick\w*|einreduzier\w*|verring\w*)/i;
// Hitze-Kontext (schliesst aus): 'Hitze reduzieren' ist kein Reduzieren von Fluessigkeit.
const HEAT_CONTEXT_RE = /\b(?:hitze|temperatur|stufe|flamme|herd|ofen|hitz\w*)/i;
const HEAT_ACTION_RE = /\b(?:reduzier\w*|verring\w*|runterdreh\w*|niedriger|kleiner|herunter|herunterregel\w*)/i;
// Reduktions-Fluessigkeiten (immer gueltig).
const REDUCTION_LIQUID_RE = /\b(?:brühe|bruehe|fond|bouillon|wein|weisswein|weißwein|rotwein|sekt|bier|essig|wasser|kochwasser|tomatensaft|tomatenpüree|tomatenpuree|tomatenmark|passata|sahne|kokosmilch)\b/i;
// Milch nur im Sauce/Suppe-Kontext.
const REDUCTION_SAUCE_CONTEXT_RE = /\b(?:sauce|soße|soosse|suppe|tunke|gericht)\b/i;
const MILK_RE = /\bmilch\b/i;

function nameOf(ing) {
  return String((ing && (ing.name || ing.displayName)) || '');
}
function ingredientsOf(recipe) {
  return Array.isArray(recipe && recipe.finalIngredients)
    ? recipe.finalIngredients
    : (Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : []);
}
function titleOf(recipe) {
  return String((recipe && recipe.title) || '');
}

/**
 * 1) Fett-Ueberladung: >= 3 verschiedene Fette gleichzeitig.
 */
function checkFatOverload(recipe) {
  const ings = ingredientsOf(recipe);
  const fats = [];
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    const role = String(ing.culinaryRole || ing.role || '').toLowerCase();
    if (FAT_NAME_RE.test(n) || role === 'fat_source') {
      // Kochwasser/Wasser ausschliessen
      if (/wasser|water/i.test(n)) return;
      const key = n.toLowerCase();
      if (fats.indexOf(key) < 0) fats.push(key);
    }
  });
  if (fats.length >= 3) {
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: ' + fats.length + ' verschiedene Fette gleichzeitig (' +
        fats.slice(0, 4).join(', ') + '). Fuer ein Gericht reichen meist 1-2 Fette.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 2) Ballaststoff-Ueberladung: >= 3 verschiedene starke Ballaststoff-Traeger.
 */
function checkFiberOverload(recipe) {
  const ings = ingredientsOf(recipe);
  const fibers = [];
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    if (HIGH_FIBER_RE.test(n)) {
      const key = n.toLowerCase().replace(/[^a-zäöü]/g, '');
      if (fibers.indexOf(key) < 0) fibers.push(nameOf(ing));
    }
  });
  if (fibers.length >= 3) {
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: ' + fibers.length + ' starke Ballaststoff-Traeger gleichzeitig (' +
        fibers.join(', ') + '). Das kann Magen-Darm belasten und die Konsistenz verderben.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 3) Psyllium/Flohsamen in proteinreichem Tiergericht (Haehnchen, Rind, Fisch).
 */
function checkPsylliumInProteinDish(recipe) {
  const ings = ingredientsOf(recipe);
  const blob = [titleOf(recipe)].concat(ings.map(nameOf)).join(' ');
  const hasProteinDish = PROTEIN_DISH_RE.test(blob);
  const hasPsyllium = /\b(psyllium|flohsamen|flosamen)\b/i.test(blob);
  if (hasProteinDish && hasPsyllium) {
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: Psyllium/Flohsamen in einem proteinreichen Gericht (Haehnchen/Fleisch/Fisch) ' +
        'ist ungewoehnlich. Psyllium bindet Wasser stark und wird meist in Gebaeck oder als Verdickungsmittel ' +
        'in veganen Rezepten verwendet.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 4) Essig in Tofu-/Tempeh-Curry (kulinarisch fragwuerdige Kombination).
 */
function checkVinegarInTofuCurry(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe).toLowerCase();
  const blob = title + ' ' + ings.map(nameOf).join(' ');
  const isCurry = /curry|kokosmilch|kokos-curry/.test(blob);
  const isTofu = TOFU_DISH_RE.test(blob);
  const hasVinegar = ings.some(function (ing) { return ACID_RE.test(nameOf(ing)); });
  if (isCurry && isTofu && hasVinegar) {
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: Essig in einem Tofu-/Tempeh-Curry ist ungewoehnlich. ' +
        'Fuer Saeure in Currys werden eher Limette oder Zitrone verwendet.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * P1 (Maillard vor Schmoren):
 * Bei Gerichten mit Fleisch und Fluessigkeit (Braten/Schmoren/Braisieren)
 * muss das Fleisch VOR dem Fluessigkeitszusatz scharf angebraten werden.
 * Vegetarische Gerichte loesen P1 nicht aus.
 * Anbraten und Loeschen im selben Step sind korrekt und loesen nicht aus.
 */
function stepsOf(recipe) {
  const raw = (recipe && (recipe.steps || recipe.instructions)) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map(function (s) {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object') {
      return String((s.title ? s.title + ' ' : '') + (s.content || s.text || ''));
    }
    return '';
  });
}

function checkMaillardBeforeBraising(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe);

  const meatInTitle = MEAT_RE.test(title) && !BROTH_EXCLUDE_RE.test(title);
  const meatInIngs = ings.some(function (ing) {
    const n = nameOf(ing);
    return MEAT_RE.test(n) && !BROTH_EXCLUDE_RE.test(n);
  });
  if (!meatInTitle && !meatInIngs) return { errors: [], warnings: [] };

  const steps = stepsOf(recipe);
  if (!steps.length) return { errors: [], warnings: [] };

  // Erster Step mit Fluessigkeit/Loesch-Signal.
  // Kochwasser-Steps ueberspringen (kein Schmor-Kontext).
  let liquidIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!LIQUID_STEP_RE.test(s)) continue;
    if (BOILING_WATER_STEP_RE.test(s)) continue;
    liquidIdx = i; break;
  }
  if (liquidIdx < 0) return { errors: [], warnings: [] };

  // Anbraten in einem Step bis einschliesslich dem ersten Fluessigkeits-Step?
  for (let i = 0; i <= liquidIdx; i++) {
    if (SEAR_STEP_RE.test(steps[i])) return { errors: [], warnings: [] };
  }

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Maillard vor dem Schmoren fehlt. ' +
      'Bei einem Gericht mit Fleisch und Fluessigkeit sollte das Fleisch ' +
      'vor dem Fluessigkeitszusatz scharf angebraten werden ' +
      '(Roestaromen, Maillard-Reaktion).'
    ],
  };
}

/**
 * P5 (Saeure-Korrektur):
 * Gerichte mit >= 2 verschiedenen Fetten brauchen eine Saeurequelle
 * (Zitrone, Essig, Wein, Joghurt, Tomate), um die Fettigkeit auszubalancieren.
 * Desserts sind ausgenommen (Schokoladenmousse braucht keine Saeure).
 * Mayonnaise zaehlt als Saeurequelle (enthaelt Zitrone/Essig).
 */
function checkAcidInFatDish(recipe) {
  const title = titleOf(recipe);
  const category = String((recipe && recipe.dishCategory) || '').toLowerCase();
  if (category === 'dessert' || DESSERT_TITLE_RE.test(title)) {
    return { errors: [], warnings: [] };
  }

  const ings = ingredientsOf(recipe);
  const fats = [];
  let hasAcid = false;
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    const role = String(ing.culinaryRole || ing.role || '').toLowerCase();
    if ((FAT_NAME_RE.test(n) || role === 'fat_source') && !/wasser|water/i.test(n)) {
      const key = n.toLowerCase();
      if (fats.indexOf(key) < 0) fats.push(key);
    }
    if (ACID_SOURCE_RE.test(n)) hasAcid = true;
  });
  if (fats.length < 2) return { errors: [], warnings: [] };
  if (hasAcid) return { errors: [], warnings: [] };

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Saeure-Korrektur fehlt. Bei ' +
      fats.length + ' Fetten (' + fats.slice(0, 3).join(', ') + ') ' +
      'braucht das Gericht eine Saeurequelle (Zitrone, Essig, Wein, ' +
      'Joghurt, Tomate), um die Fettigkeit auszubalancieren.'
    ],
  };
}

/**
 * P2 (Riposo della Carne):
 * Nach scharfem Anbraten/Grillen von ganzen Fleischstuecken (Steak, Kotelett,
 * Filet, Haehnchenbrust) sollte ein Ruheschritt kommen, bevor geschnitten/
 * serviert wird. Das Fleisch zieht nach, die Saeure verteilt sich.
 * Hackfleisch, Gulasch, Wurst, Speck und Bruehen brauchen das nicht.
 * Anschwitzen zaehlt NICHT als scharfes Braten.
 */
function checkRiposoDellaCarne(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe);

  // Titel-Ausnahme (Fix 2026-10-08): Wenn der Titel klar "geschmort/gehackt"
  // signalisiert (Rindergulasch, Hackpfanne, Wurstpfanne), braucht das ganze
  // Gericht kein Riposo — auch wenn eine Zutat den Kandidaten-Namen traegt.
  if (title && RIPOSO_EXCLUDE_RE.test(title)) return { errors: [], warnings: [] };

  // Kandidat ermitteln: im Titel ODER in Zutaten (Zutaten zusaetzlich gefiltert).
  function isCandidate(text) {
    if (!text) return false;
    if (RIPOSO_EXCLUDE_RE.test(text)) return false;
    return RIPOSO_CANDIDATE_RE.test(text);
  }
  const titleHit = isCandidate(title);
  const ingHit = ings.some(function (ing) {
    const n = nameOf(ing);
    if (!n) return false;
    if (RIPOSO_EXCLUDE_RE.test(n)) return false;
    return RIPOSO_CANDIDATE_RE.test(n);
  });
  if (!titleHit && !ingHit) return { errors: [], warnings: [] };

  const steps = stepsOf(recipe);
  if (!steps.length) return { errors: [], warnings: [] };

  // Erster Grill-/Brat-Step.
  let searIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (GRILL_SEAR_RE.test(steps[i])) { searIdx = i; break; }
  }
  // Titel-Fallback: KI schreibt das Braten oft nur in den Titel (Fix 2026-10-08).
  if (searIdx < 0) {
    if (SEAR_TITLE_RE.test(title)) searIdx = 0;
    else return { errors: [], warnings: [] };
  }

  // Ruhe-Signal ab searIdx (auch im selben Step).
  // Aber: 'ohne Ruhen' etc. zaehlt nicht (Fix 2026-10-08).
  for (let i = searIdx; i < steps.length; i++) {
    const s = steps[i];
    if (REST_STEP_RE.test(s) && !REST_NEGATION_RE.test(s)) return { errors: [], warnings: [] };
  }

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Riposo della Carne fehlt. Nach dem scharfen ' +
      'Anbraten/Grillen von ganzem Fleisch sollte ein Ruheschritt kommen ' +
      '(2-5 Min. abgedeckt ruhen lassen), bevor es geschnitten oder serviert wird.'
    ],
  };
}

/**
 * P4 (Deglassatura):
 * Nach einem scharfen Anbraten mit Fond-Rueckstand (SEAR-Step) sollte der
 * Fond geloest werden, sobald eine Sauce entstehen soll (koecheln/schmoren).
 * Reine Bratgerichte (Steak anbraten + servieren) loesen P4 nicht aus.
 */
function checkDeglassatura(recipe) {
  const steps = stepsOf(recipe);
  if (!steps.length) return { errors: [], warnings: [] };

  // Erster SEAR-Step.
  let searIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (GRILL_SEAR_RE.test(steps[i])) { searIdx = i; break; }
  }
  if (searIdx < 0) return { errors: [], warnings: [] };

  // Naechster Koch-Step (Saucenbildung) nach dem SEAR.
  let cookIdx = -1;
  for (let i = searIdx + 1; i < steps.length; i++) {
    if (SAUCE_COOK_STEP_RE.test(steps[i])) { cookIdx = i; break; }
  }
  if (cookIdx < 0) return { errors: [], warnings: [] };

  // Zwischen SEAR (einschliesslich) und CookIdx (einschliesslich) muss ein
  // Loesch-Signal vorkommen.
  for (let i = searIdx; i <= cookIdx; i++) {
    if (DEGLACE_STEP_RE.test(steps[i])) return { errors: [], warnings: [] };
  }

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Deglassatura fehlt. Nach dem scharfen Anbraten ' +
      'sollte der Fond-Rueckstand mit Wein, Bruehe oder Wasser geloest werden ' +
      '(«abloeschen»), bevor das Gericht geschmort oder gekoechelt wird.'
    ],
  };
}

/**
 * P9 (Emulsion ohne Bindemittel):
 * - Mayonnaise/Aioli/Hollandaise brauchen Ei.
 * - Vinaigrette/Dressing brauchen Senf (klassische 3:1-Emulsion).
 * - Sonst: Fett + Wasser + Emulsionsverb ohne Bindemittel = instabile Sauce.
 * Montierte Butter zaehlt NICHT als Bindemittel (Viskositaet, keine Emulsion).
 */
function checkEmulsion(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe);
  const steps = stepsOf(recipe);

  const allNames = ings.map(nameOf).join(' ');
  const hasEgg = /\b(?:ei|eier|eigelb)\b/i.test(allNames);
  const hasMustard = /\b(?:senf|dijon)\b/i.test(allNames);
  const hasFat = ings.some(function (ing) { return FAT_NAME_RE.test(nameOf(ing)); });
  const hasAcid = ACID_FOR_EMULSION_RE.test(allNames);
  const hasEmulsifier = EMULSIFIER_RE.test(allNames);

  // Pfad 1: Mayonnaise / Aioli / Hollandaise -> Ei Pflicht
  if (/\b(?:mayonnaise|mayo|aioli|hollandaise)\b/i.test(title)) {
    if (hasEgg) return { errors: [], warnings: [] };
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: Emulsion ohne Bindemittel. ' +
        'Mayonnaise/Aioli/Hollandaise brauchen Eigelb als Emulgator — ' +
        'ohne Ei trennt sich die Sauce.'
      ],
    };
  }

  // Pfad 2: Vinaigrette / Dressing -> Senf Pflicht (nur wenn Oel + Saeure)
  if (VINAIGRETTE_TITLE_RE.test(title)) {
    if (!(hasFat && hasAcid)) return { errors: [], warnings: [] };
    if (hasMustard) return { errors: [], warnings: [] };
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: Vinaigrette ohne Senf. ' +
        'Klassisch braucht eine Vinaigrette Senf (Dijon) als Emulgator, ' +
        'sonst trennt sie sich sofort.'
      ],
    };
  }

  // Pfad 3 (b): Fett + Wasser + Emulsionsverb im Step -> Bindemittel noetig
  const joinedSteps = steps.join(' ');
  if (!EMULSION_VERB_RE.test(joinedSteps)) return { errors: [], warnings: [] };
  if (!hasFat || !AQUEOUS_RE.test(allNames)) return { errors: [], warnings: [] };
  if (hasEmulsifier) return { errors: [], warnings: [] };

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Emulsion ohne Bindemittel. Fett und waessrige ' +
      'Fluessigkeit werden verruehrt/emulgiert, aber kein Emulgator ' +
      '(Ei, Senf, Tomatenmark, Lecithin) ist dabei — die Sauce trennt sich.'
    ],
  };
}

/**
 * P6 (Umami-Anker):
 * Vegetarische Hauptgerichte ohne natuerliche Umami-Quelle (Parmesan,
 * Tomate, Sojasauce, Pilze, Miso) sind oft aromatisch flach. P6 warnt.
 * Fleischgerichte, Salate, Suppen und Desserts sind ausgenommen.
 */
function checkUmamiAnchor(recipe) {
  const title = titleOf(recipe);
  const ings = ingredientsOf(recipe);
  const category = String((recipe && recipe.dishCategory) || '').toLowerCase();

  // Ausschluss zuerst (Kategorie ODER Titel).
  if (P6_EXCLUDE_CATEGORIES.indexOf(category) >= 0) return { errors: [], warnings: [] };
  if (P6_EXCLUDE_TITLE_RE.test(title)) return { errors: [], warnings: [] };

  // Zutaten-Liste.
  const allNames = ings.map(nameOf).join(' ');
  if (!allNames.trim()) return { errors: [], warnings: [] };

  // Fleisch/Fisch schliesst aus.
  if (P6_MEAT_FISH_RE.test(allNames)) return { errors: [], warnings: [] };

  // Umami-Traeger vorhanden -> OK.
  if (UMAMI_SOURCE_RE.test(allNames)) return { errors: [], warnings: [] };

  // Nur Hauptgerichte pruefen: dishCategory=main_* ODER (ohne Kategorie) plausibler
  // Hauptgericht-Titel. Sonst still.
  const isMainCategory = /^main/.test(category);
  const plausibleMain = !category && /\b(?:pfanne|curry|bowl|eintopf|risotto|pasta|auflauf|gratin|burger|wrap|bolognese|chili|stew|schnitzel|terrine|quiche)\b/i.test(title);
  if (!isMainCategory && !plausibleMain) return { errors: [], warnings: [] };

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Umami-Anker fehlt. Dieses vegetarische Hauptgericht ' +
      'hat keine natuerliche Umami-Quelle (Parmesan, Tomatenmark, Sojasauce, ' +
      'Pilze, Miso) — Aromen koennen flach bleiben.'
    ],
  };
}

/**
 * P10 (Drei Cremes gleichzeitig):
 * Sahne, Crème fraîche, Schmand, Kokosmilch, Frischkäse, Mascarpone,
 * Doppelrahm, Sojacreme, Hafercreme — drei oder mehr ergeben eine pappige
 * Textur ohne Kontrast. Klassisch reicht eine Creme.
 * Kochsahne und Sahne werden zusammengefasst (gleiche Creme-Familie).
 */
function checkThreeCreams(recipe) {
  const ings = ingredientsOf(recipe);
  const creams = [];
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    if (!n) return;
    const found = n.match(CREAM_NAME_RE) || [];
    found.forEach(function (hit) {
      const key = String(hit).toLowerCase().replace(/\s+/g, ' ');
      if (creams.indexOf(key) < 0) creams.push(key);
    });
  });
  if (creams.length >= 3) {
    return {
      errors: [],
      warnings: [
        'Kochlehre-Hinweis: Drei Cremes gleichzeitig: ' + creams.slice(0, 3).join(' + ') +
        ' ergeben eine pappige Textur ohne Kontrast. Klassisch reicht eine Creme — ' +
        'der Rest kommt ueber Saeure, Kraeuter oder Crunch.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * P3 (Riduzione):
 * Reduktions-Steps ("reduzieren", "einkochen", "eindicken") brauchen eine
 * Fluessigkeit zum Reduzieren. "Hitze reduzieren" ist KEIN Reduktions-Step.
 * Milch zaehlt nur im Sauce/Suppe-Kontext.
 */
function checkRiduzione(recipe) {
  const steps = stepsOf(recipe);
  const ings = ingredientsOf(recipe);
  if (!steps.length) return { errors: [], warnings: [] };

  // Erster Reduktions-Step (ohne Hitze-Kontext).
  let redIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!REDUCTION_ACTION_RE.test(s)) continue;
    if (HEAT_CONTEXT_RE.test(s) && HEAT_ACTION_RE.test(s)) continue;
    redIdx = i; break;
  }
  if (redIdx < 0) return { errors: [], warnings: [] };

  function hasLiquid(text) {
    if (REDUCTION_LIQUID_RE.test(text)) return true;
    if (MILK_RE.test(text) && REDUCTION_SAUCE_CONTEXT_RE.test(text)) return true;
    return false;
  }

  // Fluessigkeit in einem Step bis einschliesslich Reduktions-Step?
  for (let i = 0; i <= redIdx; i++) {
    if (hasLiquid(steps[i])) return { errors: [], warnings: [] };
  }
  // Oder wenigstens in den Zutaten (dann ist der Reduktions-Step plausibel)?
  const allIngs = ings.map(nameOf).join(' ');
  if (hasLiquid(allIngs)) return { errors: [], warnings: [] };

  return {
    errors: [],
    warnings: [
      'Kochlehre-Hinweis: Reduktion ohne Fluessigkeit. Der Step spricht von ' +
      'Reduktion/Einkochen, aber vorher wurde keine Fluessigkeit (Wein, Bruehe, ' +
      'Sahne, Kokosmilch, Tomate) zugegeben — es gibt nichts zu reduzieren.'
    ],
  };
}

function evaluateAll(recipe) {
  const errors = [];
  const warnings = [];
  [checkFatOverload, checkFiberOverload, checkPsylliumInProteinDish, checkVinegarInTofuCurry, checkMaillardBeforeBraising, checkAcidInFatDish, checkRiposoDellaCarne, checkDeglassatura, checkEmulsion, checkUmamiAnchor, checkThreeCreams, checkRiduzione]
    .forEach(function (fn) {
      try {
        const r = fn(recipe);
        (r.errors || []).forEach(function (e) { if (errors.indexOf(e) < 0) errors.push(e); });
        (r.warnings || []).forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); });
      } catch (e) {
        // defensive: check darf nie die Pipeline brechen
      }
    });
  return { errors: errors, warnings: warnings };
}

module.exports = {
  evaluateAll: evaluateAll,
  checkFatOverload: checkFatOverload,
  checkFiberOverload: checkFiberOverload,
  checkPsylliumInProteinDish: checkPsylliumInProteinDish,
  checkVinegarInTofuCurry: checkVinegarInTofuCurry,
  checkMaillardBeforeBraising: checkMaillardBeforeBraising,
  checkAcidInFatDish: checkAcidInFatDish,
  checkRiposoDellaCarne: checkRiposoDellaCarne,
  checkDeglassatura: checkDeglassatura,
  checkEmulsion: checkEmulsion,
  checkUmamiAnchor: checkUmamiAnchor,
  checkThreeCreams: checkThreeCreams,
  checkRiduzione: checkRiduzione,
};
