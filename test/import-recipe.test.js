import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseIngredientText } from "../js/planner.js";
import {
  composeImportedNotes,
  corsProxyUrls,
  extractRecipe,
  isSocialRecipeUrl,
  normaliseRecipeUrl,
  parseRecipeText,
} from "../js/import-recipe.js";

const pancakesHtml = `<!DOCTYPE html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Easy pancakes",
  "recipeYield": "Makes 12",
  "prepTime": "PT10M",
  "cookTime": "PT1H10M",
  "recipeIngredient": ["100g plain flour", "2 large eggs", "300ml milk", "1 tbsp oil"],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Whisk everything into a smooth batter."},
    {"@type": "HowToStep", "text": "Fry until golden on both sides."}
  ],
  "image": [{"@type": "ImageObject", "url": "https://images.example.com/pancakes.jpg", "width": 800}]
}
</script>
</head><body><p>Easy pancakes</p></body></html>`;

test("reads a schema.org Recipe from the page", () => {
  const recipe = extractRecipe(pancakesHtml, "https://example.com/recipes/easy-pancakes");
  assert.equal(recipe.name, "Easy pancakes");
  assert.deepEqual(recipe.ingredients, ["100g plain flour", "2 large eggs", "300ml milk", "1 tbsp oil"]);
  assert.match(recipe.method, /^1\. Whisk everything/);
  assert.match(recipe.method, /2\. Fry until golden/);
  assert.equal(recipe.servings, "Makes 12");
  assert.equal(recipe.time, "Prep 10 mins · Cook 1 hour 10 mins");
  assert.equal(recipe.image, "https://images.example.com/pancakes.jpg");
  assert.equal(recipe.sourceUrl, "https://example.com/recipes/easy-pancakes");
});

test("reads a recipe nested in @graph, including sections and a relative photo", () => {
  const html = `<html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"BreadcrumbList","itemListElement":[]},
    {"@type":"Recipe","name":"Tomato soup","recipeYield":["4"],"totalTime":"PT45M",
      "image":"/photos/soup.jpg",
      "recipeIngredient":["1 onion","2 carrots","1 tin tomatoes"],
      "recipeInstructions":[
        {"@type":"HowToSection","name":"For the soup","itemListElement":[
          {"@type":"HowToStep","text":"Fry the onion and carrots."},
          {"@type":"HowToStep","text":"Add the tomatoes and simmer."}
        ]}
      ]}
  ]}</script></head><body></body></html>`;
  const recipe = extractRecipe(html, "https://blog.example.com/tomato-soup");
  assert.equal(recipe.name, "Tomato soup");
  assert.equal(recipe.servings, "Serves 4");
  assert.equal(recipe.time, "Ready in 45 mins");
  assert.equal(recipe.image, "https://blog.example.com/photos/soup.jpg");
  assert.match(recipe.method, /For the soup/);
  assert.match(recipe.method, /1\. Fry the onion and carrots\./);
  assert.match(recipe.method, /2\. Add the tomatoes and simmer\./);
});

test("reads an HTML instruction list and an entity-encoded block", () => {
  const html = `<html><script type="application/ld+json">
  {"@type":"Recipe","name":"Garlic bread","recipeIngredient":["1 baguette","&amp; butter"],
   "recipeInstructions":"<ol><li>Slice the baguette</li><li>Spread with butter</li></ol>"}
  </script></html>`;
  const recipe = extractRecipe(html, "https://example.com/garlic-bread");
  assert.equal(recipe.name, "Garlic bread");
  assert.ok(recipe.ingredients.includes("1 baguette"));
  assert.match(recipe.method, /1\. Slice the baguette/);
  assert.match(recipe.method, /2\. Spread with butter/);
});

test("unwraps a JSON proxy body and ignores a block page", () => {
  const wrapped = JSON.stringify({ contents: pancakesHtml, status: { http_code: 200 } });
  const recipe = extractRecipe(wrapped, "https://example.com/recipes/easy-pancakes");
  assert.equal(recipe.name, "Easy pancakes");
  const blocked = "<html><title>Just a moment...</title><p>Cloudflare</p></html>";
  assert.equal(extractRecipe(blocked, "https://example.com/recipe"), null);
});

test("social video links are recognised and other recipe links are not", () => {
  for (const url of [
    "https://www.instagram.com/reel/abc/",
    "https://www.instagram.com/p/abc/",
    "https://vm.tiktok.com/ZSabcd/",
    "https://www.tiktok.com/@baker/video/1",
    "https://m.facebook.com/story.php?id=1",
    "https://www.facebook.com/share/r/abc/",
    "https://fb.watch/abc/",
    "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com",
  ]) {
    assert.equal(isSocialRecipeUrl(url), true, url);
  }
  assert.equal(isSocialRecipeUrl("https://www.bbcgoodfood.com/recipes/easy-pancakes"), false);
  assert.equal(isSocialRecipeUrl("https://www.recipetineats.com/spaghetti-bolognese/"), false);
  assert.equal(isSocialRecipeUrl("https://instagram.com.evil.example/reel/1"), false);
});

test("only http links are accepted, and a missing scheme is filled in", () => {
  assert.equal(
    normaliseRecipeUrl("www.bbcgoodfood.com/recipes/easy-pancakes"),
    "https://www.bbcgoodfood.com/recipes/easy-pancakes",
  );
  assert.equal(normaliseRecipeUrl("javascript:alert(1)"), null);
  assert.equal(normaliseRecipeUrl("data:text/html,hi"), null);
  assert.equal(normaliseRecipeUrl("   "), null);
  assert.equal(normaliseRecipeUrl("not a link"), null);
});

test("cors proxies are public and have no API key", () => {
  const urls = corsProxyUrls("https://example.com/recipes/soup");
  assert.equal(urls[0], "https://proxy.cors.dev/https://example.com/recipes/soup");
  assert.ok(urls.length >= 2);
  for (const url of urls) {
    assert.equal(new URL(url).username, "");
    assert.equal(new URL(url).password, "");
    assert.doesNotMatch(url, /[?&](?:key|api_key|token)=/i);
  }
});

test("sorts a pasted caption into ingredients and method", () => {
  const recipe = parseRecipeText(`Creamy tomato pasta 🍝

Serves 4
Prep 10 mins
Cook 20 mins

Ingredients:
400g spaghetti
1 tin tomatoes
2 garlic cloves
1 onion, finely chopped

Method:
1. Cook the pasta
2. Fry the onion and garlic
3. Add the tomatoes and simmer
`, { loose: true });
  assert.equal(recipe.name, "Creamy tomato pasta");
  assert.deepEqual(recipe.ingredients, [
    "400g spaghetti",
    "1 tin tomatoes",
    "2 garlic cloves",
    "1 onion, finely chopped",
  ]);
  assert.match(recipe.method, /1\. Cook the pasta/);
  assert.match(recipe.method, /3\. Add the tomatoes and simmer/);
  assert.equal(recipe.servings, "Serves 4");
  assert.equal(recipe.time, "Prep 10 mins · Cook 20 mins");
  const notes = composeImportedNotes({ ...recipe, sourceUrl: "https://www.instagram.com/p/abc/" });
  assert.match(notes, /Serves 4/);
  assert.match(notes, /1\. Cook the pasta/);
  assert.match(notes, /From: https:\/\/www.instagram.com\/p\/abc\//);
  assert.deepEqual(parseIngredientText(recipe.ingredients.join("\n")), recipe.ingredients);
});

test("sorts a caption that has no headings", () => {
  const recipe = parseRecipeText(`Tomato soup

1 onion
2 carrots
1 tin tomatoes
500ml stock

Chop the onion and carrots. Fry for 5 minutes. Add the tomatoes and stock and simmer for 20 minutes.

Serves 4
`, { loose: true });
  assert.equal(recipe.name, "Tomato soup");
  assert.deepEqual(recipe.ingredients, ["1 onion", "2 carrots", "1 tin tomatoes", "500ml stock"]);
  assert.match(recipe.method, /Fry for 5 minutes/);
  assert.equal(recipe.servings, "Serves 4");
});

test("a fetched page needs a real ingredient list, not the site menu", () => {
  const noisy = `Title: Easy pancakes

URL Source: https://example.com/pancakes

* [Ingredients](https://example.com/ingredients)
* [Subscribe](https://example.com/subscribe)

## Ingredients
- 100g plain flour
- 2 large eggs
- 300ml milk

## Method
Whisk the batter.
Fry the pancakes.

Serves 4
Prep: 10 mins
`;
  const recipe = parseRecipeText(noisy, { loose: false });
  assert.equal(recipe.name, "Easy pancakes");
  assert.deepEqual(recipe.ingredients, ["100g plain flour", "2 large eggs", "300ml milk"]);
  assert.match(recipe.method, /Whisk the batter/);
  assert.equal(recipe.servings, "Serves 4");
  assert.equal(recipe.time, "Prep 10 mins");
  assert.equal(parseRecipeText("Subscribe\nHealth\nRecipes\n", { loose: false }), null);
  assert.equal(extractRecipe(noisy, "https://example.com/pancakes").name, "Easy pancakes");
});

test("empty pasted text is ignored", () => {
  assert.equal(parseRecipeText("   \n", { loose: true }), null);
});

test("the add-recipe form stays hidden until it is opened", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(css, /dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none/);
  const closed = css.match(/\.recipe-dialog\s*\{([^}]*)\}/);
  assert.ok(closed);
  assert.doesNotMatch(closed[1], /display\s*:/);
  assert.match(css, /\.recipe-dialog\[open\]\s*\{[^}]*display:\s*flex/);
  assert.match(html, /<dialog id="recipe-dialog"(?![^>]*\bopen\b)/);
  assert.match(html, /id="import-panel"/);
  assert.match(html, /id="import-fallback"/);
});
