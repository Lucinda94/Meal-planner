import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AISLES,
  MISSING_INGREDIENTS,
  aisleFor,
  buildShoppingList,
  defaultWeek,
  emptyWeek,
  filterRecipes,
  formatMealGroup,
  parseRecipes,
  resolveAppBase,
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
