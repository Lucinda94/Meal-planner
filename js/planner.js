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
  const byName = new Map(recipes.map((recipe) => [recipe.name, recipe]));
  const items = new Map();
  const notices = [];

  for (const day of DAYS) {
    const name = (week && week[day.id] ? week[day.id] : "").trim();
    if (!name) continue;
    const recipe = byName.get(name);
    if (!recipe) {
      notices.push({
        dayId: day.id,
        dayLabel: day.label,
        recipe: name,
        message: "This recipe isn't in the list any more.",
      });
      continue;
    }
    if (recipe.ingredients.length === 0 && recipe.optional.length === 0) {
      notices.push({
        dayId: day.id,
        dayLabel: day.label,
        recipe: name,
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
      items.get(key).meals.push({ name, day: day.short });
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
