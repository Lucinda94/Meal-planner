import assert from "node:assert/strict";
import test from "node:test";
import {
  isSocialRecipeUrl,
  normaliseRecipeUrl,
  pageProxyUrls,
  recipeFromDocument,
  recipeFromText,
} from "../js/recipe-fill.js";

const pageUrl = "https://www.bbcgoodfood.com/recipes/easy-pancakes";

const bbcPage = `<!DOCTYPE html><html><head>
<title>Easy pancakes recipe | Good Food</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Easy pancakes",
  "url": "https://www.bbcgoodfood.com/recipes/easy-pancakes",
  "recipeYield": "Makes 12",
  "prepTime": "PT10M",
  "cookTime": "PT20M",
  "totalTime": "PT30M",
  "author": [{ "@type": "Person", "name": "Cassie Best" }],
  "recipeIngredient": [
    "100g plain flour",
    "2 large eggs",
    "300ml milk",
    "1 tbsp sunflower or vegetable oil",
    "1 onion, finely chopped",
    "a pinch of salt",
    "lemon wedges to serve (optional)"
  ],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Put the flour, eggs, milk, oil and a pinch of salt into a bowl, then whisk to a smooth batter." },
    { "@type": "HowToStep", "text": "Heat a frying pan and cook each pancake until golden." }
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Recipe",
      "name": "Related banana bread",
      "url": "https://www.bbcgoodfood.com/recipes/banana-bread",
      "recipeIngredient": ["bananas", "flour", "eggs", "butter", "sugar", "baking powder"],
      "recipeInstructions": [{ "@type": "HowToStep", "text": "Mix and bake." }]
    }
  ]
}
</script>
</head><body><p>Menu Home Recipes</p></body></html>`;

test("normalises a recipe link and rejects anything that is not a web address", () => {
  assert.equal(normaliseRecipeUrl("  www.bbcgoodfood.com/recipes/easy-pancakes "), "https://www.bbcgoodfood.com/recipes/easy-pancakes");
  assert.equal(normaliseRecipeUrl("https://www.bbcgoodfood.com/recipes/easy-pancakes"), pageUrl);
  assert.equal(normaliseRecipeUrl("javascript:alert(1)"), null);
  assert.equal(normaliseRecipeUrl("pancakes"), null);
  assert.equal(normaliseRecipeUrl(""), null);
});

test("recognises Facebook and Instagram links", () => {
  assert.equal(isSocialRecipeUrl("https://www.instagram.com/p/abc123/"), true);
  assert.equal(isSocialRecipeUrl("https://m.facebook.com/watch/?v=1"), true);
  assert.equal(isSocialRecipeUrl("https://fb.watch/xyz"), true);
  assert.equal(isSocialRecipeUrl(pageUrl), false);
});

test("proxy list needs no key and keeps the recipe address intact", () => {
  const urls = pageProxyUrls(pageUrl);
  assert.equal(urls[0], `https://proxy.cors.dev/${pageUrl}`);
  assert.ok(urls[1].includes(encodeURIComponent(pageUrl)));
  assert.equal(urls[2], `https://r.jina.ai/${pageUrl}`);
});

test("reads schema.org Recipe JSON-LD into the form fields", () => {
  const recipe = recipeFromDocument(bbcPage, pageUrl);
  assert.ok(recipe);
  assert.equal(recipe.name, "Easy pancakes");
  assert.equal(recipe.whose, "Cassie Best");
  assert.ok(recipe.ingredients.includes("100g plain flour"));
  assert.ok(recipe.ingredients.includes("1 onion, finely chopped"));
  assert.equal(recipe.ingredients.includes("finely chopped"), false);
  assert.deepEqual(recipe.optional, ["lemon wedges to serve"]);
  assert.equal(recipe.ingredients.includes("bananas"), false);
  assert.match(recipe.info, /Makes 12/);
  assert.match(recipe.info, /Prep 10 mins/);
  assert.match(recipe.info, /Cook 20 mins/);
  assert.match(recipe.info, new RegExp(`From: ${pageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(recipe.method, /1\. Put the flour, eggs, milk/);
  assert.match(recipe.method, /2\. Heat a frying pan/);
  assert.equal(recipe.notes, "");
});

test("reads a page that has no JSON-LD when the headings are there", () => {
  const html = `<!DOCTYPE html><html><body>
    <h1>Tomato soup</h1>
    <p>Serves 4</p>
    <h2>Ingredients</h2>
    <ul>
      <li>1 onion, finely chopped</li>
      <li>2 tins of tomatoes</li>
      <li>500ml stock</li>
    </ul>
    <h2>Method</h2>
    <p>Fry the onion until soft.</p>
    <p>Add the tomatoes and stock and simmer.</p>
  </body></html>`;
  const recipe = recipeFromDocument(html, "https://example.com/tomato-soup");
  assert.ok(recipe);
  assert.equal(recipe.name, "Tomato soup");
  assert.deepEqual(recipe.ingredients, ["1 onion, finely chopped", "2 tins of tomatoes", "500ml stock"]);
  assert.match(recipe.info, /Serves 4/);
  assert.match(recipe.method, /Fry the onion until soft/);
  assert.match(recipe.method, /Add the tomatoes and stock/);
  assert.equal(recipe.notes, "");
});

test("sorts a photographed or pasted recipe into title, ingredients and method", () => {
  const text = `Lemon chicken
By Mum
Serves 4
Prep: 15 mins
Ingredients
2 chicken breasts
1 lemon, zested
2 tbsp olive oil
Method
1 Heat the oil in a pan.
2 Cook the chicken and add the lemon.
Notes
Lovely cold the next day.
Nutrition
Ignore this.`;
  const recipe = recipeFromText(text, { loose: true });
  assert.ok(recipe);
  assert.equal(recipe.name, "Lemon chicken");
  assert.equal(recipe.whose, "Mum");
  assert.deepEqual(recipe.ingredients, ["2 chicken breasts", "1 lemon, zested", "2 tbsp olive oil"]);
  assert.match(recipe.info, /Serves 4/);
  assert.match(recipe.info, /Prep 15 mins/);
  assert.match(recipe.method, /Heat the oil in a pan/);
  assert.match(recipe.notes, /Lovely cold the next day/);
  assert.equal(/Ignore this/.test(recipe.notes), false);
  assert.equal(/Heat the oil/.test(recipe.notes), false);
});

test("uses a social caption when the post itself cannot be opened", () => {
  const html = `<!DOCTYPE html><html><head>
    <meta property="og:title" content="Traybake chicken" />
    <meta property="og:description" content="Traybake chicken. Ingredients: 6 chicken thighs, 2 red onions, 1 tbsp oil. Method: Roast at 200C for 40 mins." />
  </head><body>Log in to Instagram</body></html>`;
  const recipe = recipeFromDocument(html, "https://www.instagram.com/p/abc123/");
  assert.ok(recipe);
  assert.equal(recipe.name, "Traybake chicken");
  assert.ok(recipe.ingredients.includes("6 chicken thighs"));
  assert.ok(recipe.ingredients.includes("2 red onions"));
  assert.match(recipe.method, /Roast at 200C/);
  assert.equal(/Roast at 200C/.test(recipe.notes), false);
});

test("a login wall with no caption does not invent a recipe", () => {
  const html = `<!DOCTYPE html><html><head>
    <meta property="og:description" content="Create an account or log in to Instagram" />
    <title>Login • Instagram</title>
  </head><body><p>Log in to continue</p></body></html>`;
  assert.equal(recipeFromDocument(html, "https://www.instagram.com/reel/abc/"), null);
  assert.equal(recipeFromDocument("<html><body>Just a moment... Cloudflare</body></html>", pageUrl), null);
  assert.equal(recipeFromText("Home\nRecipes\nShop\nAbout", { loose: false }), null);
});

test("tidies bullet marks and tablespoon misreads from a photo", () => {
  const recipe = recipeFromText(`Lemon chicken traybake
By Mum
Ingredients
« 6 chicken thighs
¢ 2 red onions
« 2 thsp olive oil
Method
1. Heat the oven to 200C.`, { loose: true });
  assert.equal(recipe.name, "Lemon chicken traybake");
  assert.equal(recipe.whose, "Mum");
  assert.deepEqual(recipe.ingredients, ["6 chicken thighs", "2 red onions", "2 tbsp olive oil"]);
  assert.match(recipe.method, /Heat the oven to 200C/);
  assert.equal(recipe.notes, "");
});

test("a reader transcript can supply the title", () => {
  const text = `Title: Easy pancakes
URL Source: ${pageUrl}

Markdown Content:
Ingredients
100g plain flour
2 large eggs
300ml milk
Method
Whisk everything together.
Cook in a hot pan.`;
  const recipe = recipeFromDocument(text, pageUrl);
  assert.ok(recipe);
  assert.equal(recipe.name, "Easy pancakes");
  assert.deepEqual(recipe.ingredients, ["100g plain flour", "2 large eggs", "300ml milk"]);
  assert.match(recipe.method, /Whisk everything together/);
  assert.equal(/Whisk everything together/.test(recipe.notes), false);
});
