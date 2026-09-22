'use strict';
/**
 * Backend API / Coach user-facing messages (7 langs).
 * Default language: en. Pass lang from request body when available.
 */

const LANGS = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];

const M = {
  provider_spoonacular: {
    en: 'Spoonacular reported an error.',
    de: 'Spoonacular meldete einen Fehler.',
    es: 'Spoonacular informó de un error.',
    it: 'Spoonacular ha segnalato un errore.',
    pt: 'A Spoonacular reportou um erro.',
    fr: 'Spoonacular a signalé une erreur.',
    tr: 'Spoonacular bir hata bildirdi.',
  },
  provider_themealdb: {
    en: 'TheMealDB reported an error.',
    de: 'TheMealDB meldete einen Fehler.',
    es: 'TheMealDB informó de un error.',
    it: 'TheMealDB ha segnalato un errore.',
    pt: 'TheMealDB reportou um erro.',
    fr: 'TheMealDB a signalé une erreur.',
    tr: 'TheMealDB bir hata bildirdi.',
  },
  provider_usda: {
    en: 'USDA FoodData Central reported an error.',
    de: 'USDA FoodData Central meldete einen Fehler.',
    es: 'USDA FoodData Central informó de un error.',
    it: 'USDA FoodData Central ha segnalato un errore.',
    pt: 'USDA FoodData Central reportou um erro.',
    fr: 'USDA FoodData Central a signalé une erreur.',
    tr: 'USDA FoodData Central bir hata bildirdi.',
  },
  param_q_or_include: {
    en: 'Parameter q or includeIngredients is required.',
    de: 'Parameter q oder includeIngredients erforderlich.',
    es: 'Se requiere el parámetro q o includeIngredients.',
    it: 'Parametro q o includeIngredients obbligatorio.',
    pt: 'Parâmetro q ou includeIngredients é obrigatório.',
    fr: 'Paramètre q ou includeIngredients requis.',
    tr: 'q veya includeIngredients parametresi gerekli.',
  },
  param_ingredients: {
    en: 'Parameter ingredients is required.',
    de: 'Parameter ingredients erforderlich.',
    es: 'Se requiere el parámetro ingredients.',
    it: 'Parametro ingredients obbligatorio.',
    pt: 'Parâmetro ingredients é obrigatório.',
    fr: 'Paramètre ingredients requis.',
    tr: 'ingredients parametresi gerekli.',
  },
  param_q: {
    en: 'Parameter q is required.',
    de: 'Parameter q erforderlich.',
    es: 'Se requiere el parámetro q.',
    it: 'Parametro q obbligatorio.',
    pt: 'Parâmetro q é obrigatório.',
    fr: 'Paramètre q requis.',
    tr: 'q parametresi gerekli.',
  },
  param_ingredient: {
    en: 'Parameter ingredient is required.',
    de: 'Parameter ingredient erforderlich.',
    es: 'Se requiere el parámetro ingredient.',
    it: 'Parametro ingredient obbligatorio.',
    pt: 'Parâmetro ingredient é obrigatório.',
    fr: 'Paramètre ingredient requis.',
    tr: 'ingredient parametresi gerekli.',
  },
  emotion_summary: {
    en: 'This sounds more like a difficult situation than a technical question.',
    de: 'Das klingt eher nach einer belastenden Situation als nach einer Fachfrage.',
    es: 'Esto suena más a una situación difícil que a una pregunta técnica.',
    it: 'Sembra più una situazione difficile che una domanda tecnica.',
    pt: 'Isto parece mais uma situação difícil do que uma pergunta técnica.',
    fr: 'Cela ressemble plus à une situation difficile qu’à une question technique.',
    tr: 'Bu, teknik bir sorudan çok zor bir duruma benziyor.',
  },
  emotion_details: {
    en: 'The mental & behavior coach is a better fit for this – I do not replace coaching.',
    de: 'Dafür ist der Mental- & Verhaltencoach besser geeignet – ich ersetze kein Coaching.',
    es: 'Para esto encaja mejor el coach mental y de conducta – no sustituyo el coaching.',
    it: 'Per questo è più adatto il coach mentale e comportamentale – non sostituisco il coaching.',
    pt: 'Para isto o coach mental e comportamental é mais adequado – não substituo o coaching.',
    fr: 'Le coach mental et comportemental convient mieux – je ne remplace pas le coaching.',
    tr: 'Bunun için mental ve davranış koçu daha uygun – koçluğun yerini almam.',
  },
  emotion_next: {
    en: 'If you like, I can hand you over to my colleague, the mental coach.',
    de: 'Wenn du möchtest, leite ich dich zu meinem Kollegen, dem Mental-Coach, weiter.',
    es: 'Si quieres, te paso con mi colega, el coach mental.',
    it: 'Se vuoi, ti passo al mio collega, il coach mentale.',
    pt: 'Se quiseres, passo-te ao meu colega, o coach mental.',
    fr: 'Si tu veux, je te passe à mon collègue, le coach mental.',
    tr: 'İstersen seni meslektaşım olan mental koça yönlendirebilirim.',
  },
  supplement_emotion_summary: {
    en: 'This sounds more like a difficult situation than a nutrient question.',
    de: 'Das klingt eher nach einer belastenden Situation als nach einer Nährstofffrage.',
    es: 'Esto suena más a una situación difícil que a una pregunta sobre nutrientes.',
    it: 'Sembra più una situazione difficile che una domanda sui nutrienti.',
    pt: 'Isto parece mais uma situação difícil do que uma pergunta sobre nutrientes.',
    fr: 'Cela ressemble plus à une situation difficile qu’à une question sur les nutriments.',
    tr: 'Bu, besin sorusundan çok zor bir duruma benziyor.',
  },
  supplement_shop_summary: {
    en: 'Sounds like missing ingredients or a shopping list.',
    de: 'Klingt nach fehlenden Zutaten oder einer Einkaufsliste.',
    es: 'Suena a ingredientes que faltan o a una lista de la compra.',
    it: 'Sembra ingredienti mancanti o una lista della spesa.',
    pt: 'Parece ingredientes em falta ou uma lista de compras.',
    fr: 'Ça sonne comme des ingrédients manquants ou une liste de courses.',
    tr: 'Eksik malzemeler veya alışveriş listesi gibi görünüyor.',
  },
  supplement_shop_details: {
    en: 'The shopping coach handles this – I do not create shopping lists myself.',
    de: 'Dafür ist der Einkaufs-Coach zuständig – ich erstelle selbst keine Einkaufsliste.',
    es: 'De eso se encarga el coach de compras – yo no creo listas de la compra.',
    it: 'Se ne occupa il coach della spesa – non creo io liste della spesa.',
    pt: 'Disso cuida o coach de compras – eu próprio não crio listas de compras.',
    fr: 'Le coach courses s’en occupe – je ne crée pas de listes moi-même.',
    tr: 'Bunu alışveriş koçu yapar – ben kendim alışveriş listesi oluşturmam.',
  },
  coach_unavailable_details: {
    en: 'No fully reliable nutrition assessment possible (check servings status).',
    de: 'Keine uneingeschränkt sichere Ernährungsbewertung möglich (Portionsstatus prüfen).',
    es: 'No es posible una evaluación nutricional plenamente fiable (revisa las raciones).',
    it: 'Non è possibile una valutazione nutrizionale pienamente affidabile (controlla le porzioni).',
    pt: 'Não é possível uma avaliação nutricional totalmente fiável (verifica as doses).',
    fr: 'Évaluation nutritionnelle pleinement fiable impossible (vérifie les portions).',
    tr: 'Tam güvenilir bir beslenme değerlendirmesi mümkün değil (porsiyon durumunu kontrol et).',
  },
  warn_high_fat: {
    en: 'High fat per serving – check portion size or preparation.',
    de: 'Viel Fett pro Portion – Portionsgröße oder Zubereitung prüfen.',
    es: 'Mucha grasa por ración – revisa el tamaño de la porción o la preparación.',
    it: 'Molti grassi per porzione – controlla la porzione o la preparazione.',
    pt: 'Muita gordura por dose – verifica o tamanho da dose ou a preparação.',
    fr: 'Beaucoup de graisses par portion – vérifie la taille ou la préparation.',
    tr: 'Porsiyon başına yüksek yağ – porsiyon boyutunu veya hazırlığı kontrol et.',
  },
  warn_low_protein: {
    en: 'Low protein per serving – consider a protein-rich side or alternative.',
    de: 'Wenig Protein pro Portion – proteinreiche Beilage oder Alternative erwägen.',
    es: 'Poca proteína por ración – valora un acompañamiento o alternativa rica en proteína.',
    it: 'Poca proteina per porzione – valuta un contorno o un’alternativa proteica.',
    pt: 'Pouca proteína por dose – considera um acompanhamento ou alternativa rica em proteína.',
    fr: 'Peu de protéines par portion – envisage un accompagnement ou une alternative riche en protéines.',
    tr: 'Porsiyon başına az protein – proteinli bir yan veya alternatif düşün.',
  },
  warn_high_carbs: {
    en: 'High net carbs per serving.',
    de: 'Hoher Netto-Kohlenhydratanteil pro Portion.',
    es: 'Alto contenido de carbohidratos netos por ración.',
    it: 'Alto contenuto di carboidrati netti per porzione.',
    pt: 'Alto teor de hidratos líquidos por dose.',
    fr: 'Teneur élevée en glucides nets par portion.',
    tr: 'Porsiyon başına yüksek net karbonhidrat.',
  },
  warn_low_fiber: {
    en: 'Low fiber – add whole grains or vegetables.',
    de: 'Wenig Ballaststoffe – Vollkorn oder Gemüse ergänzen.',
    es: 'Poca fibra – añade cereales integrales o verduras.',
    it: 'Poche fibre – aggiungi cereali integrali o verdure.',
    pt: 'Pouca fibra – acrescenta cereais integrais ou legumes.',
    fr: 'Peu de fibres – ajoute des céréales complètes ou des légumes.',
    tr: 'Az lif – tam tahıl veya sebze ekle.',
  },
  warn_high_calories: {
    en: 'Calorie-dense per serving (> 800 kcal).',
    de: 'Kalorienreich pro Portion (> 800 kcal).',
    es: 'Alto en calorías por ración (> 800 kcal).',
    it: 'Ricco di calorie per porzione (> 800 kcal).',
    pt: 'Rico em calorias por dose (> 800 kcal).',
    fr: 'Riche en calories par portion (> 800 kcal).',
    tr: 'Porsiyon başına kalori yoğun (> 800 kcal).',
  },
  warn_added_sugar: {
    en: 'Contains sugar/sweeteners: {names}',
    de: 'Enthält Zucker/Süssungsmittel: {names}',
    es: 'Contiene azúcar/edulcorantes: {names}',
    it: 'Contiene zucchero/dolcificanti: {names}',
    pt: 'Contém açúcar/adoçantes: {names}',
    fr: 'Contient du sucre/édulcorants : {names}',
    tr: 'Şeker/tatlandırıcı içerir: {names}',
  },
  meal_breakfast: {
    en: 'Breakfast', de: 'Frühstück', es: 'Desayuno', it: 'Colazione',
    pt: 'Pequeno-almoço', fr: 'Petit-déjeuner', tr: 'Kahvaltı',
  },
  meal_lunch: {
    en: 'Lunch', de: 'Mittagessen', es: 'Comida', it: 'Pranzo',
    pt: 'Almoço', fr: 'Déjeuner', tr: 'Öğle yemeği',
  },
  meal_dinner: {
    en: 'Dinner', de: 'Abendessen', es: 'Cena', it: 'Cena',
    pt: 'Jantar', fr: 'Dîner', tr: 'Akşam yemeği',
  },
  meal_snack: {
    en: 'Snack', de: 'Snack', es: 'Snack', it: 'Spuntino',
    pt: 'Lanche', fr: 'Collation', tr: 'Atıştırmalık',
  },
  meal_hint_breakfast: {
    en: 'Protein + fiber (e.g. skyr, oats, berries)',
    de: 'Protein + Ballaststoffe (z. B. Skyr, Hafer, Beeren)',
    es: 'Proteína + fibra (p. ej. skyr, avena, bayas)',
    it: 'Proteine + fibre (es. skyr, avena, frutti di bosco)',
    pt: 'Proteína + fibra (p. ex. skyr, aveia, bagas)',
    fr: 'Protéines + fibres (ex. skyr, avoine, baies)',
    tr: 'Protein + lif (örn. skyr, yulaf, meyveler)',
  },
  meal_hint_lunch: {
    en: 'Balanced: protein, vegetables, complex carbs',
    de: 'Ausgewogen: Protein, Gemüse, komplexe KH',
    es: 'Equilibrado: proteína, verduras, carbohidratos complejos',
    it: 'Equilibrato: proteine, verdure, carboidrati complessi',
    pt: 'Equilibrado: proteína, legumes, hidratos complexos',
    fr: 'Équilibré : protéines, légumes, glucides complexes',
    tr: 'Dengeli: protein, sebze, karmaşık karbonhidrat',
  },
  meal_hint_dinner: {
    en: 'Lighter: protein + vegetables, fewer late carbs',
    de: 'Leichter: Protein + Gemüse, weniger späte KH',
    es: 'Más ligero: proteína + verduras, menos carbohidratos tarde',
    it: 'Più leggero: proteine + verdure, meno carboidrati la sera',
    pt: 'Mais leve: proteína + legumes, menos hidratos à noite',
    fr: 'Plus léger : protéines + légumes, moins de glucides le soir',
    tr: 'Daha hafif: protein + sebze, akşam daha az karbonhidrat',
  },
  meal_hint_snack: {
    en: 'Protein-rich or fiber (nuts, fruit, yogurt)',
    de: 'Proteinreich oder Ballaststoffe (Nüsse, Obst, Joghurt)',
    es: 'Rico en proteína o fibra (frutos secos, fruta, yogur)',
    it: 'Ricco di proteine o fibre (noci, frutta, yogurt)',
    pt: 'Rico em proteína ou fibra (frutos secos, fruta, iogurte)',
    fr: 'Riche en protéines ou fibres (noix, fruits, yaourt)',
    tr: 'Proteinli veya lifli (kuruyemiş, meyve, yoğurt)',
  },
  plan_note_share: {
    en: 'Split: 25 % breakfast · 35 % lunch · 30 % dinner · 10 % snack.',
    de: 'Verteilung: 25 % Frühstück · 35 % Mittag · 30 % Abend · 10 % Snack.',
    es: 'Reparto: 25 % desayuno · 35 % comida · 30 % cena · 10 % snack.',
    it: 'Ripartizione: 25 % colazione · 35 % pranzo · 30 % cena · 10 % spuntino.',
    pt: 'Distribuição: 25 % pequeno-almoço · 35 % almoço · 30 % jantar · 10 % lanche.',
    fr: 'Répartition : 25 % petit-déj · 35 % déjeuner · 30 % dîner · 10 % collation.',
    tr: 'Dağılım: %25 kahvaltı · %35 öğle · %30 akşam · %10 atıştırmalık.',
  },
  plan_note_adjust: {
    en: 'Adjust portions to hunger and training – values are target ranges.',
    de: 'Passe Portionsgrößen an Hunger und Training an – die Werte sind Zielkorridore.',
    es: 'Ajusta las raciones al hambre y al entrenamiento – son rangos objetivo.',
    it: 'Adatta le porzioni a fame e allenamento – i valori sono fasce obiettivo.',
    pt: 'Ajusta as doses à fome e ao treino – os valores são intervalos-alvo.',
    fr: 'Adapte les portions à la faim et à l’entraînement – ce sont des fourchettes.',
    tr: 'Porsiyonları açlık ve antrenmana göre ayarla – değerler hedef aralıklarıdır.',
  },
  err_no_recipe: {
    en: 'No recipe',
    de: 'Kein Rezept',
    es: 'Sin receta',
    it: 'Nessuna ricetta',
    pt: 'Sem receita',
    fr: 'Pas de recette',
    tr: 'Tarif yok',
  },
  err_no_recipe_object: {
    en: 'No recipe object',
    de: 'Kein Rezept-Objekt',
    es: 'Sin objeto de receta',
    it: 'Nessun oggetto ricetta',
    pt: 'Sem objeto de receita',
    fr: 'Pas d’objet recette',
    tr: 'Tarif nesnesi yok',
  },
  portion_estimated: {
    en: 'Portion size estimated – please check',
    de: 'Portionsgröße geschätzt – bitte prüfen',
    es: 'Tamaño de ración estimado – por favor revisa',
    it: 'Porzione stimata – controlla per favore',
    pt: 'Tamanho da dose estimado – verifica por favor',
    fr: 'Taille de portion estimée – merci de vérifier',
    tr: 'Porsiyon boyutu tahmin edildi – lütfen kontrol et',
  },
  recipe_fallback_title: {
    en: 'Recipe',
    de: 'Rezept',
    es: 'Receta',
    it: 'Ricetta',
    pt: 'Receita',
    fr: 'Recette',
    tr: 'Tarif',
  },
  provider_schema_rejected: {
    en: 'The AI provider rejected the response due to a schema/validation error.',
    de: 'Der KI-Anbieter hat die Antwort wegen Schema-/Validierungsfehler abgelehnt.',
    es: 'El proveedor de IA rechazó la respuesta por un error de esquema/validación.',
    it: 'Il provider IA ha rifiutato la risposta per un errore di schema/validazione.',
    pt: 'O fornecedor de IA rejeitou a resposta devido a um erro de esquema/validação.',
    fr: 'Le fournisseur d’IA a rejeté la réponse pour une erreur de schéma/validation.',
    tr: 'Yapay zeka sağlayıcısı yanıtı şema/doğrulama hatası nedeniyle reddetti.',
  },
  provider_rate_daily: {
    en: 'Daily AI provider quota reached. Please try again later.',
    de: 'Tageskontingent des KI-Anbieters erreicht. Bitte spaeter erneut versuchen.',
    es: 'Cuota diaria del proveedor de IA agotada. Inténtalo más tarde.',
    it: 'Quota giornaliera del provider IA esaurita. Riprova più tardi.',
    pt: 'Quota diária do fornecedor de IA atingida. Tenta novamente mais tarde.',
    fr: 'Quota quotidien du fournisseur d’IA atteint. Réessaie plus tard.',
    tr: 'Günlük yapay zeka kotası doldu. Lütfen daha sonra tekrar dene.',
  },
  provider_rate_busy: {
    en: 'The AI provider is briefly busy. Please try again in a few seconds.',
    de: 'Der KI-Anbieter ist kurzzeitig ausgelastet. Bitte in wenigen Sekunden erneut versuchen.',
    es: 'El proveedor de IA está temporalmente ocupado. Inténtalo en unos segundos.',
    it: 'Il provider IA è momentaneamente occupato. Riprova tra pochi secondi.',
    pt: 'O fornecedor de IA está temporariamente ocupado. Tenta novamente em alguns segundos.',
    fr: 'Le fournisseur d’IA est brièvement saturé. Réessaie dans quelques secondes.',
    tr: 'Yapay zeka sağlayıcısı kısa süre meşgul. Birkaç saniye sonra tekrar dene.',
  },
  provider_generic: {
    en: 'The AI provider reported an error. Please check the configured model.',
    de: 'Der KI-Anbieter meldete einen Fehler. Bitte ueberpruefe das eingestellte Modell.',
    es: 'El proveedor de IA informó de un error. Revisa el modelo configurado.',
    it: 'Il provider IA ha segnalato un errore. Controlla il modello configurato.',
    pt: 'O fornecedor de IA reportou um erro. Verifica o modelo configurado.',
    fr: 'Le fournisseur d’IA a signalé une erreur. Vérifie le modèle configuré.',
    tr: 'Yapay zeka sağlayıcısı bir hata bildirdi. Yapılandırılmış modeli kontrol et.',
  },
  debug_key_missing: {
    en: 'GROQ_API_KEY_DEBUG is not set. Debug requests intentionally do not use the prod key.',
    de: 'GROQ_API_KEY_DEBUG ist nicht gesetzt. Debug-Requests verbrauchen absichtlich nicht den Prod-Key.',
    es: 'GROQ_API_KEY_DEBUG no está configurado. Las peticiones debug no usan la clave de producción.',
    it: 'GROQ_API_KEY_DEBUG non è impostato. Le richieste debug non usano la chiave di produzione.',
    pt: 'GROQ_API_KEY_DEBUG não está definido. Pedidos de debug não usam a chave de produção.',
    fr: 'GROQ_API_KEY_DEBUG n’est pas défini. Les requêtes debug n’utilisent pas la clé prod.',
    tr: 'GROQ_API_KEY_DEBUG ayarlı değil. Debug istekleri kasıtlı olarak prod anahtarını kullanmaz.',
  },
  internal_recipe_error: {
    en: 'Internal server error during recipe generation.',
    de: 'Interner Serverfehler bei der Rezeptgenerierung.',
    es: 'Error interno del servidor al generar la receta.',
    it: 'Errore interno del server durante la generazione della ricetta.',
    pt: 'Erro interno do servidor ao gerar a receita.',
    fr: 'Erreur interne du serveur lors de la génération de la recette.',
    tr: 'Tarif oluştururken dahili sunucu hatası.',
  },
  supplement_footer: {
    en: 'Many people add this vitamin in daily life when diet or circumstances are not enough.\nIf unsure, a conversation with a doctor can help.',
    de: 'Viele Menschen ergänzen dieses Vitamin im Alltag, wenn Ernährung oder Lebensumstände nicht ausreichen.\nBei Unsicherheit hilft eine ärztliche Rücksprache.',
    es: 'Muchas personas complementan esta vitamina en el día a día cuando la dieta o las circunstancias no bastan.\nSi hay dudas, hablar con un médico puede ayudar.',
    it: 'Molte persone integrano questa vitamina nella vita quotidiana quando dieta o circostanze non bastano.\nIn caso di dubbi, un confronto con un medico può aiutare.',
    pt: 'Muitas pessoas complementam esta vitamina no dia a dia quando a alimentação ou as circunstâncias não chegam.\nEm caso de dúvida, conversar com um médico pode ajudar.',
    fr: 'Beaucoup de gens complètent cette vitamine au quotidien quand l’alimentation ou le contexte ne suffisent pas.\nEn cas de doute, un échange avec un médecin peut aider.',
    tr: 'Birçok kişi beslenme veya koşullar yetmediğinde bu vitamini günlük hayatta tamamlar.\nEmin değilsen bir hekimle konuşmak yardımcı olabilir.',
  },
  allergen_detected: {
    en: 'A saved allergen was detected in the final ingredients: {label}',
    de: 'Ein hinterlegtes Allergen wurde in den finalen Zutaten erkannt: {label}',
    es: 'Se detectó un alérgeno guardado en los ingredientes finales: {label}',
    it: 'Un allergene salvato è stato rilevato negli ingredienti finali: {label}',
    pt: 'Foi detetado um alergénio guardado nos ingredientes finais: {label}',
    fr: 'Un allergène enregistré a été détecté dans les ingrédients finaux : {label}',
    tr: 'Kayıtlı bir alerjen son malzemelerde tespit edildi: {label}',
  },
};

function normalizeLang(lang) {
  const l = String(lang || 'en').toLowerCase().slice(0, 2);
  return LANGS.indexOf(l) >= 0 ? l : 'en';
}

function t(key, lang, vars) {
  const pack = M[key];
  if (!pack) return String(key);
  const l = normalizeLang(lang);
  let s = pack[l] || pack.en || pack.de || key;
  if (vars && typeof vars === 'object') {
    Object.keys(vars).forEach(function (k) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    });
  }
  return s;
}

function langFromReq(reqOrBody) {
  const body = reqOrBody && reqOrBody.body && typeof reqOrBody.body === 'object'
    ? reqOrBody.body
    : (reqOrBody && typeof reqOrBody === 'object' ? reqOrBody : {});
  // LabPlate default: Deutsch (HealthScore-/Coach-Badges)
  return normalizeLang(body.lang || body.language || 'de');
}

module.exports = {
  LANGS: LANGS,
  MESSAGES: M,
  normalizeLang: normalizeLang,
  t: t,
  langFromReq: langFromReq,
};
