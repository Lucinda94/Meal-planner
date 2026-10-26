import {
  DAYS,
  MISSING_INGREDIENTS,
  buildShoppingList,
  coerceWeek,
  defaultWeek,
  emptyWeek,
  filterRecipes,
  formatMealGroup,
  parseRecipes,
  resolveAppBase,
} from "./planner.js";

const STORAGE_KEY = "meal-planner.v1";
const TAB_KEY = "meal-planner.tab";
const WEEK_FIELDS = ["name", "whose", "ingredients"];
const RECIPE_FIELDS = ["name", "whose", "ingredients", "optional", "notes"];

let swallowNextClick = false;

const state = {
  recipes: [],
  byName: new Map(),
  week: defaultWeek(),
  includeOptional: false,
  includeSpices: false,
  ticked: {},
  tab: "week",
  openDay: null,
  activeIndex: 0,
  expanded: new Set(),
  recipeQuery: "",
};

const $ = (selector) => document.querySelector(selector);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveState() {
  const payload = {
    week: state.week,
    includeOptional: state.includeOptional,
    includeSpices: state.includeSpices,
    ticked: state.ticked,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing can block storage. The plan still works for this visit.
  }
}

function svgChevron() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="chevron"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function boot(recipes) {
  state.recipes = recipes;
  state.byName = new Map(recipes.map((recipe) => [recipe.name, recipe]));
  const saved = loadState();
  if (saved) {
    state.week = coerceWeek(saved.week) || emptyWeek();
    state.includeOptional = saved.includeOptional === true;
    state.includeSpices = saved.includeSpices === true;
    state.ticked = {};
    if (saved.ticked && typeof saved.ticked === "object") {
      for (const [key, value] of Object.entries(saved.ticked)) {
        if (value === true) state.ticked[key] = true;
      }
    }
  }
  try {
    const tab = sessionStorage.getItem(TAB_KEY);
    if (tab === "week" || tab === "recipes" || tab === "shop") state.tab = tab;
  } catch {
    // Ignore.
  }

  renderDays();
  bindChrome();
  renderRecipes();
  renderShopping();
  setTab(state.tab);
  registerServiceWorker();
}

function renderDays() {
  const root = $("#days");
  root.replaceChildren();
  for (const day of DAYS) {
    const section = document.createElement("section");
    section.className = "day";
    section.dataset.day = day.id;

    const name = document.createElement("h3");
    name.className = "day-name";
    name.id = `label-${day.id}`;
    name.textContent = day.label;

    const combo = document.createElement("div");
    combo.className = "combo";
    combo.id = `combo-${day.id}`;

    const closed = document.createElement("div");
    closed.className = "combo-closed";

    const display = document.createElement("button");
    display.type = "button";
    display.className = "combo-display";
    display.setAttribute("aria-haspopup", "listbox");
    display.setAttribute("aria-expanded", "false");
    display.setAttribute("aria-controls", `list-${day.id}`);
    const textWrap = document.createElement("span");
    textWrap.className = "combo-text";
    const value = document.createElement("span");
    value.className = "combo-value";
    value.id = `value-${day.id}`;
    const meta = document.createElement("span");
    meta.className = "combo-meta";
    meta.id = `whose-${day.id}`;
    textWrap.append(value, meta);
    const chevron = document.createElement("span");
    chevron.className = "combo-chevron";
    chevron.innerHTML = svgChevron();
    display.append(textWrap, chevron);
    display.setAttribute("aria-labelledby", `${name.id} ${value.id} ${meta.id}`);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "icon-btn clear-day";
    clear.setAttribute("aria-label", `Clear ${day.label}`);
    clear.textContent = "×";

    closed.append(display, clear);

    const editor = document.createElement("div");
    editor.className = "combo-editor";
    const row = document.createElement("div");
    row.className = "combo-row";
    const input = document.createElement("input");
    input.type = "text";
    input.id = `input-${day.id}`;
    input.className = "combo-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `list-${day.id}`);
    input.setAttribute("aria-labelledby", name.id);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.enterKeyHint = "done";
    input.placeholder = "Type to search";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn browse-day";
    closeBtn.setAttribute("aria-label", `Close the recipe list for ${day.label}`);
    closeBtn.innerHTML = svgChevron();
    row.append(input, closeBtn);

    const pop = document.createElement("div");
    pop.className = "combo-pop";
    pop.hidden = true;
    const count = document.createElement("p");
    count.className = "combo-count";
    const list = document.createElement("ul");
    list.id = `list-${day.id}`;
    list.className = "combo-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", `Recipes for ${day.label}`);
    pop.append(count, list);
    editor.append(row, pop);
    combo.append(closed, editor);

    const note = document.createElement("p");
    note.className = "day-note";
    note.id = `note-${day.id}`;

    section.append(name, combo, note);
    root.append(section);

    display.addEventListener("click", () => {
      openCombo(day.id);
    });
    clear.addEventListener("click", () => clearDay(day.id));
    closeBtn.addEventListener("click", () => {
      closeCombo();
      display.focus();
    });
    input.addEventListener("input", () => {
      state.activeIndex = 0;
      renderOptions(day.id);
    });
    input.addEventListener("keydown", (event) => onComboKeydown(event, day.id));
    input._pointerInside = false;
    input.addEventListener("blur", () => {
      input._blurTimer = window.setTimeout(() => {
        if (input._pointerInside) return;
        if (state.openDay === day.id && document.activeElement !== input) {
          closeCombo();
        }
      }, 300);
    });
    let pointerStart = null;
    pop.addEventListener("pointerdown", (event) => {
      input._pointerInside = true;
      pointerStart = { x: event.clientX, y: event.clientY };
      window.clearTimeout(input._blurTimer);
    });
    pop.addEventListener("pointerup", () => {
      input._pointerInside = false;
    });
    pop.addEventListener("pointercancel", () => {
      input._pointerInside = false;
      pointerStart = null;
    });
    // Choose on pointerup. A later synthetic click can hit a different row
    // once the keyboard closes and the page shifts, so that click is ignored.
    list.addEventListener("pointerup", (event) => {
      const option = event.target.closest("[role='option']");
      if (!option || !pointerStart) return;
      const moved = Math.abs(event.clientX - pointerStart.x) > 12 || Math.abs(event.clientY - pointerStart.y) > 12;
      pointerStart = null;
      if (moved) return;
      window.clearTimeout(input._blurTimer);
      // The synthetic click after a tap can land on whatever sits under the
      // finger once the list closes. Swallow that one click, then stop.
      swallowNextClick = true;
      window.setTimeout(() => {
        swallowNextClick = false;
      }, 400);
      chooseRecipe(day.id, option.dataset.name);
    });
  }
  for (const day of DAYS) paintDay(day.id);
}

function dayEls(dayId) {
  return {
    section: document.querySelector(`.day[data-day="${dayId}"]`),
    display: document.querySelector(`#combo-${dayId} .combo-display`),
    value: document.querySelector(`#value-${dayId}`),
    clear: document.querySelector(`#combo-${dayId} .clear-day`),
    input: document.querySelector(`#input-${dayId}`),
    pop: document.querySelector(`#combo-${dayId} .combo-pop`),
    count: document.querySelector(`#combo-${dayId} .combo-count`),
    list: document.querySelector(`#list-${dayId}`),
    whose: document.querySelector(`#whose-${dayId}`),
    note: document.querySelector(`#note-${dayId}`),
    combo: document.querySelector(`#combo-${dayId}`),
  };
}

function paintDay(dayId) {
  const els = dayEls(dayId);
  const selected = state.week[dayId];
  const recipe = selected ? state.byName.get(selected) : null;
  els.value.textContent = selected || "Choose a recipe";
  els.value.classList.toggle("is-placeholder", !selected);
  els.clear.hidden = !selected;
  els.whose.textContent = recipe && recipe.whose ? recipe.whose : "";
  if (selected && !recipe) {
    els.note.textContent = "This recipe isn't in the list any more.";
  } else if (recipe && recipe.ingredients.length === 0 && recipe.optional.length === 0) {
    els.note.textContent = MISSING_INGREDIENTS;
  } else {
    els.note.textContent = "";
  }
  const filled = DAYS.some((day) => state.week[day.id]);
  $("#clear-week").disabled = !filled;
}

function openCombo(dayId) {
  if (state.openDay && state.openDay !== dayId) closeCombo();
  state.openDay = dayId;
  const selectedIndex = state.recipes.findIndex((recipe) => recipe.name === state.week[dayId]);
  state.activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const els = dayEls(dayId);
  els.combo.classList.add("is-open");
  els.display.setAttribute("aria-expanded", "true");
  els.input.setAttribute("aria-expanded", "true");
  els.input.value = "";
  els.pop.hidden = false;
  renderOptions(dayId);
  els.input.focus({ preventScroll: true });
  settleCombo(dayId);
  requestAnimationFrame(() => settleCombo(dayId));
  window.setTimeout(() => settleCombo(dayId), 280);
}

function settleCombo(dayId) {
  if (state.openDay !== dayId) return;
  const els = dayEls(dayId);
  els.section.scrollIntoView({ block: "start", behavior: "auto" });
  fitList(els);
}

function fitList(els) {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const top = els.list.getBoundingClientRect().top;
  const room = viewportHeight - top - 12;
  els.list.style.maxHeight = `${Math.max(140, Math.min(320, room))}px`;
}

function closeCombo() {
  const dayId = state.openDay;
  if (!dayId) return;
  const els = dayEls(dayId);
  state.openDay = null;
  els.combo.classList.remove("is-open");
  els.display.setAttribute("aria-expanded", "false");
  els.input.setAttribute("aria-expanded", "false");
  els.input.removeAttribute("aria-activedescendant");
  els.pop.hidden = true;
  els.list.replaceChildren();
}

function matchingRecipes(dayId) {
  const els = dayEls(dayId);
  return filterRecipes(state.recipes, els.input.value, WEEK_FIELDS);
}

function renderOptions(dayId) {
  const els = dayEls(dayId);
  const matches = matchingRecipes(dayId);
  const query = els.input.value.trim();
  els.count.textContent = query
    ? `${matches.length} of ${state.recipes.length}`
    : `All ${state.recipes.length} recipes`;
  els.list.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "combo-empty";
    empty.textContent = "No recipes match";
    els.list.append(empty);
    els.input.removeAttribute("aria-activedescendant");
    return;
  }
  if (state.activeIndex >= matches.length) state.activeIndex = matches.length - 1;
  if (state.activeIndex < 0) state.activeIndex = 0;
  const selected = state.week[dayId];
  matches.forEach((recipe, index) => {
    const option = document.createElement("li");
    option.id = `opt-${dayId}-${index}`;
    option.setAttribute("role", "option");
    option.dataset.name = recipe.name;
    option.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");
    if (index === state.activeIndex) option.classList.add("is-active");
    const title = document.createElement("span");
    title.className = "opt-name";
    title.textContent = recipe.name;
    const meta = document.createElement("span");
    meta.className = "opt-meta";
    meta.textContent = optionMeta(recipe);
    option.append(title, meta);
    if (recipe.name === selected) {
      option.classList.add("is-current");
      const flag = document.createElement("span");
      flag.className = "sr-only";
      flag.textContent = "Current recipe";
      option.append(flag);
    }
    els.list.append(option);
  });
  fitList(els);
  const active = els.list.querySelector(".is-active");
  if (active) {
    els.input.setAttribute("aria-activedescendant", active.id);
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < els.list.scrollTop) els.list.scrollTop = top;
    else if (bottom > els.list.scrollTop + els.list.clientHeight) {
      els.list.scrollTop = bottom - els.list.clientHeight;
    }
  }
}

function optionMeta(recipe) {
  const bits = [];
  if (recipe.whose) bits.push(recipe.whose);
  if (recipe.ingredients.length === 0) bits.push(MISSING_INGREDIENTS);
  else bits.push(recipe.ingredients.slice(0, 4).join(", "));
  return bits.join(" · ");
}

function onComboKeydown(event, dayId) {
  const matches = matchingRecipes(dayId);
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (matches.length === 0) return;
    state.activeIndex = (state.activeIndex + 1) % matches.length;
    renderOptions(dayId);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (matches.length === 0) return;
    state.activeIndex = (state.activeIndex - 1 + matches.length) % matches.length;
    renderOptions(dayId);
  } else if (event.key === "Home") {
    event.preventDefault();
    state.activeIndex = 0;
    renderOptions(dayId);
  } else if (event.key === "End") {
    event.preventDefault();
    state.activeIndex = Math.max(0, matches.length - 1);
    renderOptions(dayId);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const recipe = matches[state.activeIndex];
    if (recipe) chooseRecipe(dayId, recipe.name);
  } else if (event.key === "Escape") {
    event.preventDefault();
    const display = dayEls(dayId).display;
    closeCombo();
    display.focus();
  }
}

function chooseRecipe(dayId, name) {
  state.week[dayId] = name;
  saveState();
  const display = dayEls(dayId).display;
  closeCombo();
  paintDay(dayId);
  renderShopping();
  display.focus({ preventScroll: true });
}

function clearDay(dayId) {
  if (state.openDay === dayId) closeCombo();
  state.week[dayId] = "";
  saveState();
  paintDay(dayId);
  renderShopping();
}

function clearWeek() {
  state.week = emptyWeek();
  saveState();
  if (state.openDay) closeCombo();
  for (const day of DAYS) paintDay(day.id);
  renderShopping();
}

function bindChrome() {
  $("#see-shop").addEventListener("click", () => setTab("shop"));
  $("#clear-week").addEventListener("click", () => {
    const dialog = $("#clear-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else if (window.confirm("Clear every day this week?")) clearWeek();
  });
  $("#confirm-clear").addEventListener("click", () => {
    $("#clear-dialog").close();
    clearWeek();
  });
  $("#cancel-clear").addEventListener("click", () => $("#clear-dialog").close());

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
    button.addEventListener("keydown", (event) => onTabKeydown(event, button));
  });

  $("#recipe-search").addEventListener("input", (event) => {
    state.recipeQuery = event.target.value;
    renderRecipes();
  });

  $("#include-optional").checked = state.includeOptional;
  $("#include-spices").checked = state.includeSpices;
  $("#include-optional").addEventListener("change", (event) => {
    state.includeOptional = event.target.checked;
    saveState();
    renderShopping();
  });
  $("#include-spices").addEventListener("change", (event) => {
    state.includeSpices = event.target.checked;
    saveState();
    renderShopping();
  });
  $("#clear-ticks").addEventListener("click", () => {
    state.ticked = {};
    saveState();
    renderShopping();
  });

  document.addEventListener(
    "click",
    (event) => {
      if (swallowNextClick) {
        swallowNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!state.openDay) return;
      const combo = document.querySelector(`#combo-${state.openDay}`);
      if (combo && !combo.contains(event.target)) closeCombo();
    },
    true,
  );

  window.visualViewport?.addEventListener("resize", () => {
    if (state.openDay) settleCombo(state.openDay);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openDay) {
      const display = dayEls(state.openDay).display;
      closeCombo();
      display.focus();
    }
  });
}

function onTabKeydown(event, button) {
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const index = tabs.indexOf(button);
  let next = null;
  if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
  else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
  else if (event.key === "Home") next = tabs[0];
  else if (event.key === "End") next = tabs[tabs.length - 1];
  if (!next) return;
  event.preventDefault();
  setTab(next.dataset.tab);
  next.focus();
}

function setTab(tab) {
  if (state.openDay) closeCombo();
  state.tab = tab;
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Ignore.
  }
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
  if (tab === "shop") renderShopping();
  window.scrollTo(0, 0);
}

function renderRecipes() {
  const list = $("#recipe-list");
  const matches = filterRecipes(state.recipes, state.recipeQuery, RECIPE_FIELDS);
  const count = $("#recipe-count");
  count.textContent = state.recipeQuery.trim()
    ? `${matches.length} of ${state.recipes.length} recipes`
    : `${state.recipes.length} recipes`;
  list.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "No recipes match that.";
    list.append(empty);
    return;
  }
  for (const recipe of matches) {
    const card = document.createElement("article");
    card.className = "recipe";
    const open = state.expanded.has(recipe.name);
    if (open) card.classList.add("is-open");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "recipe-head";
    head.setAttribute("aria-expanded", open ? "true" : "false");
    const titles = document.createElement("span");
    const title = document.createElement("span");
    title.className = "recipe-name";
    title.textContent = recipe.name;
    titles.append(title);
    const meta = document.createElement("span");
    meta.className = "recipe-whose";
    if (recipe.ingredients.length === 0 && recipe.optional.length === 0) {
      meta.textContent = recipe.whose
        ? `${recipe.whose} · ${MISSING_INGREDIENTS}`
        : MISSING_INGREDIENTS;
      meta.classList.add("is-missing");
    } else if (recipe.whose) {
      meta.textContent = recipe.whose;
    } else {
      meta.hidden = true;
    }
    titles.append(meta);
    const chevron = document.createElement("span");
    chevron.className = "combo-chevron";
    chevron.innerHTML = svgChevron();
    head.append(titles, chevron);

    const body = document.createElement("div");
    body.className = "recipe-body";
    body.hidden = !open;
    if (recipe.ingredients.length === 0) {
      const missing = document.createElement("p");
      missing.className = "missing";
      missing.textContent = MISSING_INGREDIENTS;
      body.append(missing);
    } else {
      body.append(detailHeading("Ingredients"));
      body.append(pillList(recipe.ingredients, "ingredient"));
    }
    if (recipe.optional.length > 0) {
      body.append(detailHeading("Optional extras"));
      body.append(pillList(recipe.optional, "optional"));
    }
    if (recipe.notes) {
      body.append(detailHeading("Notes"));
      const notes = document.createElement("p");
      notes.className = "notes";
      notes.textContent = recipe.notes;
      body.append(notes);
    }

    head.addEventListener("click", () => {
      if (state.expanded.has(recipe.name)) state.expanded.delete(recipe.name);
      else state.expanded.add(recipe.name);
      renderRecipes();
      const buttons = [...list.querySelectorAll(".recipe-head")];
      const match = buttons.find((button) => button.querySelector(".recipe-name")?.textContent === recipe.name);
      if (match) match.focus();
    });

    card.append(head, body);
    list.append(card);
  }
}

function detailHeading(text) {
  const heading = document.createElement("h3");
  heading.textContent = text;
  return heading;
}

function pillList(items, kind) {
  const wrap = document.createElement("ul");
  wrap.className = "pills";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = kind === "optional" ? "pill is-optional" : "pill";
    li.textContent = item;
    wrap.append(li);
  }
  return wrap;
}

function renderShopping() {
  const scrollY = window.scrollY;
  const activeKey = document.activeElement instanceof HTMLInputElement ? document.activeElement.dataset.key : "";
  const result = buildShoppingList(state.recipes, state.week, {
    includeOptional: state.includeOptional,
    includeSpices: state.includeSpices,
  });
  const summary = $("#shop-summary");
  const tickedCount = result.aisles.reduce(
    (sum, aisle) => sum + aisle.items.filter((item) => state.ticked[item.key]).length,
    0,
  );
  const remaining = result.itemCount - tickedCount;
  if (result.itemCount === 0 && result.notices.length === 0) {
    summary.textContent = "Nothing to buy yet.";
  } else if (result.itemCount === 0) {
    summary.textContent = "No ingredients to list.";
  } else if (remaining === 0) {
    summary.textContent = `All ${result.itemCount} ticked.`;
  } else {
    summary.textContent = `${remaining} to buy · ${tickedCount} ticked`;
  }

  const badge = $("#shop-badge");
  if (remaining > 0) {
    badge.hidden = false;
    badge.textContent = String(remaining);
  } else {
    badge.hidden = true;
    badge.textContent = "";
  }
  const shopTab = document.querySelector('[data-tab="shop"]');
  shopTab.setAttribute(
    "aria-label",
    remaining > 0 ? `Shopping list, ${remaining} to buy` : "Shopping list",
  );

  const notices = $("#shop-notices");
  notices.replaceChildren();
  for (const notice of result.notices) {
    const card = document.createElement("p");
    card.className = "notice";
    const strong = document.createElement("strong");
    strong.textContent = `${notice.dayLabel} · ${notice.recipe}`;
    card.append(strong);
    card.append(document.createTextNode(` ${notice.message}`));
    notices.append(card);
  }

  const aisles = $("#shop-aisles");
  aisles.replaceChildren();
  if (result.itemCount === 0 && result.notices.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "Add dinners in the week plan and the list will fill in.";
    aisles.append(empty);
  }

  for (const aisle of result.aisles) {
    const section = document.createElement("section");
    section.className = "aisle";
    const heading = document.createElement("h3");
    heading.className = "aisle-name";
    heading.textContent = aisle.label;
    const count = document.createElement("span");
    count.className = "aisle-count";
    count.textContent = String(aisle.items.length);
    heading.append(count);
    const items = document.createElement("div");
    items.className = "aisle-items";
    for (const item of aisle.items) {
      const label = document.createElement("label");
      label.className = "shop-item";
      if (state.ticked[item.key]) label.classList.add("is-ticked");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.key = item.key;
      input.checked = state.ticked[item.key] === true;
      input.addEventListener("change", () => {
        if (input.checked) state.ticked[item.key] = true;
        else delete state.ticked[item.key];
        saveState();
        renderShopping();
      });
      const copy = document.createElement("span");
      copy.className = "shop-copy";
      const name = document.createElement("span");
      name.className = "shop-name";
      name.textContent = item.name;
      const meals = document.createElement("span");
      meals.className = "shop-meals";
      for (const group of item.meals) {
        const line = document.createElement("span");
        line.className = "meal-line";
        line.textContent = formatMealGroup(group);
        meals.append(line);
      }
      copy.append(name, meals);
      label.append(input, copy);
      items.append(label);
    }
    section.append(heading, items);
    aisles.append(section);
  }

  const clearTicks = $("#clear-ticks");
  clearTicks.hidden = !Object.values(state.ticked).some(Boolean);
  if (activeKey) {
    const again = aisles.querySelector(`[data-key="${CSS.escape(activeKey)}"]`);
    again?.focus({ preventScroll: true });
  }
  window.scrollTo(0, scrollY);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    const base = resolveAppBase(window.location.href);
    navigator.serviceWorker.register(new URL("sw.js", base), { scope: base }).catch(() => {});
  };
  // Recipes load after window "load", so the event has often already fired.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

async function main() {
  const base = resolveAppBase(window.location.href);
  try {
    const response = await fetch(new URL("recipes.csv", base));
    if (!response.ok) throw new Error(String(response.status));
    const recipes = parseRecipes(await response.text());
    if (recipes.length === 0) throw new Error("empty");
    boot(recipes);
  } catch {
    const mainEl = $("#panel-week");
    const message = document.createElement("p");
    message.className = "notice";
    message.textContent = "The recipe list couldn't be loaded. Check your connection and try again.";
    mainEl.prepend(message);
  }
}

main();
