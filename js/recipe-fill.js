/**
 * Turn a recipe page, a pasted caption, or text read from a photo into the
 * add-recipe fields. Fetching the page and reading the photo happen in the
 * browser. This file only parses, so the tests can run it without a network.
 */

const SOCIAL_HOSTS = ["facebook.com", "fb.com", "fb.watch", "instagram.com", "instagr.am", "tiktok.com"];

/**
 * Public proxies that need no account and no key. The first one is the one
 * that currently returns the real page with Access-Control-Allow-Origin: *.
 * The others are only tried if that fails.
 */
export function pageProxyUrls(targetUrl) {
  return [
    `https://proxy.cors.dev/${targetUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://r.jina.ai/${targetUrl}`,
  ];
}

export function normaliseRecipeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return null;
  raw = raw.replace(/^[<(]+/, "").replace(/[>)]+$/, "");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/\.$/, "");
  if (!host || !host.includes(".")) return null;
  return url.href;
}

export function isSocialRecipeUrl(urlString) {
  let host;
  try {
    host = new URL(urlString).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  } catch {
    return false;
  }
  return SOCIAL_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

/** Read a fetched page, proxy body, or reader transcript into form fields. */
export function recipeFromDocument(documentText, pageUrl) {
  const text = unwrapProxyBody(documentText);
  if (!text) return null;
  if (!isHtmlDocument(text)) {
    return accept(recipeFromText(text, { loose: false, sourceUrl: pageUrl || "" }), true);
  }
  const fromSchema = recipeFromHtml(text, pageUrl);
  if (fromSchema) return fromSchema;
  const caption = recipeFromCaption(text, pageUrl);
  if (caption) return caption;
  if (looksLikeBlockPage(text)) return null;
  return accept(recipeFromText(htmlToPlain(text), { loose: false, sourceUrl: pageUrl || "" }), true);
}

/**
 * Sort pasted or photographed recipe text into the form.
 * Loose mode is for a caption or a photo, where the headings may be messy.
 * A fetched page is strict, so a navigation menu is not treated as a recipe.
 */
export function recipeFromText(raw, options = {}) {
  const loose = options.loose === true;
  const sourceUrl = options.sourceUrl || "";
  const text = expandInlineHeadings(String(raw || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ")).trim();
  if (!text) return null;

  const lines = text.split("\n");
  const titleHint = readTitleHint(lines);
  const sections = [];
  const preamble = [];
  let current = null;
  let stopped = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isSkippable(trimmed)) continue;
    const kind = headingKind(trimmed);
    if (kind === "stop") {
      if (current) sections.push(current);
      current = null;
      stopped = true;
      break;
    }
    if (kind) {
      if (current) sections.push(current);
      current = { kind, lines: [] };
      continue;
    }
    if (stopped) break;
    if (current) current.lines.push(trimmed);
    else preamble.push(trimmed);
  }
  if (current) sections.push(current);

  const ingredientSection = sections
    .filter((section) => section.kind === "ingredients")
    .sort((a, b) => scoreLines(b.lines) - scoreLines(a.lines))[0];
  const methodSection = sections.find((section) => section.kind === "method");
  const optionalSection = sections.find((section) => section.kind === "optional");
  const notesSection = sections.find((section) => section.kind === "notes");

  if (!ingredientSection && !methodSection) {
    if (!loose) return null;
    return looseRecipe(preamble.length ? preamble : lines.map((line) => line.trim()).filter(Boolean), titleHint, sourceUrl);
  }

  const ingredients = ingredientSection ? ingredientLines(ingredientSection.lines) : [];
  const methodLines = (methodSection ? methodSection.lines : []).filter((line) => !isMetaLine(line));
  const optional = optionalSection ? ingredientLines(optionalSection.lines) : [];
  const meta = metaFromLines([...preamble, ...(ingredientSection ? ingredientSection.lines : []), ...methodLines]);
  const whose = whoseFromLines(preamble);
  const name = titleHint || titleFromLines(preamble);
  const method = formatMethod(methodLines.map((line) => cleanStep(line)));
  if (ingredients.length < 2 && !(loose && (ingredients.length > 0 || method))) return null;
  return formRecipe({
    name,
    whose,
    ingredients,
    optional,
    method,
    servings: meta.servings,
    time: meta.time,
    extraNotes: notesSection ? notesSection.lines.filter((line) => !isMetaLine(line)).join("\n") : "",
    sourceUrl,
  });
}

function accept(recipe, strict) {
  if (!recipe) return null;
  if (recipe.ingredients.length >= 2) return recipe;
  if (recipe.ingredients.length >= 1 && recipe.method) return recipe;
  if (!strict && (recipe.name || recipe.method)) return recipe;
  return null;
}

function recipeFromHtml(html, pageUrl) {
  const blocks = [];
  const pattern = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    const parsed = parseJsonLd(match[1]);
    if (parsed) blocks.push(parsed);
    match = pattern.exec(html);
  }
  const found = [];
  for (const block of blocks) collectRecipes(block, found);
  const recipes = found
    .map((node) => recipeFromSchema(node, pageUrl))
    .filter((recipe) => recipe && (recipe.ingredients.length > 0 || recipe.method));
  if (recipes.length === 0) return null;
  recipes.sort((a, b) => scoreRecipe(b) - scoreRecipe(a));
  const canonical = pageUrl ? recipes.find((recipe) => recipe.schemaUrl && samePage(recipe.schemaUrl, pageUrl)) : null;
  const chosen = canonical || recipes[0];
  const withTitle = chosen.name ? chosen : { ...chosen, name: titleFromHtml(html) };
  const { schemaUrl, ...recipe } = withTitle;
  return recipe;
}

function recipeFromSchema(node, pageUrl) {
  const listed = listOf(node.recipeIngredient).map(plainText).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const ingredients = [];
  const optional = [];
  for (const line of listed) {
    if (/\(\s*optional\s*\)/i.test(line)) optional.push(line.replace(/\s*\(\s*optional\s*\)/i, "").replace(/\s+/g, " ").trim());
    else ingredients.push(line);
  }
  const method = formatMethod(instructionSteps(node.recipeInstructions));
  const name = plainText(node.name || node.headline || "");
  return formRecipe({
    name,
    whose: authorName(node.author),
    ingredients,
    optional,
    method,
    servings: formatYield(node.recipeYield),
    time: formatSchemaTime(node),
    extraNotes: "",
    sourceUrl: pageUrl || (typeof node.url === "string" ? node.url : ""),
    schemaUrl: typeof node.url === "string" ? node.url : "",
  });
}

function recipeFromCaption(html, pageUrl) {
  const description = metaContent(html, "og:description") || metaContent(html, "description") || metaContent(html, "twitter:description");
  const title = metaContent(html, "og:title") || metaContent(html, "twitter:title");
  if (!description || genericCaption(description)) return null;
  const heading = title && !genericCaption(title) ? title : "";
  const parsed = recipeFromText(`${heading}\n${description}`, { loose: true, sourceUrl: pageUrl || "" });
  return accept(parsed, false);
}

function formRecipe(parts) {
  const timing = [parts.servings, parts.time].filter(Boolean);
  const info = [];
  if (timing.length) info.push(timing.join(" · "));
  if (parts.sourceUrl) info.push(`From: ${parts.sourceUrl}`);
  const recipe = {
    name: tidyName(parts.name),
    whose: tidyName(parts.whose),
    ingredients: (parts.ingredients || []).filter(Boolean),
    optional: (parts.optional || []).filter(Boolean),
    info: info.join("\n"),
    method: String(parts.method || "").trim(),
    notes: String(parts.extraNotes || "").trim(),
  };
  if (parts.schemaUrl) recipe.schemaUrl = parts.schemaUrl;
  return recipe;
}

function looseRecipe(lines, titleHint, sourceUrl) {
  const content = lines.filter((line) => line && !isSkippable(line));
  const meta = metaFromLines(content);
  let name = tidyName(titleHint);
  let whose = "";
  const ingredients = [];
  const methodBits = [];
  let seenIngredient = false;
  for (const line of content) {
    if (isMetaLine(line)) continue;
    const byline = line.match(/^(?:by|recipe by)\s+(.{2,60})$/i);
    if (byline && !whose && !looksLikeIngredient(byline[1])) {
      whose = byline[1];
      continue;
    }
    if (!name && looksLikeTitle(line) && !looksLikeIngredient(line)) {
      name = tidyName(line);
      continue;
    }
    if (looksLikeIngredient(line) || (seenIngredient && methodBits.length === 0 && looksLikeBareIngredient(line))) {
      seenIngredient = true;
      const cleaned = cleanIngredient(line);
      if (cleaned) ingredients.push(...splitInlineList(cleaned));
      continue;
    }
    const step = cleanStep(line);
    if (step) methodBits.push(step);
  }
  if (!name && ingredients.length === 0 && methodBits.length === 0) return null;
  return formRecipe({
    name,
    whose,
    ingredients,
    optional: [],
    method: formatMethod(methodBits),
    servings: meta.servings,
    time: meta.time,
    extraNotes: "",
    sourceUrl,
  });
}

function unwrapProxyBody(documentText) {
  const text = String(documentText || "").replace(/^\uFEFF/, "").trim();
  if (!text.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.contents === "string") return parsed.contents;
    if (parsed && typeof parsed.data === "string") return parsed.data;
  } catch {
    // Not a JSON wrapper. Treat the body as the page.
  }
  return text;
}

function looksLikeBlockPage(text) {
  if (/recipeIngredient/i.test(text)) return false;
  const sample = text.slice(0, 5000).toLowerCase();
  if (sample.includes("just a moment") && sample.includes("cloudflare")) return true;
  if (sample.includes("attention required") && sample.includes("cloudflare")) return true;
  if (sample.includes("access denied") && text.length < 8000) return true;
  return false;
}

function isHtmlDocument(text) {
  return /<html[\s>]/i.test(text) || /<body[\s>]/i.test(text) || /<script\b/i.test(text) || /<meta\b/i.test(text);
}

function parseJsonLd(raw) {
  let text = String(raw || "").trim();
  text = text.replace(/^<!--/, "").replace(/-->$/, "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(decodeEntities(text));
    } catch {
      return null;
    }
  }
}

function collectRecipes(node, out, seen = new Set()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectRecipes(item, out, seen);
    return;
  }
  if (isRecipeType(node["@type"])) out.push(node);
  for (const value of Object.values(node)) collectRecipes(value, out, seen);
}

function isRecipeType(type) {
  const list = Array.isArray(type) ? type : type ? [type] : [];
  return list.some((item) => /(^|\/)Recipe$/i.test(String(item)));
}

function scoreRecipe(recipe) {
  return recipe.ingredients.length * 5 + (recipe.method ? 4 : 0) + (recipe.name ? 2 : 0);
}

function samePage(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right, left);
    const path = (url) => url.pathname.replace(/\/$/, "");
    return a.origin === b.origin && path(a) === path(b);
  } catch {
    return false;
  }
}

function listOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function instructionSteps(value, into = []) {
  if (!value) return into;
  if (typeof value === "string") {
    if (/<li[\s>]/i.test(value)) {
      for (const item of value.split(/<li[\s>]/i).slice(1)) {
        const text = plainText(item.split(/<\/li>/i)[0]);
        if (text) into.push(text);
      }
      return into;
    }
    const withBreaks = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr)>/gi, "\n");
    for (const line of decodeEntities(withBreaks).split(/\n+/)) {
      const text = plainText(line);
      if (text) into.push(text);
    }
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) instructionSteps(item, into);
    return into;
  }
  if (typeof value === "object") {
    const type = String(value["@type"] || "");
    if (/HowToSection$/i.test(type)) {
      const name = plainText(value.name || "");
      if (name) into.push(name);
      instructionSteps(value.itemListElement || value.steps, into);
      return into;
    }
    if (value.itemListElement && !value.text && !value.name) {
      instructionSteps(value.itemListElement, into);
      return into;
    }
    const text = plainText(value.text || value.name || "");
    if (text) into.push(text);
  }
  return into;
}

function formatMethod(steps) {
  const lines = [];
  let number = 0;
  for (const step of steps) {
    const text = String(step || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (/^(?:for the|to serve)\b/i.test(text) && text.length < 40) {
      if (lines.length) lines.push("");
      lines.push(text);
      number = 0;
      continue;
    }
    number += 1;
    const already = /^(?:step\s+)?\d+(?:[.)]\s+|\s+)(?=[A-Za-z"“])/i.test(text);
    lines.push(already ? text : `${number}. ${text}`);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatYield(value) {
  const raw = listOf(value).map((item) => plainText(item)).filter(Boolean);
  const labelled = raw.find((item) => /^(makes|serves?|servings?|yield)\b/i.test(item));
  const chosen = (labelled || raw[0] || "").replace(/\s+/g, " ").trim();
  if (!chosen) return "";
  if (/^(makes|serves|yield)\b/i.test(chosen)) return capitalise(chosen);
  if (/^\d+\s*[-–]\s*\d+$/.test(chosen) || /^\d+$/.test(chosen)) return `Serves ${chosen}`;
  const servings = chosen.match(/^(\d+)\s+servings?$/i);
  if (servings) return `Serves ${servings[1]}`;
  return chosen;
}

function formatSchemaTime(node) {
  const bits = [];
  const prep = formatDuration(node.prepTime);
  const cook = formatDuration(node.cookTime);
  const total = formatDuration(node.totalTime);
  if (prep) bits.push(`Prep ${prep}`);
  if (cook) bits.push(`Cook ${cook}`);
  if (!bits.length && total) bits.push(`Ready in ${total}`);
  return bits.join(" · ");
}

function formatDuration(iso) {
  const match = String(iso || "").trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return "";
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const mins = Number(match[3] || 0);
  const parts = [];
  if (days) parts.push(days === 1 ? "1 day" : `${days} days`);
  if (hours) parts.push(hours === 1 ? "1 hr" : `${hours} hrs`);
  if (mins) parts.push(mins === 1 ? "1 min" : `${mins} mins`);
  return parts.join(" ");
}

function authorName(author) {
  if (!author) return "";
  if (typeof author === "string") return plainText(author);
  if (Array.isArray(author)) {
    const person = author.find((item) => item && /Person$/i.test(String(item["@type"] || "")));
    return authorName(person || author[0]);
  }
  if (typeof author === "object") return plainText(author.name || "");
  return "";
}

function htmlToPlain(html) {
  return decodeEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|section|article|header)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<h\d[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function titleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return tidyName(
    decodeEntities(match[1])
      .replace(/\s*[|–—-]\s*.*$/, "")
      .replace(/\s+recipe$/i, ""),
  );
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*?(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*?content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*?(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const found = String(html || "").match(pattern);
    if (found) return decodeEntities(found[1]).replace(/\s+/g, " ").trim();
  }
  return "";
}

function genericCaption(text) {
  const value = String(text || "").trim();
  if (value.length < 12) return true;
  return /^(?:instagram|facebook|tiktok|log in|sign up)\b/i.test(value)
    || /create an account or log in|log in to (?:instagram|facebook|continue)|see posts, photos and more|watch on (?:facebook|tiktok)/i.test(value);
}

function expandInlineHeadings(text) {
  return text.replace(/(^|[\n.!?])\s*(ingredients?|method|instructions?|directions?|steps|optional extras?|notes?)\s*[:：]\s*/gi, (full, boundary, word) => {
    const label = capitalise(word.toLowerCase());
    return `${boundary || ""}\n${label}\n`;
  });
}

function headingKind(line) {
  let label = String(line || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/[:：]\s*$/, "")
    .trim();
  label = label.replace(/\s*[(\-–—].{0,24}$/, "").trim().toLowerCase();
  if (!label || label.length > 40) return null;
  if (/^(?:ingredients?|ingredien[a-z]{1,3}|what you(?:'|’)ll need|you(?:'|’)ll need|what you need)$/.test(label)) return "ingredients";
  if (/^(?:method|methods|instructions?|directions?|steps|how to(?: make(?: it)?)?)$/.test(label)) return "method";
  if (/^(?:optional extras?|optional|to serve|to garnish)$/.test(label)) return "optional";
  if (/^(?:notes?|tips?|hints?)$/.test(label)) return "notes";
  if (/^(?:nutrition|nutrition information|you may also like|more like this|related recipes?)$/.test(label)) return "stop";
  return null;
}

function scoreLines(lines) {
  return lines.reduce((sum, line) => sum + (looksLikeIngredient(line) ? 1 : 0), 0);
}

function ingredientLines(lines) {
  const items = [];
  for (const line of lines) {
    if (!line || isMetaLine(line) || headingKind(line)) continue;
    if (/^for the [\p{L}\s]{2,28}$/iu.test(line)) {
      items.push(tidyName(line));
      continue;
    }
    for (const part of splitInlineList(line)) {
      const cleaned = cleanIngredient(part);
      if (cleaned && !isMetaLine(cleaned)) items.push(cleaned);
    }
  }
  return items;
}

function splitInlineList(line) {
  if (!line.includes(",")) return [line];
  const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every((part) => looksLikeIngredient(part))) return parts;
  return [line];
}

function tidyOcr(value) {
  return String(value || "")
    .replace(/\bthsp\b/gi, "tbsp")
    .replace(/\btbps\b/gi, "tbsp");
}

function cleanIngredient(line) {
  return tidyOcr(line)
    .replace(/^(?:[\s«»¢•·●▪◦*\-–—]+)+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanStep(line) {
  return tidyOcr(line)
    .replace(/^\s*(?:[-*•·–—«»¢▪◦●])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function metaFromLines(lines) {
  let servings = "";
  const times = [];
  for (const line of lines) {
    const serving = servingFrom(line);
    if (serving && !servings) servings = serving;
    const time = timeFrom(line);
    if (time && !times.includes(time)) times.push(time);
  }
  return { servings, time: times.join(" · ") };
}

function servingFrom(line) {
  const text = String(line || "").replace(/^#+\s*/, "").trim();
  const trailing = text.match(/^(\d+)\s+servings?$/i);
  if (trailing) return `Serves ${trailing[1]}`;
  const match = text.match(/^(serves?|servings?|makes|yield)\b\s*[:：\-–]?\s*(.+)$/i);
  if (!match) return "";
  const rest = match[2].trim().replace(/[.\s]+$/, "");
  if (!rest || rest.length > 40) return "";
  const label = /^makes/i.test(match[1]) ? "Makes" : /^yield/i.test(match[1]) ? "Yield" : "Serves";
  return `${label} ${rest}`;
}

function timeFrom(line) {
  const text = String(line || "").replace(/^#+\s*/, "").trim();
  const match = text.match(/^(prep(?:aration)?(?:\s*time)?|cook(?:ing)?(?:\s*time)?|total(?:\s*time)?|ready in)\b\s*[:：\-–]?\s*(.+)$/i);
  if (!match) return "";
  const label = /^prep/i.test(match[1]) ? "Prep" : /^cook/i.test(match[1]) ? "Cook" : "Ready in";
  const value = match[2].trim().replace(/[.\s]+$/, "");
  if (!value || value.length > 40) return "";
  return `${label} ${value}`;
}

function isMetaLine(line) {
  return Boolean(servingFrom(line) || timeFrom(line));
}

function whoseFromLines(lines) {
  for (const line of lines) {
    const match = String(line || "").match(/^(?:by|recipe by)\s+(.{2,60})$/i);
    if (match && !looksLikeIngredient(match[1])) return tidyName(match[1]);
  }
  return "";
}

function titleFromLines(lines) {
  for (const line of lines) {
    if (isMetaLine(line) || isSkippable(line) || /^by\s+/i.test(line)) continue;
    if (looksLikeTitle(line)) return tidyName(line);
  }
  return "";
}

function readTitleHint(lines) {
  for (const line of lines.slice(0, 8)) {
    const match = String(line || "").trim().match(/^(?:title|recipe name)\s*[:：]\s*(.+)$/i);
    if (match && looksLikeTitle(match[1])) return tidyName(match[1]);
  }
  return "";
}

function isSkippable(line) {
  const text = String(line || "").trim();
  if (!text) return true;
  if (/^(?:url source|published time|markdown content|warning)\s*:/i.test(text)) return true;
  if (/^https?:\/\/\S+$/i.test(text)) return true;
  if (/!\[[^\]]*]\([^)]+\)/.test(text)) return true;
  return false;
}

function looksLikeIngredient(line) {
  const text = cleanIngredient(line);
  if (!text || text.length > 160) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (isMetaLine(text) || headingKind(text)) return false;
  if (/^(?:\d+\s+\d+\/\d+|\d+(?:[./]\d+)?(?:\s*[a-zA-Zµ%]|\s+\S)|[½¼¾⅓⅔⅛⅜⅝⅞])/.test(text)) return true;
  if (/^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+\S/i.test(text) && wordCount(text) <= 16) return true;
  if (/\b(?:pinch|handful|bunch|cloves?|tins?|cans?|splash|drizzle|knob|slices?|rashers?|sprigs?|sticks?|tbsp|tsp|cups?)\b/i.test(text) && wordCount(text) <= 18) return true;
  return false;
}

function looksLikeBareIngredient(line) {
  const text = cleanIngredient(line);
  if (!text || /[.!?]$/.test(text) || looksLikeIngredient(text) || isMetaLine(text)) return false;
  const words = text.split(/\s+/);
  return words.length > 0 && words.length <= 5;
}

function looksLikeTitle(line) {
  const text = tidyName(line);
  if (!text || text.length > 80) return false;
  if (looksLikeIngredient(text) || isMetaLine(text) || headingKind(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > 14) return false;
  if (/[.!?]$/.test(text) && words.length > 6) return false;
  return true;
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function tidyName(value) {
  return String(value || "")
    .replace(/^#+\s*/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalise(value) {
  if (!value) return "";
  return value.charAt(0).toLocaleUpperCase("en-GB") + value.slice(1);
}

function plainText(value) {
  if (value == null) return "";
  if (typeof value === "object") return plainText(value.text || value.name || "");
  return decodeEntities(String(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)));
}
