"""
Deterministischer Rezept-Validator (v2.0 — passend zu Prompt v9.2)
====================================================================
Prüft das vom LLM per JSON-Schema (System-Prompt v9.2) gelieferte Rezept
NICHT per Prompt-Vertrauen, sondern per Code — unabhängig vom Sprachmodell.
Pipeline: LLM generiert JSON -> validate_recipe_v2() prüft -> bei Verstoß:
Regenerierung anstoßen oder Fehler melden. Kein [SELF-CHECK]-Freitext mehr
nötig, weil das v9.2-Schema Mengen nur noch als {ingredient_id}-Platzhalter
in `content`/`garnish` erlaubt -- validate_recipe_v2() prüft zusätzlich,
dass dort wirklich KEINE freien Zahlen mehr vorkommen (Regel 3/6/7).

validate_recipe() (v1, unten) bleibt als Fallback für das alte
Markdown-Self-Check-Format erhalten, falls ihr Legacy-Outputs noch prüfen
müsst.
"""

from dataclasses import dataclass, field
import re


@dataclass
class ValidationResult:
    ok: bool
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def add_error(self, msg: str):
        self.ok = False
        self.errors.append(msg)

    def add_warning(self, msg: str):
        self.warnings.append(msg)


def validate_kcal_formula(protein_g: float, fat_g: float, netto_kh_g: float,
                           ballaststoffe_g: float, kcal_declared: float,
                           tolerance_pct: float = 10.0) -> tuple[bool, float, float]:
    """Regel 10: Kalorien-Plausibilität. 4-4-9-2 kcal/g Formel.

    Near-zero Sonderregel: relative %-Abweichung ist bei kcal_calc≈0 instabil
    (Division durch 0 → fälschlich 100%, z. B. 0 vs. 0 bei magere Brühe).
    Wenn BEIDE Seiten <20 kcal liegen, absolut ±15 kcal statt ±10% relativ.
    """
    kcal_calc = protein_g * 4 + netto_kh_g * 4 + fat_g * 9 + ballaststoffe_g * 2
    if kcal_calc < 20 and float(kcal_declared) < 20:
        abs_diff = abs(kcal_calc - float(kcal_declared))
        abweichung_pct = 0.0 if kcal_calc == 0 else (abs_diff / kcal_calc) * 100
        return abs_diff <= 15, kcal_calc, abweichung_pct
    if kcal_calc == 0:
        return False, kcal_calc, 100.0
    abweichung_pct = abs(kcal_calc - kcal_declared) / kcal_calc * 100
    return abweichung_pct <= tolerance_pct, kcal_calc, abweichung_pct


def validate_max_protein_sources(ingredients: list, protein_source_keywords: list = None) -> tuple[bool, list]:
    """Regel 4: max. 2 Haupt-Proteinquellen (Keyword-Gegenprobe).

    Käse/Nüsse/Samen zählen nur ab ≥30 g — Topping-Parmesan o. Ä. nicht.
    """
    core = [
        "hähnchen", "haehnchen", "huhn", "pute", "rind", "schwein", "lachs", "thunfisch", "fisch",
        "ei", "eier", "tofu", "quark", "hüttenkäse", "huettenkaese", "linsen", "kichererbsen",
        "bohnen", "protein", "whey", "seitan", "tempeh", "garnelen", "krabben", "truthahn",
        "speck", "joghurt", "yogurt",
    ]
    substantial = [
        "käse", "kaese", "gouda", "cheddar", "mozzarella", "parmesan", "feta", "ricotta",
        "camembert", "frischkäse", "frischkaese", "mascarpone", "schmand",
        "nüsse", "nusse", "nuss", "mandeln", "mandel", "cashew", "walnüsse", "walnuss",
        "erdnüsse", "erdnuss", "haselnuss",
        "sonnenblumenkerne", "kürbiskerne", "kuerbiskerne", "chiasamen", "leinsamen",
        "pistazie", "pistazien", "pecan",
    ]
    substantial_g = 30
    if protein_source_keywords is not None:
        keywords_core = protein_source_keywords
        keywords_sub = []
    else:
        keywords_core = core
        keywords_sub = substantial

    def amount_g(ing: dict) -> float:
        try:
            amount = float(ing.get("amount") or 0)
        except (TypeError, ValueError):
            return 0.0
        unit = str(ing.get("unit") or "").lower()
        if unit in ("prise", "messerspitze"):
            return 0.0
        if unit == "stk":
            return amount * 60.0
        return amount

    def fat_like(name_lower: str) -> bool:
        return bool(re.search(r"[oö]l\b|oel\b|milch\b|butter\b|sauce\b|soße\b|sosse\b|dressing\b", name_lower))

    def matches(name_lower: str, kw: str) -> bool:
        if kw not in name_lower:
            return False
        if kw in ("ei", "eier"):
            if not re.search(r"(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)", name_lower):
                return False
        if re.search(r"nuss|nüsse|nusse|mandel|cashew|erdnuss|haselnuss|walnuss|chia|lein", kw) and fat_like(name_lower):
            return False
        return True

    found = []
    for ing in ingredients:
        name = ing.get("name") or ""
        name_lower = name.lower()
        if "eiweiss" in name_lower or "eiweiß" in name_lower:
            continue
        hit = any(matches(name_lower, kw) for kw in keywords_core)
        if not hit:
            for kw in keywords_sub:
                if matches(name_lower, kw) and amount_g(ing) >= substantial_g:
                    hit = True
                    break
        if hit and name not in found:
            found.append(name)
    return len(found) <= 2, found


def validate_ingredient_drift(ingredients: list, step_texts: list) -> tuple[bool, list]:
    """
    Regel 3 & 7: Prüft, ob im Zubereitungstext genannte Mengen zur
    Zutatenliste passen. Rein heuristisch (Regex auf Zahl+Einheit) --
    zuverlässiger ist der Schema-Zwang (siehe Moduldoku oben).
    """
    problems = []
    unit_pattern = re.compile(r"(\d+[.,]?\d*)\s*(ml|g|kg|l|el|tl)\b", re.IGNORECASE)
    full_text = " ".join(step_texts).lower()

    for ing in ingredients:
        name = ing.get("name", "")
        amount = ing.get("amount")
        unit = ing.get("unit", "")
        if amount is None or not unit:
            continue
        # Suche alle Zahl+Einheit-Kombinationen im Text in der Nähe des Zutatennamens
        name_keywords = [w for w in name.lower().split() if len(w) > 3]
        for kw in name_keywords:
            idx = full_text.find(kw)
            if idx == -1:
                continue
            window = full_text[max(0, idx - 60):idx + 60]
            matches = unit_pattern.findall(window)
            for val_str, found_unit in matches:
                val = float(val_str.replace(",", "."))
                if found_unit.lower() == unit.lower() and abs(val) > float(amount) + 0.01:
                    problems.append(
                        f"'{name}': Zutatenliste={amount}{unit}, aber Text nennt {val}{found_unit} "
                        f"(im Kontext: '...{window.strip()}...')"
                    )
    return len(problems) == 0, problems


def validate_garnish_in_ingredient_list(garnish_text: str, ingredients: list) -> tuple[bool, list]:
    """Regel 7: Jede Garnitur-Zutat muss in der Zutatenliste stehen."""
    ingredient_names = [ing.get("name", "").lower() for ing in ingredients]
    missing = []
    # sehr simple Heuristik: signifikante Wörter aus der Garnitur suchen
    words = [w.strip(".,!") for w in garnish_text.lower().split() if len(w) > 4]
    for w in words:
        if not any(w in name for name in ingredient_names):
            missing.append(w)
    return len(missing) == 0, missing


def validate_egg_numerus(ingredients: list, step_texts: list) -> tuple[bool, str]:
    """Regel 6: Singular/Plural von 'Ei' muss zur Zutatenliste passen."""
    egg_count = 0
    for ing in ingredients:
        if "ei" in ing.get("name", "").lower() and "eiweiß" not in ing.get("name", "").lower():
            m = re.search(r"(\d+)", ing.get("name", "") + " " + str(ing.get("amount", "")))
            if m:
                egg_count = int(m.group(1))

    full_text = " ".join(step_texts).lower()
    has_plural = "eier" in full_text
    has_singular = re.search(r"\bdas ei\b|\bdem ei\b|\bdas ei,", full_text) is not None

    if egg_count == 1 and has_plural:
        return False, f"Zutatenliste nennt 1 Ei, aber Text verwendet Plural 'Eier'"
    if egg_count > 1 and has_singular and not has_plural:
        return False, f"Zutatenliste nennt {egg_count} Eier, aber Text verwendet nur Singular 'das Ei'"
    return True, ""


def validate_recipe(recipe: dict) -> ValidationResult:
    """
    Haupteinstiegspunkt. Erwartet ein Dict mit den Feldern:
    {
        "nutrition": {"kcal": ..., "protein_g": ..., "fat_g": ...,
                       "netto_kh_g": ..., "ballaststoffe_g": ...},
        "ingredients": [{"name": ..., "amount": ..., "unit": ...}, ...],
        "steps": ["...", "...", ...],
        "garnish": "...",
        "diet_labels": ["keto", ...]  # optional
    }
    """
    result = ValidationResult(ok=True)
    nutrition = recipe.get("nutrition", {})
    ingredients = recipe.get("ingredients", [])
    steps = recipe.get("steps", [])
    garnish = recipe.get("garnish", "")

    # Regel 10: Kalorien-Formel
    ok, kcal_calc, abw = validate_kcal_formula(
        nutrition.get("protein_g", 0), nutrition.get("fat_g", 0),
        nutrition.get("netto_kh_g", 0), nutrition.get("ballaststoffe_g", 0),
        nutrition.get("kcal", 0)
    )
    if not ok:
        result.add_error(
            f"Kalorien-Formel-Abweichung: berechnet {kcal_calc:.0f} kcal vs. "
            f"deklariert {nutrition.get('kcal', 0)} kcal ({abw:.1f}% Abweichung, Limit 10%)"
        )

    # Regel 4: max. 2 Proteinquellen
    ok, sources = validate_max_protein_sources(ingredients)
    if not ok:
        result.add_error(f"Mehr als 2 Proteinquellen gefunden: {sources}")

    # Regel 3/7: Mengen-Drift Text vs. Liste
    ok, problems = validate_ingredient_drift(ingredients, steps)
    if not ok:
        for p in problems:
            result.add_error(f"Mengen-Drift: {p}")

    # Regel 7: Garnitur muss gelistet sein
    if garnish:
        ok, missing = validate_garnish_in_ingredient_list(garnish, ingredients)
        if not ok:
            result.add_warning(f"Garnitur enthält evtl. ungelistete Begriffe: {missing} (Heuristik, manuell prüfen)")

    # Regel 6: Ei-Numerus
    ok, msg = validate_egg_numerus(ingredients, steps)
    if not ok:
        result.add_error(msg)

    # Regel 5: Keto-Label-Check
    if "keto" in [d.lower() for d in recipe.get("diet_labels", [])]:
        if nutrition.get("netto_kh_g", 999) >= 10:
            result.add_error(
                f"Keto-Label vergeben, aber Netto-KH={nutrition.get('netto_kh_g')}g >= 10g"
            )

    return result


def resolve_placeholders(text: str, ingredients_by_id: dict) -> str:
    """Ersetzt {0001}-Platzhalter durch 'amount unit name', wie es das
    Backend beim Rendern für den Nutzer tun würde."""
    def repl(m):
        ing = ingredients_by_id.get(m.group(1))
        if not ing:
            return m.group(0)
        amount = ing.get("amount")
        unit = ing.get("unit") or ""
        if amount is None:
            return ing.get("name", "")
        return f"{amount}{unit} {ing.get('name', '')}".strip()
    return re.sub(r"\{(\d{4})\}", repl, text)


def validate_no_free_numbers_in_prose(steps: list, garnish: str, chef_analysis: str,
                                       ingredients: list) -> tuple[bool, list]:
    """
    Regel 3/6/7 (v9.2): content/garnish/chef_analysis dürfen KEINE eigenen
    Zahlen für Zutatenmengen enthalten -- nur {ingredient_id}-Platzhalter.
    Erlaubt sind Zeit- und Temperaturangaben, die separat als Freitext ok
    sind, solange sie zu time_min/stove_level (eigene Felder) passen und
    keine Einheit wie g/ml/kg/l/EL/TL tragen.
    """
    problems = []
    unit_pattern = re.compile(r"\d+[.,]?\d*\s*(ml|g|kg|l|el|tl)\b", re.IGNORECASE)

    for i, step in enumerate(steps):
        content = step.get("content", "")
        if unit_pattern.search(content):
            problems.append(
                f"Step {i+1} ('{step.get('title')}'): enthält eine freie Mengen-Zahl im "
                f"content-Text statt eines {{ingredient_id}}-Platzhalters: '{content}'"
            )

    if garnish and unit_pattern.search(garnish):
        problems.append(f"garnish enthält eine freie Mengen-Zahl statt Platzhalter: '{garnish}'")

    if chef_analysis and re.search(r"\d+[.,]?\d*\s*(g|kcal|kg)\b", chef_analysis, re.IGNORECASE):
        problems.append(
            f"chef_analysis enthält eine eigene Zahl statt Verweis auf 'nutrition': '{chef_analysis}'"
        )

    # Prüfe, dass jede referenzierte {id} auch wirklich existiert (Regel 7)
    valid_ids = {ing["id"] for ing in ingredients}
    all_text = " ".join(s.get("content", "") for s in steps) + " " + (garnish or "")
    used_ids = set(re.findall(r"\{(\d{4})\}", all_text))
    unknown_ids = used_ids - valid_ids
    if unknown_ids:
        problems.append(f"Referenzierte ingredient_ids ohne Zutateneintrag: {unknown_ids}")

    unused_ids = valid_ids - used_ids
    if unused_ids:
        problems.append(f"Zutaten nie referenziert (evtl. überflüssig): {unused_ids}")

    return len(problems) == 0, problems


def validate_recipe_v2(recipe: dict) -> ValidationResult:
    """
    Haupteinstiegspunkt für das v9.2-JSON-Schema. Erwartet exakt die
    Struktur aus dem System-Prompt v9.2 (title, prep_time_min, nutrition,
    diet_labels, ingredients[{id,name,amount,unit,protein_source}],
    steps[{title,content,stove_level,time_min}], garnish, chef_analysis).
    """
    result = ValidationResult(ok=True)
    nutrition = recipe.get("nutrition", {})
    ingredients = recipe.get("ingredients", [])
    steps = recipe.get("steps", [])
    garnish = recipe.get("garnish", "")
    chef_analysis = recipe.get("chef_analysis", "")

    # Regel 10: Kalorien-Formel
    ok, kcal_calc, abw = validate_kcal_formula(
        nutrition.get("protein_g", 0), nutrition.get("fat_g", 0),
        nutrition.get("netto_kh_g", 0), nutrition.get("ballaststoffe_g", 0),
        nutrition.get("kcal", 0)
    )
    if not ok:
        result.add_error(
            f"Kalorien-Formel-Abweichung: berechnet {kcal_calc:.0f} kcal vs. "
            f"deklariert {nutrition.get('kcal', 0)} kcal ({abw:.1f}% Abweichung, Limit 10%)"
        )

    # Regel 4: max. 2 Proteinquellen (jetzt strukturiert über protein_source-Flag)
    protein_sources = [ing["name"] for ing in ingredients if ing.get("protein_source")]
    if len(protein_sources) > 2:
        result.add_error(f"Mehr als 2 Proteinquellen (protein_source=true): {protein_sources}")

    # Regel 3/6/7: keine freien Zahlen in Prosa, alle {id} gültig
    ok, problems = validate_no_free_numbers_in_prose(steps, garnish, chef_analysis, ingredients)
    for p in problems:
        result.add_error(p)

    # Regel 11: Zeit-Summe
    step_time_sum = sum(s.get("time_min", 0) or 0 for s in steps)
    prep_time = recipe.get("prep_time_min", 0)
    if prep_time and abs(step_time_sum - prep_time) > max(5, prep_time * 0.3):
        result.add_warning(
            f"Zeit-Abweichung: Summe der Step-Zeiten={step_time_sum} min, "
            f"prep_time_min={prep_time} (inkl. Mise en Place ggf. nicht in steps erfasst)"
        )

    # Regel 5: Keto-Label
    if "keto" in [d.lower() for d in recipe.get("diet_labels", [])]:
        if nutrition.get("netto_kh_g", 999) >= 10:
            result.add_error(
                f"Keto-Label vergeben, aber Netto-KH={nutrition.get('netto_kh_g')}g >= 10g"
            )

    # Regel 9: Salz/Pfeffer nicht in Gramm (nicht „ungesalzen“)
    for ing in ingredients:
        name_lower = ing.get("name", "").lower()
        if re.search(r"ungesalz|salzarm|salzfrei|ohne\s+salz", name_lower):
            continue
        is_seasoning = bool(
            re.search(r"(^|[^a-zäöüß])pfeffer([^a-zäöüß]|$)", name_lower)
            or re.search(r"(^|[^a-zäöüß])(meer)?salz([^a-zäöüß]|$)", name_lower)
        )
        if is_seasoning and ing.get("unit") == "g":
            result.add_error(f"'{ing.get('name')}' ist in Gramm angegeben statt Prise/Messerspitze")

    return result


if __name__ == "__main__":
    print("=" * 70)
    print("TEST 1: Legacy-Markdown-Self-Check-Format (v1, Fallback)")
    print("=" * 70)
    # Beispiel: das fehlerhafte Rezept aus dem Test-Case (Ei-Spinat-Pfanne)
    beispiel_rezept = {
        "nutrition": {"kcal": 286, "protein_g": 32, "fat_g": 17,
                       "netto_kh_g": 1, "ballaststoffe_g": 1},
        "ingredients": [
            {"name": "Hähnchenbrustfilet", "amount": 75, "unit": "g"},
            {"name": "Eier (Größe M)", "amount": 2, "unit": None},
            {"name": "Spinat frisch", "amount": 15, "unit": "g"},
            {"name": "Olivenöl", "amount": 5, "unit": "ml"},
            {"name": "Pinienkerne", "amount": 5, "unit": "g"},
        ],
        "steps": [
            "Hähnchenbrust in Streifen schneiden, Eier verquirlen.",
            "Olivenöl in der Pfanne erhitzen, Hähnchen 6 Minuten braten.",
            "Eier über das Hähnchen gießen, stocken lassen.",
            "Spinat unterheben.",
        ],
        "garnish": "Geröstete Pinienkerne",
        "diet_labels": [],
    }

    result = validate_recipe(beispiel_rezept)
    print("VALID:", result.ok)
    print("\nFEHLER:")
    for e in result.errors:
        print(" -", e)
    print("\nWARNUNGEN:")
    for w in result.warnings:
        print(" -", w)

    print("\n" + "=" * 70)
    print("TEST 2: v9.2 JSON-Schema — korrektes Beispiel")
    print("=" * 70)
    gutes_beispiel = {
        "title": "Schnelles High-Protein Pfannen-Hähnchen mit Ei-Spinat",
        "prep_time_min": 20,
        "nutrition": {"kcal": 460, "protein_g": 55, "fat_g": 25, "netto_kh_g": 3, "ballaststoffe_g": 1},
        "diet_labels": ["high_protein"],
        "target_deviation_note": None,
        "ingredients": [
            {"id": "0001", "name": "Hähnchenbrustfilet", "amount": 150, "unit": "g", "protein_source": True},
            {"id": "0002", "name": "Ei (Größe M, ca. 60 g)", "amount": 2, "unit": None, "protein_source": True},
            {"id": "0003", "name": "Spinat frisch", "amount": 30, "unit": "g", "protein_source": False},
            {"id": "0004", "name": "Olivenöl", "amount": 8, "unit": "ml", "protein_source": False},
            {"id": "0005", "name": "Pinienkerne", "amount": 5, "unit": "g", "protein_source": False},
            {"id": "0006", "name": "Salz", "amount": None, "unit": "prise", "protein_source": False},
        ],
        "steps": [
            {"title": "Mise en Place", "content": "{0001} in Streifen schneiden, {0002} verquirlen.",
             "stove_level": None, "time_min": 5},
            {"title": "Anbraten", "content": "{0004} erhitzen, {0001} goldbraun braten.",
             "stove_level": 6, "time_min": 6},
            {"title": "Ei & Spinat", "content": "{0002} dazugeben, stocken lassen, {0003} unterheben, mit {0006} würzen.",
             "stove_level": 4, "time_min": 3},
        ],
        "garnish": "Mit gerösteten {0005} bestreuen.",
        "chef_analysis": "Die Kombination aus {0001} und {0002} liefert eine hohe Proteinmenge bei wenig Kohlenhydraten, siehe nutrition.",
    }
    result2 = validate_recipe_v2(gutes_beispiel)
    print("VALID:", result2.ok)
    print("FEHLER:", result2.errors or "keine")
    print("WARNUNGEN:", result2.warnings or "keine")
    print("\nAufgelöster Step-Text zur Kontrolle:")
    ing_by_id = {i["id"]: i for i in gutes_beispiel["ingredients"]}
    for s in gutes_beispiel["steps"]:
        print(" -", resolve_placeholders(s["content"], ing_by_id))

    print("\n" + "=" * 70)
    print("TEST 3: v9.2 JSON-Schema — absichtlich kaputtes Beispiel (Drift)")
    print("=" * 70)
    kaputtes_beispiel = dict(gutes_beispiel)
    kaputtes_beispiel["steps"] = [
        {"title": "Anbraten", "content": "15 ml Olivenöl erhitzen, Hähnchen goldbraun braten.",
         "stove_level": 6, "time_min": 6},
    ]
    kaputtes_beispiel["chef_analysis"] = "Liefert ca. 64 g Protein und 30 g Fett pro Portion."
    result3 = validate_recipe_v2(kaputtes_beispiel)
    print("VALID:", result3.ok)
    print("FEHLER:")
    for e in result3.errors:
        print(" -", e)
