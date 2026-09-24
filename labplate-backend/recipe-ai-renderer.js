'use strict';

const ACTIONS = {
  de: { chop: 'Schneiden', fry: 'Braten', boil: 'Kochen', simmer: 'Köcheln', bake: 'Backen', mix: 'Mischen', whisk: 'Verquirlen', fold_in: 'Unterheben', season: 'Würzen', rest: 'Ruhen lassen', remove_from_heat: 'Vom Herd nehmen', serve: 'Servieren', stir: 'Rühren', saute: 'Anbraten', grill: 'Grillen', roast: 'Rösten', marinate: 'Marinieren', drain: 'Abgießen', blend: 'Pürieren', preheat: 'Vorheizen' },
  it: { chop: 'Tagliare', fry: 'Friggere', boil: 'Bollire', simmer: 'Sobbollire', bake: 'Cuocere', mix: 'Mescolare', whisk: 'Sbattere', fold_in: 'Incorporare', season: 'Condire', rest: 'Lasciare riposare', remove_from_heat: 'Togliere dal fuoco', serve: 'Servire', stir: 'Mescolare', saute: 'Rosolare', grill: 'Grigliare', roast: 'Arrostire', marinate: 'Marinare', drain: 'Scolare', blend: 'Frullare', preheat: 'Preriscaldare' },
  fr: { chop: 'Couper', fry: 'Faire frire', boil: 'Faire bouillir', simmer: 'Mijoter', bake: 'Cuire', mix: 'Mélanger', whisk: 'Fouetter', fold_in: 'Incorporer délicatement', season: 'Assaisonner', rest: 'Laisser reposer', remove_from_heat: 'Retirer du feu', serve: 'Servir', stir: 'Remuer', saute: 'Faire revenir', grill: 'Griller', roast: 'Rôtir', marinate: 'Mariner', drain: 'Égoutter', blend: 'Mixer', preheat: 'Préchauffer' },
  tr: { chop: 'Doğramak', fry: 'Kızartmak', boil: 'Haşlamak', simmer: 'Kısık ateşte pişirmek', bake: 'Fırınlamak', mix: 'Karıştırmak', whisk: 'Çırpmak', fold_in: 'Nazikçe yedirmek', season: 'Baharatlamak', rest: 'Dinlendirmek', remove_from_heat: 'Ocaktan almak', serve: 'Servis etmek', stir: 'Karıştırmak', saute: 'Sotelemek', grill: 'Izgara yapmak', roast: 'Kavurmak', marinate: 'Marine etmek', drain: 'Süzmek', blend: 'Blenderdan geçirmek', preheat: 'Önceden ısıtmak' },
};

function localizedName(ingredient, lang) {
  if (ingredient && ingredient.name && typeof ingredient.name === 'object') {
    return ingredient.name[lang] || ingredient.name.de || ingredient.name.it || Object.values(ingredient.name)[0];
  }
  return String((ingredient && ingredient.name) || '');
}

function formatAmount(ingredient, amount, lang) {
  const unit = String(ingredient.unit || '');
  if (unit === 'piece') {
    const count = Math.round(amount * 10) / 10;
    return `${count} ${unit}`;
  }
  return `${Math.round(amount * 10) / 10} ${unit}`;
}

function ingredientLabel(ingredient, amount, lang) {
  const name = localizedName(ingredient, lang);
  if (String(ingredient.unit || '') === 'piece') {
    const count = Math.round(amount * 10) / 10;
    if (lang === 'de' && /ei\b/i.test(name)) return `${count} ${count === 1 ? 'Ei' : 'Eier'}`;
    if (lang === 'it' && /uov/i.test(name)) return `${count} ${count === 1 ? 'uovo' : 'uova'}`;
    if (lang === 'fr' && /œuf|oeuf/i.test(name)) return `${count} ${count === 1 ? 'œuf' : 'œufs'}`;
    if (lang === 'tr' && /yumurta/i.test(name)) return `${count} yumurta`;
  }
  return `${formatAmount(ingredient, amount, lang)} ${name}`;
}

function renderInstruction(step, ingredients, lang, servings) {
  const names = (step.ingredientIds || []).map((id) => ingredients.find((i) => i.id === id)).filter(Boolean);
  const listed = names.map((ingredient) => ingredientLabel(ingredient, Number(ingredient.amount), lang));
  const subject = listed.join(lang === 'tr' ? ' ve ' : ', ');
  const action = ACTIONS[lang][step.action] || ACTIONS[lang].mix;
  const duration = step.durationMin == null ? '' : ` (${step.durationMin} min)`;
  if (lang === 'de') return `${action}: ${subject || 'die Zutaten'}${duration}.`;
  if (lang === 'it') return `${action}: ${subject || 'gli ingredienti'}${duration}.`;
  if (lang === 'fr') return `${action} : ${subject || 'les ingrédients'}${duration}.`;
  return `${action}: ${subject || 'malzemeleri'}${duration}.`;
}

function renderRecipe(recipe, opts) {
  const lang = ACTIONS[(opts && opts.lang) || 'de'] ? (opts && opts.lang) || 'de' : 'de';
  const servings = Number(opts && opts.servings) > 0 ? Number(opts.servings) : Number(recipe.servings) || 1;
  const factor = servings / (Number(recipe.servings) || 1);
  const renderedIngredients = (recipe.ingredients || []).map((i) => ({
    ...i,
    amount: Math.round(Number(i.amount) * factor * 10) / 10,
  }));
  const renderedById = new Map(renderedIngredients.map((i) => [i.id, i]));
  return {
    title: recipe.title,
    servings,
    ingredients: renderedIngredients.map((i) => ({
      id: i.id, name: i.name, amount: i.amount, unit: i.unit,
    })),
    steps: (recipe.steps || []).map((s) => ({
      order: s.order,
      action: s.action,
      label: ACTIONS[lang][s.action] || s.action,
      durationMin: s.durationMin,
      temperatureC: s.temperatureC == null ? null : s.temperatureC,
      ingredientIds: s.ingredientIds,
      ingredientNames: (s.ingredientIds || []).map((id) => renderedById.get(id)).filter(Boolean).map((i) => localizedName(i, lang)),
      instruction: renderInstruction(s, renderedIngredients, lang, servings),
    })),
  };
}

module.exports = { renderRecipe, ACTIONS };
