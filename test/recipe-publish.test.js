import assert from "node:assert/strict";
import test from "node:test";
import {
  csvIsPublishable,
  publishRecipes,
  safeEqual,
  utf8ToBase64,
} from "../worker/recipe-publish.js";

const header = "Recipe,Whose recipe,Ingredients,Optional extras,Method,Notes";
const csv = `${header}\nSoup,Mum,"onions, stock",,,Simmer until soft.\n`;

function request(body, origin = "https://lucinda94.github.io") {
  return new Request("https://meal-planner.example/recipes", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("passcode check does not treat a short guess as a match", () => {
  assert.equal(safeEqual("correct horse", "correct horse"), true);
  assert.equal(safeEqual("correct horse", "correct horsey"), false);
  assert.equal(safeEqual("", "correct horse"), false);
  assert.equal(safeEqual("correct horse", ""), false);
});

test("a recipe file needs the column heading and at least one dinner", () => {
  assert.equal(csvIsPublishable(csv), true);
  assert.equal(csvIsPublishable(`\uFEFF${csv}`), true);
  assert.equal(csvIsPublishable(`${header}\n`), false);
  assert.equal(csvIsPublishable("Recipe,Notes\nSoup,Hello\n"), false);
  assert.equal(csvIsPublishable(""), false);
});

test("the worker refuses a missing or wrong passcode and never calls GitHub", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response("no");
  };
  const missing = await publishRecipes(request({ passcode: "correct horse", csv }), {
    GITHUB_TOKEN: "",
    RECIPE_PASSCODE: "correct horse",
  }, fetchImpl);
  assert.equal(missing.status, 503);
  const wrong = await publishRecipes(request({ passcode: "guess", csv }), {
    GITHUB_TOKEN: "github-token",
    RECIPE_PASSCODE: "correct horse",
  }, fetchImpl);
  assert.equal(wrong.status, 401);
  assert.equal(called, false);
});

test("a stranger website is not allowed to call the worker", async () => {
  const response = await publishRecipes(request({ passcode: "correct horse", csv }, "https://evil.example"), {
    GITHUB_TOKEN: "github-token",
    RECIPE_PASSCODE: "correct horse",
  }, async () => new Response("no"));
  assert.equal(response.status, 403);
});

test("the right passcode writes recipes.csv with the token kept on the server", async () => {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url, options });
    if (!options.method || options.method === "GET") {
      return new Response(JSON.stringify({ sha: "abc123" }), { status: 200 });
    }
    return new Response(JSON.stringify({ commit: { sha: "def456" } }), { status: 200 });
  };
  const ok = await publishRecipes(request({ passcode: "correct horse", csv }), {
    GITHUB_TOKEN: "github-token",
    RECIPE_PASSCODE: "correct horse",
  }, fetchImpl);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.commit, "def456");
  const put = seen.find((call) => call.options.method === "PUT");
  assert.equal(put.options.headers.authorization, "Bearer github-token");
  const sent = JSON.parse(put.options.body);
  assert.equal(sent.sha, "abc123");
  assert.equal(sent.branch, "main");
  assert.match(sent.message, /meal planner/);
  const decoded = Buffer.from(sent.content, "base64").toString("utf8");
  assert.equal(decoded, csv.endsWith("\n") ? csv : `${csv}\n`);
  assert.equal(utf8ToBase64("crème"), Buffer.from("crème", "utf8").toString("base64"));
});
