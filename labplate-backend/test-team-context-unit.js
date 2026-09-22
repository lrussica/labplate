/**
 * Phase-1/2/3 Unit-Tests für KI-Team Shared Context / Handoff / Router
 * Run: node labplate-backend/test-team-context-unit.js
 */
'use strict';

const core = require('./nutri-recipe-core');
const router = require('./team-router');
const coachCore = require('./nutri-coach-core');

const TEAM_HANDOFF_BRIEF_MAX = 400;

function teamAgeBand(age) {
  const n = Number(age);
  if (!isFinite(n) || n <= 0) return null;
  if (n < 18) return 'under_18';
  if (n < 30) return '18-29';
  if (n < 40) return '30-39';
  if (n < 50) return '40-49';
  if (n < 65) return '50-64';
  return '65plus';
}

function truncateTeamBrief(text, maxLen) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const cap = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEAM_HANDOFF_BRIEF_MAX;
  if (s.length <= cap) return s;
  return s.slice(0, cap).trim();
}

function normalizeTeamHandoff(raw, fromDefault, toDefault) {
  return router.normalizeTeamHandoff(raw, fromDefault, toDefault);
}

function mvCoachUserWantsRecipe(text) {
  if (!text) return false;
  return /rezept|rezeptidee|kochen|koch mir|was (soll|kann) ich (heute )?(essen|kochen)|mahlzeit(envorschlag| idee)|meal idea|recipe/i.test(String(text));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(teamAgeBand(35) === '30-39', 'ageBand 35');
assert(teamAgeBand(null) === null, 'ageBand null');
assert(truncateTeamBrief('  a   b  ') === 'a b', 'truncate whitespace');
assert(truncateTeamBrief('x'.repeat(500)).length === 400, 'truncate 400');
assert(normalizeTeamHandoff({ to: 'koch', brief: 'Abendessen ohne Gluten' }, 'coach', 'koch').brief.includes('Abendessen'), 'normalize brief');
assert(normalizeTeamHandoff({ to: 'shop' }, 'coach', 'koch') === null, 'reject bad to');
assert(mvCoachUserWantsRecipe('Bitte ein Rezept fürs Abendessen'), 'wants recipe');
assert(!mvCoachUserWantsRecipe('Ich bin gestresst'), 'no recipe intent');

const schema = {
  schemaVersion: 1,
  user: {
    profile: { ageBand: '30-39', gender: 'w', activityLevel: 'moderate' },
    labsFlags: { carbSensitive: true, preferFiberOils: false, omega3Focus: false, priority: null },
    allergens: ['Gluten'],
    today: { macrosPct: { kh: 62, protein: 40, fett: 55, fiber: 30, salt: 20 }, topMicroGaps: [{ key: 'eisen_mg', label: 'Eisen', pct: 42 }] },
    history: { windowDays: 14, patterns: [] },
    microGoalsActive: ['eisen_mg'],
  },
  coach: { goals: [], patterns: [], lastHandoffOut: null, lastHandoffIn: null },
  koch: { recentRecipes: [], savedRecipeIds: [], preferences: { lang: 'de' }, lastHandoffIn: null, lastHandoffOut: null },
  supplement: { lastHandoffIn: null, lastHandoffOut: null },
  einkauf: { lastHandoffIn: null, lastHandoffOut: null },
  context: {
    currentOverlay: 'lp-ov-mvcoach',
    lastInteraction: 'coach',
    transitionRequested: true,
    transitionReason: 'user_requested_recipe',
    activeAgent: 'coach',
    crisisActive: false,
    handoff: normalizeTeamHandoff({
      to: 'koch',
      reason: 'intent_routing',
      brief: 'Nutzer möchte Abendessen, eisenreich, ohne Gluten.',
      suggestedPrefill: 'Abendessen eisenreich ohne Gluten',
    }, 'coach', 'koch'),
  },
};

assert(schema.context.handoff.to === 'koch', 'schema handoff');
assert(schema.context.handoff.brief.length <= 400, 'brief cap');
assert(schema.user.profile.ageBand === '30-39', 'example profile');

// ---- Phase 2: Koch → Coach ----
assert(core.detectEmotionalBlockade('Das schaffe ich eh nicht').kind === 'resignation', 'resign match');
assert(core.detectEmotionalBlockade('High-Protein Abendessen mit Lachs') === null, 'normal recipe no emotion');
const early = core.tryEmotionalHandoffEarly({
  structured: false,
  team_ai: true,
  pantry_ingredients: ['Bringt nichts, lohnt sich nicht'],
});
assert(early && early.handoff && early.handoff.to === 'coach', 'early handoff to coach');

// Falscher LLM-Sentinel bei klarem Gericht (Allergen-Konflikt) → KEIN Coach-Handoff
assert(
  core.extractHandoffFromParsed(
    { title: '__TEAM_HANDOFF_COACH__', chef_analysis: 'Allergie' },
    'Schnelles Rührei mit Räucherlachs und Frischkäse'
  ) === null,
  'no handoff for dairy dish query'
);
assert(
  core.extractHandoffFromParsed(
    { title: '__TEAM_HANDOFF_COACH__', chef_analysis: 'Allergie' },
    'Proteinreicher Snack mit griechischem Joghurt und Nüssen'
  ) === null,
  'no handoff for yogurt snack query'
);
assert(
  core.extractHandoffFromParsed(
    { handoff: { to: 'coach', brief: 'x' } },
    'Schnelles Pasta-Gericht mit Lachs und Sahnesauce'
  ) === null,
  'no handoff field for cream sauce dish'
);
assert(
  !!core.extractHandoffFromParsed(
    { title: '__TEAM_HANDOFF_COACH__', chef_analysis: 'resigniert' },
    'Das schaffe ich eh nicht'
  ),
  'real emotion still handoffs'
);

// ---- Phase 3: Coach-Router ----
assert(router.detectCoachRouteIntent('Gib mir ein Rezept fürs Abendessen').to === 'koch', 'route recipe');
assert(router.detectCoachRouteIntent('Was soll ich kochen?').to === 'koch', 'route cook');
assert(router.detectCoachRouteIntent('Low-Carb Mahlzeit').to === 'koch', 'route lowcarb');
assert(router.detectCoachRouteIntent('Ich habe Eisenmangel').to === 'supplement', 'route mangel');
assert(router.detectCoachRouteIntent('Was soll ich einnehmen?').to === 'supplement', 'route einnehmen');
assert(router.detectCoachRouteIntent('Vitamin D?').to === 'supplement', 'route vitamin d');
assert(router.detectCoachRouteIntent('Was muss ich kaufen?').to === 'einkauf', 'route kaufen');
assert(router.detectCoachRouteIntent('Einkaufsliste bitte').to === 'einkauf', 'route liste');
assert(router.detectCoachRouteIntent('Fehlt etwas?').to === 'einkauf', 'route fehlt');
assert(router.detectCoachRouteIntent('Das schaffe ich nicht').to === 'coach', 'route emotion stay');
assert(router.detectCoachRouteIntent('Bin enttäuscht').to === 'coach', 'route emotion');
assert(router.detectCoachRouteIntent('Keine Energie heute').to === 'coach', 'route energy');
assert(router.detectCoachRouteIntent('Wie war dein Tag?') === null, 'route none');

// ---- Phase 3 Korrektur: Coach darf NIE Rezepte ausgeben ----
assert(coachCore.detectRecipeIntent('Gib mir ein Rezept'), 'coachCore gib mir');
assert(coachCore.detectRecipeIntent('Was soll ich kochen'), 'coachCore kochen');
assert(coachCore.detectRecipeIntent('Low-Carb Mahlzeit'), 'coachCore lowcarb');
assert(coachCore.detectRecipeIntent('Mach mir ein Rezept'), 'coachCore mach mir');
assert(coachCore.detectRecipeIntent('Ich will kochen'), 'coachCore will kochen');
assert(!coachCore.detectRecipeIntent('Das schaffe ich nicht'), 'coachCore no false recipe on emotion');

const earlyRezept = coachCore.tryRezeptHandoffEarly({ text: 'Gib mir ein Rezept', team_ai: true });
assert(earlyRezept && earlyRezept.handoff && earlyRezept.handoff.to === 'koch', 'early rezept handoff');
assert(earlyRezept.handoff.reason === 'rezept_intent', 'reason rezept_intent');
assert(earlyRezept.handoff.brief === coachCore.REZEPT_INTENT_BRIEF, 'fixed brief');
assert(Object.keys(earlyRezept).length === 1 && earlyRezept.handoff, 'only handoff key');

assert(coachCore.tryRezeptHandoffEarly({ text: 'Gib mir ein Rezept', team_ai: false }) === null, 'flag off no handoff');
assert(coachCore.tryRezeptHandoffEarly({ text: 'Das schaffe ich nicht', team_ai: true }) === null, 'emotion stay no rezept handoff');

const hKoch = router.buildCoachHandoffFromIntent('Rezept Lachs', { to: 'koch', reason: 'rezept_intent' });
assert(hKoch && hKoch.to === 'koch' && hKoch.reason === 'rezept_intent', 'handoff koch rezept_intent');
assert(hKoch.brief === coachCore.REZEPT_INTENT_BRIEF, 'handoff koch fixed brief');
const hSupp = router.buildCoachHandoffFromIntent('Vitamin D', { to: 'supplement', reason: 'intent_routing' });
assert(hSupp && hSupp.to === 'supplement', 'handoff supplement');
const hShop = router.buildCoachHandoffFromIntent('Einkaufsliste', { to: 'einkauf', reason: 'intent_routing' });
assert(hShop && hShop.to === 'einkauf', 'handoff einkauf');
assert(router.buildCoachHandoffFromIntent('Bin müde', { to: 'coach', reason: 'intent_routing' }) === null, 'emotion no outbound');

assert(router.detectCoachRouteIntent('Gib mir ein Rezept fürs Abendessen').reason === 'rezept_intent', 'route recipe reason');

assert(normalizeTeamHandoff({ to: 'supplement', brief: 'Vitamin D Orientierung' }, 'coach', 'supplement').to === 'supplement', 'normalize supplement');
assert(normalizeTeamHandoff({ to: 'einkauf', brief: 'Liste' }, 'coach', 'einkauf').to === 'einkauf', 'normalize einkauf');

const incoming = router.validateIncomingColleague({
  agent: 'supplement',
  text: 'Vitamin D?',
  lang: 'de',
  handoff_brief: 'Nutzer fragt nach Vitamin D',
  user_slice: schema.user,
});
assert(incoming && incoming.agent === 'supplement', 'incoming colleague');
const msgs = router.buildColleagueMessages('supplement', 'Vitamin D?', {
  lang: 'de',
  handoffBrief: 'Nutzer fragt nach Vitamin D',
  userSlice: schema.user,
});
assert(msgs[0].role === 'system' && msgs[0].content.includes('Supplement-Coach'), 'supp prompt');
assert(msgs[0].content.includes('Mental-Verhalten-Coach') || msgs[0].content.includes('HANDOFF VOM MENTAL'), 'supp handoff in prompt');
assert(msgs[0].content.includes('TEAM-KONTEXT'), 'shared context in prompt');
assert(msgs[0].content.includes('alltagsorientierte') || msgs[0].content.includes('Alltag'), 'supp orientation tone');
assert(msgs[0].content.includes('keine Dosierungen') || msgs[0].content.includes('Keine Dosierungen') || /keine Dosierungen/i.test(msgs[0].content), 'supp no dosing');
assert(!/aerztliche Abklaerung|Laborkontrolle empfehlen/i.test(msgs[0].content), 'supp no auto doctor referral');
assert(/Rezept|koch|auto_handoff/i.test(msgs[0].content), 'supp recipe comfort hint');

const shopMsgs = router.buildColleagueMessages('einkauf', 'Was fehlt?', {
  lang: 'de',
  handoffBrief: 'Einkaufs-Intent',
  userSlice: schema.user,
});
assert(shopMsgs[0].content.includes('Einkaufs-Coach'), 'shop prompt');

const advice = router.validateColleagueResponse({
  type: 'advice',
  summary: 'Orientierung',
  details: 'Lebensmittelquellen',
  next_step: 'Wenn du möchtest, Rezept-Coach',
  items: ['Fetter Fisch', 'Sonnenlicht'],
}, 'supplement');
assert(advice && advice.items.length === 2, 'validate advice');
assert(advice.handoff === null, 'no handoff default');
assert(advice.next_step === '' || !/leite mich weiter/i.test(advice.next_step || ''), 'strip chat confirm next_step');

const adviceH = router.validateColleagueResponse({
  type: 'advice',
  summary: 'Eisen im Alltag',
  details: 'Linsen und Spinat',
  next_step: 'Wenn du möchtest, leite ich dich zum Rezept-Coach weiter.',
  items: ['Linsen', 'Spinat'],
  handoff: { to: 'koch', reason: 'rezept_intent', brief: 'Eisenreiches Rezept' },
}, 'supplement');
assert(adviceH && adviceH.handoff && adviceH.handoff.to === 'koch', 'supp handoff koch');
assert(adviceH.next_step === '', 'handoff clears chat confirm');

// Medizinischer Text wird ersetzt
const banned = router.validateColleagueResponse({
  type: 'advice',
  summary: 'Bitte hole dir professionelle Hilfe.',
  details: '',
  next_step: '',
  items: [],
}, 'supplement');
assert(banned && !/professionelle Hilfe/i.test(banned.summary + banned.details), 'strip medical fallback');

const fb = router.supplementCore.buildSupplementOrientationFallback('Ich habe Eisenmangel', 'Nutzer hat Eisenmangel');
assert(fb.type === 'advice' && /Eisen/i.test(fb.summary + fb.details), 'local eisen fallback');
assert(!/professionelle Hilfe/i.test(JSON.stringify(fb)), 'fallback not medical');
assert(fb.handoff && fb.handoff.to === 'koch', 'mangel gets recipe button handoff');
assert(fb.auto_handoff === false, 'mangel → button not auto');
assert(fb.items && fb.items.length >= 2, 'mangel orientation foods');

const comfortRecipe = router.supplementCore.buildSupplementComfortResponse(
  'Was soll ich kochen?',
  'Nutzer hat Vitamin-B Thema',
  { forceAutoHandoff: true }
);
assert(comfortRecipe.auto_handoff === true, 'recipe intent → auto_handoff');
assert(comfortRecipe.handoff.brief.theme === 'vitamin_b', 'comfort brief.theme vitamin_b');
assert(comfortRecipe.items && comfortRecipe.items.length >= 2, 'comfort still has foods');
assert(!/Rezept-Coach besser/i.test(comfortRecipe.summary + comfortRecipe.details), 'no skip-orientation copy');

assert(router.trySupplementOutboundHandoff('Gib mir ein Rezept') && router.trySupplementOutboundHandoff('Gib mir ein Rezept').to === 'koch', 'supp outbound recipe');
assert(router.trySupplementOutboundHandoff('Was muss ich kaufen?').to === 'einkauf', 'supp outbound shop');
assert(router.trySupplementOutboundHandoff('Das schaffe ich nicht').to === 'coach', 'supp outbound emotion');
assert(router.trySupplementOutboundHandoff('Ich habe Eisenmangel') === null, 'supp normal mangel stays');

// nutri-supplement-core Intent-Erkennung (Rezept-Weiterleitung)
const sc = router.supplementCore;
assert(sc.detectSupplementRouteIntent('Bitte ein Rezept dazu').handoff.to === 'koch', 'core rezept');
assert(sc.detectSupplementRouteIntent('Bitte ein Rezept dazu').handoff.reason === 'rezept_intent', 'core rezept reason');
assert(sc.detectSupplementRouteIntent('Bitte ein Rezept dazu').handoff.brief.source === 'supplement', 'core rezept brief source');
assert(sc.detectSupplementRouteIntent('Bitte ein Rezept dazu', 'Eisenmangel').handoff.brief.theme === 'eisen', 'core rezept brief theme eisen');
assert(sc.detectSupplementRouteIntent('Bitte ein Rezept dazu', 'Vitamin-B Müdigkeit').handoff.brief.theme === 'vitamin_b', 'core rezept brief theme vitamin_b');
assert(sc.detectSupplementRouteIntent('Weiterleiten zum Koch').handoff.to === 'koch', 'core weiterleiten');
assert(sc.detectSupplementRouteIntent('Mahlzeit vorschlagen').handoff.to === 'koch', 'core mahlzeit');
assert(sc.detectSupplementRouteIntent('Mach mir etwas').handoff.to === 'koch', 'core mach mir etwas');
assert(sc.detectSupplementRouteIntent('Mach mir was').handoff.to === 'koch', 'core mach mir was');
assert(sc.detectSupplementRouteIntent('Mach mir ein Gericht').handoff.to === 'koch', 'core mach mir gericht');
assert(sc.detectSupplementRouteIntent('Etwas dazu essen').handoff.to === 'koch', 'core dazu essen');
assert(sc.detectSupplementRouteIntent('Was passt dazu?').handoff.to === 'koch', 'core passt dazu');
assert(sc.detectSupplementRouteIntent('Ich will etwas dazu').handoff.to === 'koch', 'core will etwas dazu');
assert(sc.detectSupplementRouteIntent('Ich brauche ein Gericht dazu').handoff.to === 'koch', 'core brauche gericht');
assert(sc.detectSupplementRouteIntent('Leite mich weiter').handoff.to === 'koch', 'core leite weiter');
assert(sc.detectSupplementRouteIntent('Bring mich zum Koch').handoff.to === 'koch', 'core bring koch');
assert(sc.detectSupplementRouteIntent('Kannst du mir etwas kochen').handoff.to === 'koch', 'core kannst kochen');
assert(sc.detectSupplementRouteIntent('Ich will ein Rezept dazu').handoff.to === 'koch', 'core will rezept dazu');
assert(sc.detectSupplementRouteIntent('Ich will ein Gericht mit diesen Lebensmitteln').handoff.to === 'koch', 'core gericht lebensmittel');
assert(sc.detectSupplementRouteIntent('Zubereiten bitte').handoff.to === 'koch', 'core zubereiten');
assert(sc.detectSupplementRouteIntent('A nice meal please').handoff.to === 'koch', 'core meal');
assert(sc.detectSupplementRouteIntent('Zutaten einkaufen').handoff.to === 'einkauf', 'core einkauf');
assert(sc.detectSupplementRouteIntent('Zutaten einkaufen').handoff.reason === 'einkauf_intent', 'core einkauf reason');
assert(sc.detectSupplementRouteIntent('Ich bin überfordert').handoff.to === 'coach', 'core emotion');
assert(sc.detectSupplementRouteIntent('Ich bin überfordert').handoff.reason === 'emotion_intent', 'core emotion reason');
assert(sc.detectSupplementRouteIntent('Ich habe Eisenmangel') === null, 'core no intent');
assert(sc.trySupplementHandoffEarly('Gericht bitte').handoff.to === 'koch', 'early handoff koch');
assert(
  sc.trySupplementHandoffEarly('Rezept bitte', 'supplement', 'Nutzer hat Eisenmangel').handoff.brief.theme === 'eisen',
  'early koch brief.theme eisen'
);
assert(
  sc.buildKochThemeBrief('Vitamin B Orientierung').theme === 'vitamin_b',
  'buildKochThemeBrief vitamin_b'
);
assert(
  normalizeTeamHandoff({
    to: 'koch',
    reason: 'rezept_intent',
    brief: { theme: 'eisen', source: 'supplement' },
  }, 'supplement', 'koch').brief.theme === 'eisen',
  'normalize preserves brief.theme'
);
assert(
  normalizeTeamHandoff({
    to: 'koch',
    reason: 'rezept_intent',
    brief: { theme: 'vitamin_b', source: 'supplement' },
  }, 'supplement', 'koch').theme === 'vitamin_b',
  'normalize exposes theme for recipe coach'
);

// Themenbasierte Rezepte (Rezept-Coach liest Brief)
assert(core.detectNutrientTheme('HANDOFF … Eisenmangel …').key === 'eisen', 'theme eisen');
assert(core.detectNutrientTheme('Vitamin-B und Müdigkeit').key === 'vitamin_b', 'theme vitamin b');
assert(core.detectNutrientTheme('Vitamin E').key === 'vitamin_e', 'theme vitamin e');
const vitE = sc.buildOrientationContent('Vitamin E', '');
assert(vitE.topic === 'Vitamin E' && vitE.foods.indexOf('Nüsse') >= 0, 'orient vitamin e');
assert(/ärztliche Rücksprache/i.test(vitE.footer), 'orient vitamin e footer');
assert(core.detectNutrientTheme('B12 Mangel').key === 'vitamin_b12', 'theme b12');
assert(core.detectNutrientTheme('Folat / Folsäure').key === 'folat', 'theme folat');
assert(core.detectNutrientTheme('Vitamin K2').key === 'vitamin_k2', 'theme k2');
assert(core.detectNutrientTheme('Vitamin B6').key === 'vitamin_b6', 'theme b6');
assert(core.detectNutrientTheme('Abendessen ohne Thema') === null, 'theme none');
assert(core.getThemeByKey('eisen').label === 'Eisen', 'getThemeByKey eisen');
assert(core.resolveThemeFromBrief({ theme: 'vitamin_d', source: 'supplement' }).key === 'vitamin_d', 'resolve brief.theme d');
const guideEisen = core.buildThemeRecipeGuidance({ theme: 'eisen' });
assert(guideEisen && guideEisen.label === 'Eisen' && /Linsen|Spinat/.test(guideEisen.instruction), 'theme guide eisen');
assert(guideEisen.foods.indexOf('Linsen') >= 0, 'theme foods lentils');

const vitD = sc.buildOrientationContent('Vitamin D?', 'Nutzer fragt nach Vitamin D');
assert(vitD.topic === 'Vitamin D', 'orient vitamin d topic');
assert(/Tageslicht und abwechslungsreiche Mahlzeiten/i.test(vitD.tip), 'orient vitamin d tip');
assert(vitD.foods.indexOf('Tageslicht') >= 0, 'orient vitamin d foods');
assert(/ärztliche Rücksprache/i.test(vitD.footer), 'orient vitamin d footer');
const comfortD = sc.buildSupplementComfortResponse('Vitamin D', 'Nutzer Vitamin D');
assert(comfortD.footer && /Viele Menschen ergänzen dieses Vitamin/i.test(comfortD.footer), 'comfort footer v4');
assert(!comfortD.partner_hint, 'partner hint disabled');
assert(sc.SUPPLEMENT_PARTNER_HINT_ENABLED === false, 'partner flag off');
const msgsTheme = core.buildGenerativeMessages({
  mode: 'shopping',
  lang: 'de',
  team_ai: true,
  pantry_ingredients: ['einfaches Gericht'],
  macros: {},
  micronutrient_gaps: [],
  lab_guideline_constraints: null,
  allergens: [],
  theme: 'eisen',
  handoff_brief: { theme: 'eisen', source: 'supplement' },
  ai_instruction: 'HANDOFF VOM SUPPLEMENT-COACH',
});
assert(msgsTheme[0].content.includes('THEMEN-REZEPT') || msgsTheme[0].content.includes('Eisen'), 'generative theme rules');
assert(msgsTheme[1].content.includes('Eisen') || /Linsen|Spinat/.test(msgsTheme[1].content), 'generative theme user hint');
const validatedIn = core.validateIncoming({
  mode: 'shopping',
  lang: 'de',
  handoff_brief: { theme: 'vitamin_b', source: 'supplement' },
  theme: 'vitamin_b',
  pantry_ingredients: [],
});
assert(validatedIn && validatedIn.theme === 'vitamin_b' && validatedIn.handoff_brief.theme === 'vitamin_b', 'validateIncoming theme');
const msgsPlain = core.buildGenerativeMessages({
  mode: 'shopping',
  lang: 'de',
  team_ai: true,
  pantry_ingredients: ['Nudeln'],
  macros: {},
  micronutrient_gaps: [],
  lab_guideline_constraints: null,
  allergens: [],
  ai_instruction: '',
});
assert(/Standardrezept|kein Naehrstoff-Thema/i.test(msgsPlain[0].content), 'no theme → standard');

// runSupplementCoach ohne Groq → Orientierung
(async () => {
  const ran = await router.runSupplementCoach('Nutzer hat Eisenmangel', {
    text: 'Ich habe Eisenmangel',
    lang: 'de',
    handoffBrief: 'Nutzer hat Eisenmangel',
    userSlice: schema.user,
    history: [],
  }, null);
  assert(ran && ran.type === 'advice' && !/professionelle Hilfe/i.test(JSON.stringify(ran)), 'runSupplementCoach offline');
  assert(ran.handoff && ran.handoff.to === 'koch', 'mangel offline offers recipe cta');
  assert(ran.auto_handoff === false, 'mangel offline button not auto');
  const ranRecipe = await router.runSupplementCoach('Nutzer hat Eisenmangel', {
    text: 'Bitte ein Rezept dazu',
    lang: 'de',
    handoffBrief: 'Nutzer hat Eisenmangel',
    userSlice: schema.user,
    history: [],
  }, null);
  assert(ranRecipe && ranRecipe.handoff && ranRecipe.handoff.to === 'koch', 'supp→koch early');
  assert(ranRecipe.handoff.brief && ranRecipe.handoff.brief.theme === 'eisen', 'supp→koch brief.theme');
  assert(ranRecipe.handoff.brief.source === 'supplement', 'supp→koch brief.source');
  assert(ranRecipe.handoff.reason === 'rezept_intent', 'supp→koch reason');
  assert(ranRecipe.auto_handoff === true, 'supp→koch auto_handoff');
  assert(ranRecipe.items && ranRecipe.items.length >= 2, 'supp→koch orientation foods first');
  assert(ranRecipe.next_step === '' || !/leite mich weiter/i.test(ranRecipe.next_step || ''), 'no chat confirm step');
  console.log('OK team-context unit tests passed (phase 1+2+3+coach-rezept+supplement-comfort-flow)');
})().catch((e) => { console.error(e); process.exit(1); });
