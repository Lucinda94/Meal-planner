import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AISLES,
  MISSING_INGREDIENTS,
  aisleFor,
  applyRecipeOverlay,
  buildShoppingList,
  clearPlannedRecipe,
  defaultWeek,
  emptyWeek,
  filterRecipes,
  formatMealGroup,
  linkWeek,
  overlayFromBackup,
  parseIngredientText,
  parseRecipes,
  recipesToCsv,
  relinkWeek,
  resolveAppBase,
  tagBaseRecipes,
} from "../js/planner.js";

const csv = readFileSync(new URL("../recipes.csv", import.meta.url), "utf8");
const recipes = parseRecipes(csv);

function findItem(list, key) {
  for (const aisle of list.aisles) {
    const item = aisle.items.find((entry) => entry.key === key);
    if (item) return item;
  }
  return null;
}

test("parses the sheet into 40 dinners", () => {
  assert.equal(recipes.length, 40);
  assert.equal(new Set(recipes.map((recipe) => recipe.name)).size, 40);
  const bake = recipes.find((recipe) => recipe.name === "Chicken, bacon and leek bake");
  assert.ok(bake);
  assert.equal(bake.whose, "Jessica");
  assert.ok(bake.ingredients.includes("chicken"));
  assert.deepEqual(bake.optional, ["sweetcorn", "peas"]);
});

test("Fajitas and Fajita salad have no ingredients", () => {
  for (const name of ["Fajitas", "Fajita salad with plain nachos"]) {
    const recipe = recipes.find((entry) => entry.name === name);
    assert.ok(recipe, name);
    assert.deepEqual(recipe.ingredients, []);
    assert.deepEqual(recipe.optional, []);
    assert.ok(recipe.notes);
  }
});

test("default week recipes exist", () => {
  const week = defaultWeek();
  for (const name of [week.mon, week.tue, week.wed, week.thu]) {
    assert.ok(recipes.some((recipe) => recipe.name === name), name);
  }
  assert.equal(week.fri, "");
  assert.equal(week.sat, "");
  assert.equal(week.sun, "");
});

test("week search matches name, whose recipe, and ingredients, not notes", () => {
  const fields = ["name", "whose", "ingredients"];
  assert.deepEqual(
    filterRecipes(recipes, "FAJITA", fields).map((recipe) => recipe.name),
    ["Fajitas", "Fajita salad with plain nachos"],
  );
  assert.deepEqual(
    filterRecipes(recipes, "gez", fields).map((recipe) => recipe.name),
    ["Spanish chicken"],
  );
  const salmon = filterRecipes(recipes, "Salmon", fields);
  assert.ok(salmon.length >= 3);
  assert.ok(salmon.every((recipe) => /salmon/i.test(`${recipe.name} ${recipe.ingredients.join(" ")}`)));
  const pesto = filterRecipes(recipes, "pesto pasta", fields);
  assert.ok(
    pesto.some((recipe) => recipe.name === "Chicken and chorizo pasta in a creamy pesto sauce"),
  );
  assert.equal(filterRecipes(recipes, "roasted", fields).length, 0);
  assert.equal(filterRecipes(recipes, "   ", fields).length, 40);
});

test("recipe browser can also search notes and optional extras", () => {
  const fields = ["name", "whose", "ingredients", "optional", "notes"];
  assert.ok(filterRecipes(recipes, "roasted tomatoes", fields).length >= 1);
  assert.ok(
    filterRecipes(recipes, "nachos", fields).some(
      (recipe) => recipe.name === "Fajita salad with plain nachos",
    ),
  );
});

test("every current ingredient has an aisle, and unknowns land in Other", () => {
  const seen = new Set();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients.concat(recipe.optional)) seen.add(item);
  }
  const other = [];
  for (const item of seen) {
    if (aisleFor(item) === "other") other.push(item);
  }
  assert.deepEqual(other, []);
  assert.equal(aisleFor("unicorn dust"), "other");
  assert.equal(aisleFor("Yoghurt"), "dairy");
  assert.equal(aisleFor("crème fraîche"), "dairy");
  assert.equal(aisleFor("jalapeños"), "sauces");
  assert.equal(aisleFor("paprika"), "herbs");
  assert.equal(aisleFor("parsley"), "fresh-herbs");
});

test("shopping list merges meals, hides spices and extras, and marks a repeated meal x2", () => {
  const list = buildShoppingList(recipes, defaultWeek(), {
    includeOptional: false,
    includeSpices: false,
  });
  const chicken = findItem(list, "chicken");
  assert.ok(chicken);
  assert.equal(chicken.meals.length, 4);
  assert.equal(formatMealGroup(chicken.meals[0]), "Mon · Chicken and chorizo paella");
  assert.equal(findItem(list, "paprika"), null);
  assert.equal(findItem(list, "mushrooms"), null);
  assert.ok(findItem(list, "parsley"));
  assert.ok(findItem(list, "pesto"));
  assert.ok(findItem(list, "yogurt"));
  assert.equal(list.notices.length, 0);

  const aisleIds = list.aisles.map((aisle) => aisle.id);
  const order = AISLES.map((aisle) => aisle.id);
  assert.deepEqual(aisleIds, order.filter((id) => aisleIds.includes(id)));

  const withExtras = buildShoppingList(recipes, defaultWeek(), {
    includeOptional: true,
    includeSpices: true,
  });
  assert.ok(findItem(withExtras, "mushrooms"));
  assert.equal(findItem(withExtras, "paprika").aisle, "herbs");
  const garlic = findItem(withExtras, "garlic");
  assert.ok(garlic.meals.some((group) => group.days.includes("Wed")));

  const repeated = emptyWeek();
  repeated.mon = "Chicken and chorizo paella";
  repeated.fri = "Chicken and chorizo paella";
  repeated.wed = "Fajitas";
  const doubled = buildShoppingList(recipes, repeated, {
    includeOptional: false,
    includeSpices: false,
  });
  const paellaChicken = findItem(doubled, "chicken");
  assert.equal(formatMealGroup(paellaChicken.meals[0]), "Mon, Fri · Chicken and chorizo paella x2");
  assert.equal(doubled.notices.length, 1);
  assert.equal(doubled.notices[0].message, MISSING_INGREDIENTS);
  assert.equal(doubled.notices[0].recipe, "Fajitas");
  assert.equal(doubled.notices[0].dayLabel, "Wednesday");
});

test("an empty week has an empty shopping list", () => {
  const list = buildShoppingList(recipes, emptyWeek(), {});
  assert.equal(list.itemCount, 0);
  assert.deepEqual(list.aisles, []);
  assert.deepEqual(list.notices, []);
});

test("app base keeps the GitHub Pages project path", () => {
  assert.equal(
    resolveAppBase("https://lucinda94.github.io/Meal-planner/"),
    "https://lucinda94.github.io/Meal-planner/",
  );
  assert.equal(
    resolveAppBase("https://lucinda94.github.io/Meal-planner"),
    "https://lucinda94.github.io/Meal-planner/",
  );
  assert.equal(
    resolveAppBase("https://lucinda94.github.io/Meal-planner/index.html"),
    "https://lucinda94.github.io/Meal-planner/",
  );
  assert.equal(resolveAppBase("http://127.0.0.1:8765/"), "http://127.0.0.1:8765/");
});

test("phone edits layer on top of the sheet and keep a stable id", () => {
  const base = tagBaseRecipes(recipes);
  const spanish = base.find((recipe) => recipe.name === "Spanish chicken");
  const overlay = {
    added: [{
      id: "local:test-supper",
      name: "Tomato rice",
      whose: "Lucinda",
      ingredients: ["rice", "dragon fruit"],
      optional: ["feta"],
      notes: "A new one.",
    }],
    edited: {
      [spanish.id]: {
        id: spanish.id,
        name: "Gez's Spanish chicken",
        whose: "Gez",
        ingredients: spanish.ingredients,
        optional: ["olives"],
        notes: spanish.notes,
      },
    },
    deleted: ["csv:Fajitas"],
  };
  const merged = applyRecipeOverlay(base, overlay);
  assert.equal(merged[0].name, "Tomato rice");
  assert.equal(merged.find((recipe) => recipe.name === "Fajitas"), undefined);
  const edited = merged.find((recipe) => recipe.id === spanish.id);
  assert.equal(edited.name, "Gez's Spanish chicken");
  assert.deepEqual(edited.optional, ["olives"]);
  assert.equal(base.find((recipe) => recipe.name === "Spanish chicken").name, "Spanish chicken");

  const week = linkWeek({ ...emptyWeek(), fri: "local:test-supper", mon: "Spanish chicken" }, merged);
  assert.equal(week.fri, "local:test-supper");
  assert.equal(week.mon, spanish.id);
  const cleared = clearPlannedRecipe(week, spanish.id);
  assert.equal(cleared.mon, "");
  assert.equal(cleared.fri, "local:test-supper");

  const list = buildShoppingList(merged, week, { includeOptional: false, includeSpices: false });
  const fruit = findItem(list, "dragon fruit");
  assert.equal(fruit.aisle, "other");
  assert.equal(formatMealGroup(fruit.meals[0]), "Fri · Tomato rice");
  const renamed = findItem(list, "chicken");
  assert.ok(renamed.meals.some((group) => group.name === "Gez's Spanish chicken"));
});

test("ingredient box accepts lines or commas, and a backup CSV round-trips", () => {
  assert.deepEqual(parseIngredientText(" chicken, chorizo \n pesto "), ["chicken", "chorizo", "pesto"]);
  const base = tagBaseRecipes(recipes);
  const csvText = recipesToCsv(base);
  const again = parseRecipes(csvText);
  assert.equal(again.length, base.length);
  assert.deepEqual(again.map((recipe) => recipe.name), base.map((recipe) => recipe.name));
  const bake = again.find((recipe) => recipe.name === "Chicken, bacon and leek bake");
  assert.equal(bake.whose, "Jessica");
  const bourbon = again.find((recipe) => recipe.name === "Bourbon chicken");
  assert.ok(bourbon.notes.includes(","));

  const backup = parseRecipes(csvText);
  const spanish = backup.find((recipe) => recipe.name === "Spanish chicken");
  spanish.notes = "Extra paprika.";
  backup.push({
    name: "Tomato rice",
    whose: "",
    ingredients: ["rice"],
    optional: [],
    notes: "",
  });
  backup.splice(backup.findIndex((recipe) => recipe.name === "Fajitas"), 1);
  const overlay = overlayFromBackup(base, backup);
  assert.deepEqual(overlay.deleted, ["csv:Fajitas"]);
  assert.equal(overlay.edited[base.find((recipe) => recipe.name === "Spanish chicken").id].notes, "Extra paprika.");
  assert.equal(overlay.added.length, 1);
  assert.equal(overlay.added[0].name, "Tomato rice");

  const previous = applyRecipeOverlay(base, {
    edited: {
      [base.find((recipe) => recipe.name === "Spanish chicken").id]: {
        id: base.find((recipe) => recipe.name === "Spanish chicken").id,
        name: "Spanish chicken",
        whose: "Gez",
        ingredients: ["chicken"],
        optional: [],
        notes: "",
      },
    },
  });
  const next = applyRecipeOverlay(base, overlay);
  const week = { ...emptyWeek(), wed: previous.find((recipe) => recipe.name === "Spanish chicken").id };
  const relinked = relinkWeek(week, previous, next);
  assert.equal(relinked.wed, week.wed);
});
