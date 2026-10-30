/**
 * Turn a recipe web page, or text pasted from a caption, into fields for the add-recipe form.
 * The page is read in the browser through public CORS proxies (no API key). Parsing stays here
 * so the tests can run it without a network.
 */

const SOCIAL_HOSTS = ["facebook.com", "fb.com", "fb.watch", "instagram.com", "tiktok.com"];

/**
 * Public, keyless proxies. The first one is the one that currently returns real recipe HTML.
 * The others are tried only if that fails. None of them need a secret in the repo.
 */
export function corsProxyUrls(targetUrl) {
  return [
    `https://proxy.cors.dev/${targetUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://r.jina.ai/${targetUrl}`,
  ];
}

export function normaliseRecipeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
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

export function extractRecipe(documentText, pageUrl) {
  const text = unwrapProxyBody(documentText);
  if (!text || looksLikeBlockPage(text)) return null;
  if (isHtmlDocument(text)) return recipeFromHtml(text, pageUrl);
  const parsed = parseRecipeText(text, { loose: false });
  if (!parsed || parsed.ingredients.length < 2) return null;
  return { ...parsed, sourceUrl: pageUrl || parsed.sourceUrl || "", image: parsed.image || "" };
}

export function composeImportedNotes(recipe) {
  if (!recipe) return "";
  const parts = [];
  const timing = [recipe.servings, recipe.time].filter(Boolean);
  if (timing.length) parts.push(timing.join("\n"));
  if (recipe.method) parts.push(recipe.method);
  const tail = [];
  if (recipe.sourceUrl) tail.push(`From: ${recipe.sourceUrl}`);
  if (recipe.image) tail.push(`Photo: ${recipe.image}`);
  if (tail.length) parts.push(tail.join("\n"));
  return parts.join("\n\n").trim();
}

/**
 * Sort a pasted caption or a block of recipe text into name, ingredients, method, servings and time.
 * `loose` is for a caption she pasted. A fetched page is strict, so a navigation menu is not treated as a recipe.
 */
export function parseRecipeText(raw, options = {}) {
  const loose = options.loose === true;
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!text) return null;

  const lines = text.split("\n");
  const titleFromHeader = readPlainTitle(lines);
  const sections = findSections(lines);
  const best = sections
    .filter((section) => section.kind === "ingredients")
    .sort((a, b) => scoreIngredientSection(b) - scoreIngredientSection(a))[0];

  if (!best || scoreIngredientSection(best) < 2) {
    if (!loose) return null;
    return looseRecipe(lines, titleFromHeader);
  }

  const ingredients = ingredientLinesFrom(best.lines);
  if (ingredients.length < 2 && !loose) return null;
  const methodSection = sections.find((section) => section.kind === "method" && section.start > best.start);
  const method = methodSection ? formatMethod(methodLinesFrom(methodSection.lines)) : "";
  const metaLines = lines.slice(Math.max(0, best.start - 30), best.start).concat(best.lines, methodSection ? methodSection.lines : []);
  const meta = metaFromLines(metaLines);
  const name = tidyName(titleFromHeader || titleBefore(lines, best.start) || "");
  return {
    name,
    ingredients,
    method,
    servings: meta.servings,
    time: meta.time,
    image: "",
    sourceUrl: "",
  };
}

function unwrapProxyBody(documentText) {
  const text = String(documentText || "").replace(/^\uFEFF/, "").trim();
  if (!text.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.contents === "string") return parsed.contents;
  } catch {
    // Not a JSON wrapper. Treat the body as the page.
  }
  return text;
}

function looksLikeBlockPage(text) {
  const sample = text.slice(0, 2500).toLowerCase();
  if (sample.includes("just a moment") && sample.includes("cloudflare")) return true;
  if (sample.includes("attention required") && sample.includes("cloudflare")) return true;
  if (/recipeingredient/i.test(text)) return false;
  return sample.includes("access denied") && text.length < 8000;
}

function isHtmlDocument(text) {
  return /<html[\s>]/i.test(text) || /<body[\s>]/i.test(text) || /<script\b/i.test(text);
}

function recipeFromHtml(html, pageUrl) {
  const blocks = [];
  const pattern = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
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
    .filter((recipe) => recipe && (recipe.name || recipe.ingredients.length || recipe.method));
  if (recipes.length === 0) return null;
  recipes.sort((a, b) => scoreRecipe(b) - scoreRecipe(a));
  const canonical = pageUrl ? recipes.find((recipe) => recipe.schemaUrl && samePage(recipe.schemaUrl, pageUrl)) : null;
  const chosen = canonical && scoreRecipe(canonical) >= scoreRecipe(recipes[0]) - 2 ? canonical : recipes[0];
  return { ...chosen, sourceUrl: pageUrl || chosen.schemaUrl || "" };
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

function recipeFromSchema(node, pageUrl) {
  const ingredients = listOf(node.recipeIngredient).map(plainText).filter(Boolean);
  const method = formatMethod(instructionSteps(node.recipeInstructions));
  const image = firstImage(node.image, pageUrl);
  const name = plainText(node.name || node.headline || "");
  return {
    name,
    ingredients,
    method,
    servings: formatYield(node.recipeYield),
    time: formatSchemaTime(node),
    image,
    sourceUrl: "",
    schemaUrl: typeof node.url === "string" ? node.url : "",
  };
}

function scoreRecipe(recipe) {
  return recipe.ingredients.length * 5 + (recipe.method ? 4 : 0) + (recipe.name ? 2 : 0) + (recipe.image ? 1 : 0);
}

function samePage(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right, left);
    return a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
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
    const withBreaks = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr)>/gi, "\n");
    if (/<li[\s>]/i.test(value)) {
      for (const item of withBreaks.split(/<li[\s>]/i).slice(1)) {
        const text = plainText(item.split(/<\/li>/i)[0]);
        if (text) into.push({ kind: "step", text });
      }
      return into;
    }
    for (const line of decodeEntities(withBreaks).split(/\n+/)) {
      const text = plainText(line);
      if (text) into.push({ kind: "step", text });
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
      if (name) into.push({ kind: "section", text: name });
      instructionSteps(value.itemListElement || value.steps, into);
      return into;
    }
    if (value.itemListElement && !value.text) {
      instructionSteps(value.itemListElement, into);
      return into;
    }
    const text = plainText(value.text || value.name || "");
    if (text) into.push({ kind: "step", text });
  }
  return into;
}

function formatMethod(steps) {
  const lines = [];
  let number = 0;
  for (const step of steps) {
    if (!step.text) continue;
    if (step.kind === "section") {
      if (lines.length) lines.push("");
      lines.push(step.text);
      continue;
    }
    number += 1;
    const already = /^(?:step\s+)?\d+[.)]\s+\S/i.test(step.text);
    lines.push(already ? step.text : `${number}. ${step.text}`);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatYield(value) {
  const raw = listOf(value).map((item) => plainText(item)).filter(Boolean).join(", ");
  if (!raw) return "";
  if (/^(serves?|makes|yield)\b/i.test(raw)) return capitalise(raw);
  if (/^\d+\s*[-–]\s*\d+$/.test(raw) || /^\d+$/.test(raw)) return `Serves ${raw}`;
  const servings = raw.match(/^(\d+)\s+servings?$/i);
  if (servings) return `Serves ${servings[1]}`;
  return raw;
}

function formatSchemaTime(node) {
  const prep = labelTime("Prep", node.prepTime);
  const cook = labelTime("Cook", node.cookTime);
  if (prep || cook) return [prep, cook].filter(Boolean).join(" · ");
  const total = labelTime("Ready in", node.totalTime);
  return total;
}

function labelTime(label, value) {
  const human = humanDuration(value);
  if (!human) return "";
  if (new RegExp(`^${label}\\b`, "i").test(human)) return capitalise(human);
  return `${label} ${human}`;
}

function humanDuration(value) {
  const raw = plainText(value);
  if (!raw) return "";
  const iso = raw.toUpperCase();
  if (!iso.startsWith("P")) return raw.length <= 40 ? raw : "";
  const [datePart, timePart = ""] = iso.split("T");
  const days = numberIn(datePart, "D");
  const hours = numberIn(timePart, "H");
  const mins = numberIn(timePart, "M");
  const total = days * 24 * 60 + hours * 60 + mins;
  if (!total) return "";
  const wholeHours = Math.floor(total / 60);
  const remainder = total % 60;
  const parts = [];
  if (wholeHours === 1) parts.push("1 hour");
  else if (wholeHours > 1) parts.push(`${wholeHours} hours`);
  if (remainder === 1) parts.push("1 min");
  else if (remainder > 1) parts.push(`${remainder} mins`);
  return parts.join(" ");
}

function numberIn(iso, unit) {
  const match = iso.match(new RegExp(`(\\d+)${unit}`));
  return match ? Number(match[1]) : 0;
}

function firstImage(value, pageUrl) {
  const urls = [];
  const visit = (item) => {
    if (!item) return;
    if (typeof item === "string") urls.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (typeof item === "object") visit(item.url || item.contentUrl || "");
  };
  visit(value);
  for (const item of urls) {
    try {
      const absolute = new URL(item, pageUrl || undefined);
      if (absolute.protocol === "http:" || absolute.protocol === "https:") return absolute.href;
    } catch {
      // Skip a broken image address and try the next one.
    }
  }
  return "";
}

function findSections(lines) {
  const sections = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const classified = classifyLine(lines[index]);
    if (classified.kind === "ingredients" || classified.kind === "method" || classified.kind === "notes" || classified.kind === "stop") {
      if (current) sections.push(current);
      current = { kind: classified.kind, start: index, lines: [] };
      if (classified.rest) {
        const pieces = classified.kind === "ingredients" ? splitInlineList(classified.rest) : [classified.rest];
        current.lines.push(...pieces);
      }
      continue;
    }
    if (!current) continue;
    if (classified.kind === "subhead") {
      if (classified.rest) current.lines.push(classified.rest);
      continue;
    }
    if (classified.kind === "heading") {
      sections.push(current);
      current = null;
      continue;
    }
    current.lines.push(lines[index]);
  }
  if (current) sections.push(current);
  return sections;
}

function classifyLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return { kind: "blank" };
  if (/\]\(/.test(trimmed) || /^https?:\/\//i.test(trimmed)) return { kind: "skip" };
  const withoutHash = trimmed.replace(/^#{1,6}\s+/, "");
  const colon = withoutHash.match(/^([^:]{1,40}?)\s*:\s*(.*)$/);
  const labelSource = colon ? colon[1] : withoutHash;
  const label = labelSource
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[*_]+/g, "")
    .trim();
  const header = headerKind(label);
  if (header === "subhead") return { kind: "subhead", text: tidyHeading(label), rest: colon ? colon[2].trim() : "" };
  if (header) return { kind: header, rest: colon ? colon[2].trim() : "" };
  if (/^#{1,6}\s+\S/.test(trimmed)) return { kind: "heading", text: trimmed };
  return { kind: "text", text: trimmed };
}

function headerKind(label) {
  const text = label.replace(/[:：]\s*$/, "").trim();
  if (!text || text.length > 40) return null;
  if (/^(?:ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|what you need)$/i.test(text)) return "ingredients";
  if (/^(?:method|methods|instructions?|directions?|steps|how to(?: make(?: it)?)?)$/i.test(text)) return "method";
  if (/^(?:notes?|tips?|hints?)$/i.test(text)) return "notes";
  if (/^(?:nutrition|nutrition information|more like this|you may also like|related recipes?)$/i.test(text)) return "stop";
  if (/^for the [\p{L}\s]{2,28}$/iu.test(text)) return "subhead";
  return null;
}

function scoreIngredientSection(section) {
  return section.lines.reduce((sum, line) => sum + (looksLikeIngredient(line) ? 1 : 0), 0);
}

function ingredientLinesFrom(lines) {
  const items = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || isServingLine(trimmed) || isTimeLine(trimmed)) continue;
    if (/^#{1,6}\s+/.test(trimmed) || /https?:\/\//i.test(trimmed) || /\]\(/.test(trimmed)) continue;
    if (/^for the [\p{L}\s]+$/iu.test(trimmed)) continue;
    const inline = splitInlineList(trimmed);
    for (const part of inline) {
      const cleaned = cleanIngredient(part);
      if (cleaned) items.push(cleaned);
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

function cleanIngredient(line) {
  return line
    .replace(/^\s*(?:[-*•·–—]|\d+[.)\]])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function methodLinesFrom(lines) {
  const steps = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || isServingLine(trimmed) || isTimeLine(trimmed)) continue;
    if (/^#{1,6}\s+/.test(trimmed) || /\]\(/.test(trimmed) || /^https?:\/\//i.test(trimmed)) continue;
    const text = trimmed.replace(/^\s*(?:[-*•·–—])\s+/, "").trim();
    if (text) steps.push({ kind: "step", text });
  }
  return steps;
}

function titleBefore(lines, index) {
  for (let cursor = index - 1; cursor >= 0 && index - cursor < 25; cursor -= 1) {
    const trimmed = lines[cursor].trim();
    if (!trimmed) continue;
    if (readPlainTitle([trimmed])) return readPlainTitle([trimmed]);
    if (looksLikeTitle(trimmed)) return trimmed;
    if (isServingLine(trimmed) || isTimeLine(trimmed) || /\]\(/.test(trimmed)) continue;
    if (trimmed.length > 90) continue;
  }
  return "";
}

function readPlainTitle(lines) {
  for (const line of lines.slice(0, 8)) {
    const match = line.trim().match(/^Title:\s*(.+)$/i);
    if (match && looksLikeTitle(match[1])) return match[1].trim();
  }
  return "";
}

function looseRecipe(lines, titleFromHeader) {
  const content = [];
  const metaSource = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^title:\s*/i.test(trimmed) || /^url source:\s*/i.test(trimmed)) continue;
    if (/^markdown content:\s*$/i.test(trimmed)) continue;
    metaSource.push(trimmed);
    content.push(trimmed);
  }
  const meta = metaFromLines(metaSource);
  let name = tidyName(titleFromHeader);
  const ingredients = [];
  const methodBits = [];
  let seenIngredient = false;
  for (const line of content) {
    if (isServingLine(line) || isTimeLine(line)) continue;
    if (!name && looksLikeTitle(line) && !looksLikeIngredient(line)) {
      name = tidyName(line);
      continue;
    }
    if (looksLikeIngredient(line) || (seenIngredient && looksLikeBareIngredient(line))) {
      seenIngredient = true;
      const cleaned = cleanIngredient(line);
      if (cleaned) ingredients.push(cleaned);
      continue;
    }
    if (line.length > 1 && !/\]\(/.test(line) && !/^https?:\/\//i.test(line)) methodBits.push(line.replace(/^\s*(?:[-*•·–—])\s+/, ""));
  }
  const method = formatMethod(methodBits.map((text) => ({ kind: "step", text })));
  if (!name && ingredients.length === 0 && !method) return null;
  return {
    name: name || "",
    ingredients,
    method,
    servings: meta.servings,
    time: meta.time,
    image: "",
    sourceUrl: "",
  };
}

function metaFromLines(lines) {
  let servings = "";
  const times = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    const serving = servingFrom(trimmed);
    if (serving && !servings) servings = serving;
    const time = timeFrom(trimmed);
    if (time && !times.includes(time)) times.push(time);
  }
  return { servings, time: times.join(" · ") };
}

function servingFrom(line) {
  const text = line.replace(/^#+\s*/, "").trim();
  const trailing = text.match(/^(\d+)\s+servings?$/i);
  if (trailing) return `Serves ${trailing[1]}`;
  const match = text.match(/^(serves?|servings?|makes|yield)\b\s*[:\-]?\s*(.+)$/i);
  if (!match) return "";
  const rest = match[2].trim().replace(/[.\s]+$/, "");
  const label = /^makes/i.test(match[1]) ? "Makes" : "Serves";
  if (/^\d+\s*[-–]\s*\d+$/.test(rest) || /^\d+$/.test(rest)) return `${label} ${rest}`;
  if (!rest) return "";
  return `${label} ${rest}`;
}

function timeFrom(line) {
  const text = line.replace(/^#+\s*/, "").trim();
  const match = text.match(/^(prep(?:aration)?(?:\s*time)?|cook(?:ing)?(?:\s*time)?|total(?:\s*time)?|ready in)\b\s*[:\-]?\s*(.+)$/i);
  if (!match) return "";
  const label = /^prep/i.test(match[1])
    ? "Prep"
    : /^cook/i.test(match[1])
      ? "Cook"
      : /^total|^ready/i.test(match[1])
        ? "Ready in"
        : "Time";
  const value = match[2].trim().replace(/[.\s]+$/, "");
  if (!value || value.length > 40) return "";
  return `${label} ${value}`;
}

function isServingLine(line) {
  return Boolean(servingFrom(line));
}

function isTimeLine(line) {
  return Boolean(timeFrom(line));
}

function looksLikeIngredient(line) {
  const text = cleanIngredient(line);
  if (!text || text.length > 140) return false;
  if (/https?:\/\//i.test(text) || /\]\(/.test(text)) return false;
  if (isServingLine(text) || isTimeLine(text)) return false;
  // 100g, 1/2 tsp, 2 large eggs, and ½ onion. A word boundary after the digits
  // would miss "100g" because the unit letter is still a word character.
  if (/^(?:\d+(?:[./]\d+)?(?:[a-zA-Z]|\s+\S)|\d+\s+\d+\/\d+|[½¼¾⅓⅔⅛⅜⅝⅞])/.test(text)) return true;
  if (/^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+\S/i.test(text) && text.split(/\s+/).length <= 14) return true;
  if (/\b(?:pinch|handful|bunch|cloves?|tins?|cans?|splash|drizzle|knob|slices?|rashers?|sprigs?|sticks?)\b/i.test(text) && text.split(/\s+/).length <= 14) return true;
  return false;
}

function looksLikeBareIngredient(line) {
  const text = cleanIngredient(line);
  if (!text || /[.!?]$/.test(text)) return false;
  const words = text.split(/\s+/);
  return words.length > 0 && words.length <= 5 && !isServingLine(text) && !isTimeLine(text);
}

function looksLikeTitle(line) {
  const text = tidyName(line);
  if (!text || text.length > 80) return false;
  if (looksLikeIngredient(text) || isServingLine(text) || isTimeLine(text)) return false;
  if (/https?:\/\//i.test(text) || /\]\(/.test(text) || /^title:\s*/i.test(line)) return false;
  const words = text.split(/\s+/);
  if (words.length > 14) return false;
  if (/[.!?]$/.test(text) && words.length > 8) return false;
  return true;
}

function tidyName(value) {
  return String(value || "")
    .replace(/^#+\s*/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/^\p{Extended_Pictographic}+\s*/u, "")
    .replace(/\s+\p{Extended_Pictographic}+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyHeading(value) {
  return capitalise(value.replace(/\s+/g, " ").trim());
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
