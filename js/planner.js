/**
 * Pure meal-planner logic: recipe parsing, search, and the shopping list.
 * The browser UI and the tests both use this file.
 */

export const MISSING_INGREDIENTS = "Ingredients haven't been added yet";

export const DAYS = [
  { id: "mon", label: "Monday", short: "Mon" },
  { id: "tue", label: "Tuesday", short: "Tue" },
  { id: "wed", label: "Wednesday", short: "Wed" },
  { id: "thu", label: "Thursday", short: "Thu" },
  { id: "fri", label: "Friday", short: "Fri" },
  { id: "sat", label: "Saturday", short: "Sat" },
  { id: "sun", label: "Sunday", short: "Sun" },
];

export const AISLES = [
  { id: "meat", label: "Meat" },
  { id: "fish", label: "Fish" },
  { id: "veg", label: "Fruit and veg" },
  { id: "fresh-herbs", label: "Fresh herbs" },
  { id: "dairy", label: "Dairy" },
  { id: "bakery", label: "Bakery" },
  { id: "frozen", label: "Frozen" },
  { id: "tins", label: "Tins and dried" },
  { id: "cupboard", label: "Cupboard" },
  { id: "sauces", label: "Sauces and jars" },
  { id: "herbs", label: "Herbs and spices" },
  { id: "other", label: "Other" },
];

/**
 * Supermarket aisle for each ingredient currently in the sheet.
 * Fresh herbs stay on the list. Dried herbs and spices live in `herbs`
 * so the shopping toggle can hide them. Anything new falls through to Other.
 */
const AISLE_ITEMS = {
  meat: [
    "bacon",
    "beef mince",
    "chicken",
    "chicken thighs",
    "chorizo",
    "ham",
    "lamb",
    "meatballs",
    "pancetta",
    "pork",
    "sausages",
    "steak",
  ],
  fish: ["salmon", "smoked salmon", "tuna"],
  veg: [
    "avocado",
    "bean sprouts",
    "broccoli",
    "cabbage",
    "carrots",
    "cauliflower",
    "Charlotte or salad potatoes",
    "cherry tomatoes",
    "courgette",
    "garlic",
    "ginger",
    "green beans",
    "kale",
    "leeks",
    "lime",
    "Mediterranean veg",
    "mushrooms",
    "onions",
    "peppers",
    "potatoes",
    "red chillies",
    "red onions",
    "Romaine lettuce",
    "salad",
    "shallots",
    "small potatoes",
    "spinach",
    "spring onions",
    "sweet potatoes",
    "tenderstem broccoli",
    "tomatoes",
  ],
  "fresh-herbs": [
    "basil",
    "chives",
    "coriander",
    "parsley",
    "rosemary",
    "sage",
    "tarragon",
  ],
  dairy: [
    "Boursin",
    "butter",
    "cheddar",
    "cheese",
    "Chive Philadelphia",
    "cream",
    "cream cheese",
    "crème fraîche",
    "double cream",
    "eggs",
    "feta",
    "milk",
    "mozzarella",
    "Parmesan",
    "Red Leicester",
    "single cream",
    "sour cream",
    "tzatziki",
    "yogurt",
  ],
  bakery: ["bread", "flatbreads", "wraps"],
  frozen: [
    "chips",
    "frozen mixed veg",
    "peas",
    "petits pois",
    "sweet potato fries",
  ],
  tins: [
    "baked beans",
    "beef stock cube",
    "bulgur wheat",
    "chicken stock",
    "coconut milk",
    "gnocchi",
    "Mexican rice",
    "noodles",
    "orzo",
    "pasta",
    "red lentils",
    "rice",
    "risotto or paella rice",
    "spaghetti",
    "sweetcorn",
    "tinned tomatoes",
    "tomato purée",
    "veg stock",
  ],
  cupboard: [
    "apple juice",
    "balsamic vinegar",
    "breadcrumbs",
    "brown sugar",
    "cider vinegar",
    "cornflour",
    "ground almonds",
    "honey",
    "lemon juice",
    "nachos",
    "oil spray",
    "olive oil",
    "rice wine vinegar",
    "sesame seeds",
    "spirit vinegar",
    "sugar",
    "white wine",
  ],
  sauces: [
    "BBQ sauce",
    "curry sauce",
    "gravy",
    "guacamole",
    "jalapeños",
    "ketchup",
    "lazy garlic",
    "mango chutney",
    "mayonnaise",
    "mustard",
    "pesto",
    "salsa",
    "soy sauce",
    "sun-dried tomato pesto",
    "sun-dried tomatoes",
    "sweet chilli sauce",
    "Worcestershire sauce",
  ],
  herbs: [
    "bay leaves",
    "black pepper",
    "Cajun seasoning",
    "chilli powder",
    "cinnamon",
    "crushed chillies",
    "cumin",
    "garlic granules",
    "garlic powder",
    "garlic seasoning",
    "ground coriander",
    "ground ginger",
    "gyros seasoning",
    "Mayflower curry powder",
    "mixed herbs",
    "onion powder",
    "oregano",
    "paprika",
    "red pepper flakes",
    "salt",
    "smoked paprika",
    "turmeric",
  ],
};

const ALIASES = {
  yoghurt: "yogurt",
};

const aisleByKey = new Map();
for (const [aisle, items] of Object.entries(AISLE_ITEMS)) {
  for (const item of items) {
    const key = normaliseKey(item);
    if (aisleByKey.has(key)) {
      throw new Error(`Ingredient listed twice in the aisle map: ${item}`);
    }
    aisleByKey.set(key, aisle);
  }
}

export function normaliseKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function displayName(raw) {
  const trimmed = String(raw).trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.charAt(0).toLocaleUpperCase("en-GB") + trimmed.slice(1);
  }
  return trimmed;
}

export function aisleFor(raw) {
  const normalised = normaliseKey(raw);
  const key = ALIASES[normalised] || normalised;
  return aisleByKey.get(key) || "other";
}

export function emptyWeek() {
  return {
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
    sat: "",
    sun: "",
  };
}

export function defaultWeek() {
  return {
    mon: "Chicken and chorizo paella",
    tue: "Chicken and chorizo pasta in a creamy pesto sauce",
    wed: "Spanish chicken",
    thu: "Potato and leek soup",
    fri: "",
    sat: "",
    sun: "",
  };
}

/** Keep a saved week usable even if a day is missing. Returns null if there is no saved object. */
export function coerceWeek(value) {
  if (!value || typeof value !== "object") return null;
  const week = emptyWeek();
  for (const day of DAYS) {
    week[day.id] = typeof value[day.id] === "string" ? value[day.id] : "";
  }
  return week;
}

/**
 * Directory URL for the app, with a trailing slash.
 * Works at the site root and under /Meal-planner/ on GitHub Pages,
 * whether or not index.html is in the address bar.
 */
export function resolveAppBase(href) {
  const url = new URL(href);
  let path = url.pathname;
  if (!path.endsWith("/")) {
    const last = path.split("/").pop() || "";
    if (last.includes(".")) {
      path = path.slice(0, path.lastIndexOf("/") + 1);
    } else {
      path += "/";
    }
  }
  return new URL(path, url.origin).href;
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function splitList(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Ingredients typed in the form.
 * Several lines stay as one ingredient each, so "1 onion, finely chopped" is kept whole.
 * A single line with no line breaks is split on commas.
 */
export function parseIngredientText(value) {
  const text = String(value).replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const parts = text.includes("\n") ? text.split("\n") : text.split(",");
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function createRecipeId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `local:${random}`;
}

/** Stable id for a dinner that came from recipes.csv. It stays put when the file is updated, as long as the recipe name in the sheet does not change. */
export function tagBaseRecipes(recipes) {
  const seen = new Map();
  return recipes.map((recipe) => {
    const count = (seen.get(recipe.name) || 0) + 1;
    seen.set(recipe.name, count);
    const id = count === 1 ? `csv:${recipe.name}` : `csv:${recipe.name}#${count}`;
    return { ...recipe, id };
  });
}

export function emptyOverlay() {
  return { added: [], edited: {}, deleted: [] };
}

function cleanRecipeFields(recipe, id) {
  if (!recipe || typeof recipe !== "object") return null;
  const name = String(recipe.name || "").trim();
  if (!name) return null;
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => String(item).trim()).filter(Boolean)
    : parseIngredientText(recipe.ingredients || "");
  const optional = Array.isArray(recipe.optional)
    ? recipe.optional.map((item) => String(item).trim()).filter(Boolean)
    : parseIngredientText(recipe.optional || "");
  return {
    id,
    name,
    whose: String(recipe.whose || "").trim(),
    ingredients,
    optional,
    notes: String(recipe.notes || "").trim(),
  };
}

export function normaliseOverlay(value) {
  const overlay = emptyOverlay();
  if (!value || typeof value !== "object") return overlay;
  if (Array.isArray(value.added)) {
    for (const recipe of value.added) {
      const id = recipe && typeof recipe.id === "string" ? recipe.id : "";
      if (!id || id.startsWith("csv:")) continue;
      const clean = cleanRecipeFields(recipe, id);
      if (clean) overlay.added.push(clean);
    }
  }
  if (value.edited && typeof value.edited === "object") {
    for (const [id, recipe] of Object.entries(value.edited)) {
      if (!id) continue;
      const clean = cleanRecipeFields(recipe, id);
      if (clean) overlay.edited[id] = clean;
    }
  }
  if (Array.isArray(value.deleted)) {
    overlay.deleted = [...new Set(value.deleted.filter((id) => typeof id === "string" && id))];
  }
  return overlay;
}

/**
 * Phone edits sit on top of recipes.csv.
 * Added recipes come first, then the sheet, with edits applied and deletions removed.
 * An edit whose sheet row has disappeared is kept, so a file update does not throw away her work.
 */
export function applyRecipeOverlay(baseRecipes, overlay) {
  const clean = normaliseOverlay(overlay);
  const deleted = new Set(clean.deleted);
  const result = [];
  const seen = new Set();
  for (const recipe of clean.added) {
    if (deleted.has(recipe.id) || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    result.push({ ...recipe });
  }
  for (const recipe of baseRecipes) {
    if (!recipe.id || deleted.has(recipe.id) || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    const edit = clean.edited[recipe.id];
    result.push(edit ? { ...edit, id: recipe.id } : { ...recipe });
  }
  for (const [id, edit] of Object.entries(clean.edited)) {
    if (seen.has(id) || deleted.has(id)) continue;
    seen.add(id);
    result.push({ ...edit, id });
  }
  return result;
}

function listsEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function sameContent(left, right) {
  return left.name === right.name
    && left.whose === right.whose
    && left.notes === right.notes
    && listsEqual(left.ingredients, right.ingredients)
    && listsEqual(left.optional, right.optional);
}

/**
 * Turn a full backup into an overlay against the current sheet.
 * Rows are matched by recipe name. Renamed dinners become new recipes, and sheet dinners missing from the file are marked deleted.
 */
export function overlayFromBackup(baseRecipes, backupRecipes) {
  const remaining = new Map();
  for (const recipe of baseRecipes) {
    const list = remaining.get(recipe.name) || [];
    list.push(recipe);
    remaining.set(recipe.name, list);
  }
  const added = [];
  const edited = {};
  const used = new Set();
  for (const row of backupRecipes) {
    const pool = (remaining.get(row.name) || []).filter((recipe) => !used.has(recipe.id));
    if (pool.length === 0) {
      added.push({
        id: createRecipeId(),
        name: row.name,
        whose: row.whose,
        ingredients: row.ingredients.slice(),
        optional: row.optional.slice(),
        notes: row.notes,
      });
      continue;
    }
    const base = pool[0];
    used.add(base.id);
    if (!sameContent(base, row)) {
      edited[base.id] = {
        id: base.id,
        name: row.name,
        whose: row.whose,
        ingredients: row.ingredients.slice(),
        optional: row.optional.slice(),
        notes: row.notes,
      };
    }
  }
  const deleted = baseRecipes.filter((recipe) => !used.has(recipe.id)).map((recipe) => recipe.id);
  return { added, edited, deleted };
}

export function linkWeek(week, recipes) {
  const out = emptyWeek();
  const source = week && typeof week === "object" ? week : {};
  for (const day of DAYS) {
    const value = String(source[day.id] || "").trim();
    if (!value) continue;
    const byId = recipes.find((recipe) => recipe.id === value);
    if (byId) {
      out[day.id] = byId.id;
      continue;
    }
    const named = recipes.filter((recipe) => recipe.name === value);
    if (named.length === 1) {
      out[day.id] = named[0].id;
      continue;
    }
    if (named.length > 1) continue;
    const sheetId = `csv:${value}`;
    const fromSheet = recipes.filter((recipe) => recipe.id === sheetId || (recipe.id || "").startsWith(`${sheetId}#`));
    if (fromSheet.length === 1) out[day.id] = fromSheet[0].id;
  }
  return out;
}

/** Keep a planned dinner when its id changed but the name is still in the list (for example after restoring a backup). */
export function relinkWeek(week, previousRecipes, nextRecipes) {
  const linked = linkWeek(week, nextRecipes);
  const previousById = new Map(previousRecipes.map((recipe) => [recipe.id, recipe]));
  for (const day of DAYS) {
    if (linked[day.id]) continue;
    const previous = previousById.get(week?.[day.id]);
    if (!previous) continue;
    const matches = nextRecipes.filter((recipe) => recipe.name === previous.name);
    if (matches.length === 1) linked[day.id] = matches[0].id;
  }
  return linked;
}

export function clearPlannedRecipe(week, id) {
  const next = { ...emptyWeek(), ...(week || {}) };
  for (const day of DAYS) {
    if (next[day.id] === id) next[day.id] = "";
  }
  return next;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Full recipe list in the same columns as recipes.csv. */
export function recipesToCsv(recipes) {
  const lines = [["Recipe", "Whose recipe", "Ingredients", "Optional extras", "Notes"].join(",")];
  for (const recipe of recipes) {
    lines.push([
      recipe.name,
      recipe.whose || "",
      (recipe.ingredients || []).join(", "),
      (recipe.optional || []).join(", "),
      recipe.notes || "",
    ].map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function lookupRecipe(recipes, token) {
  const byId = recipes.find((recipe) => recipe.id && recipe.id === token);
  if (byId) return byId;
  return recipes.find((recipe) => recipe.name === token) || null;
}

export function parseRecipes(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim());
  const column = (name) => {
    const index = header.indexOf(name);
    if (index === -1) {
      throw new Error(`Recipes file is missing the “${name}” column.`);
    }
    return index;
  };
  const nameCol = column("Recipe");
  const whoseCol = column("Whose recipe");
  const ingredientCol = column("Ingredients");
  const optionalCol = column("Optional extras");
  const notesCol = column("Notes");

  return rows.slice(1).flatMap((cells) => {
    const name = (cells[nameCol] || "").trim();
    if (!name) return [];
    return [
      {
        name,
        whose: (cells[whoseCol] || "").trim(),
        ingredients: splitList(cells[ingredientCol] || ""),
        optional: splitList(cells[optionalCol] || ""),
        notes: (cells[notesCol] || "").trim(),
      },
    ];
  });
}

/**
 * Case-insensitive search. Every word must appear somewhere in the chosen fields.
 * `fields` is a list of recipe keys, so the week plan can ignore notes.
 */
export function filterRecipes(recipes, query, fields) {
  const tokens = String(query)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return recipes.slice();
  return recipes.filter((recipe) => {
    const haystack = fields
      .map((field) => {
        const value = recipe[field];
        if (Array.isArray(value)) return value.join(" ");
        return value || "";
      })
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function mealGroups(meals) {
  const groups = [];
  for (const meal of meals) {
    let group = groups.find((entry) => entry.name === meal.name);
    if (!group) {
      group = { name: meal.name, days: [], count: 0 };
      groups.push(group);
    }
    if (!group.days.includes(meal.day)) {
      group.days.push(meal.day);
      group.count += 1;
    }
  }
  return groups;
}

/**
 * Build the shopping list for a week.
 * options.includeOptional adds the Optional extras column.
 * options.includeSpices adds the Herbs and spices aisle. Fresh herbs always stay.
 * The same ingredient from several meals becomes one line.
 * A meal planned on more than one day is marked x2, x3, and so on.
 */
export function buildShoppingList(recipes, week, options = {}) {
  const includeOptional = options.includeOptional === true;
  const includeSpices = options.includeSpices === true;
  const items = new Map();
  const notices = [];

  for (const day of DAYS) {
    const token = (week && week[day.id] ? week[day.id] : "").trim();
    if (!token) continue;
    const recipe = lookupRecipe(recipes, token);
    if (!recipe) {
      notices.push({
        dayId: day.id,
        dayLabel: day.label,
        recipe: token,
        message: "This recipe isn't in the list any more.",
      });
      continue;
    }
    if (recipe.ingredients.length === 0 && recipe.optional.length === 0) {
      notices.push({
        dayId: day.id,
        dayLabel: day.label,
        recipe: recipe.name,
        message: MISSING_INGREDIENTS,
      });
    }

    const parts = includeOptional
      ? recipe.ingredients.concat(recipe.optional)
      : recipe.ingredients.slice();
    const seenInMeal = new Set();
    for (const raw of parts) {
      const key = ALIASES[normaliseKey(raw)] || normaliseKey(raw);
      if (!key || seenInMeal.has(key)) continue;
      seenInMeal.add(key);
      const aisle = aisleFor(raw);
      if (aisle === "herbs" && !includeSpices) continue;
      if (!items.has(key)) {
        items.set(key, {
          key,
          name: displayName(raw),
          aisle,
          meals: [],
        });
      }
      items.get(key).meals.push({ name: recipe.name, day: day.short });
    }
  }

  const grouped = AISLES.map((aisle) => ({
    id: aisle.id,
    label: aisle.label,
    items: [],
  }));
  const byAisle = new Map(grouped.map((aisle) => [aisle.id, aisle]));

  for (const item of items.values()) {
    const aisle = byAisle.get(item.aisle) || byAisle.get("other");
    aisle.items.push({
      key: item.key,
      name: item.name,
      aisle: aisle.id,
      meals: mealGroups(item.meals),
    });
  }

  for (const aisle of grouped) {
    aisle.items.sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  }

  const aisles = grouped.filter((aisle) => aisle.items.length > 0);
  const itemCount = aisles.reduce((sum, aisle) => sum + aisle.items.length, 0);
  return { aisles, notices, itemCount };
}

export function formatMealGroup(group) {
  const days = group.days.join(", ");
  if (group.count > 1) return `${days} · ${group.name} x${group.count}`;
  return `${days} · ${group.name}`;
}
