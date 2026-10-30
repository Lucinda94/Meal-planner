import { APP_NAME } from "./config.js";
import {
  WEEKDAYS,
  formatUkDate,
  formatWhen,
  isSameDay,
  normaliseWeekday,
  parseDateInput,
  startOfDay,
  toDateInputValue,
  weekdayLabel,
} from "./dates.js";
import {
  FREQUENCY_UNITS,
  countByState,
  formatFrequency,
  frequencyFormValue,
  latestCompletion,
  readFrequency,
  roomCardModel,
  roomSummaries,
  tasksWithStatus,
  visitOverviewModel,
} from "./dueness.js";
import { MORE_SCREEN, SETTINGS_NOTE, normaliseTab, placeholderTab, profileModel, renderTabBar } from "./nav.js";
import { addedByLabel, createDemoRepository, firstName, shortAddress } from "./store.js";

const repo = createDemoRepository();
const ui = {
  tab: "dashboard",
  sheet: null,
  doneOn: null,
  confirmReset: false,
  pendingDelete: null,
  menu: null,
  toast: null,
  linkError: "",
  profileError: "",
  link: emptyLink(),
  notes: {},
  scrollToId: "",
};
let toastTimer = 0;

function emptyLink() {
  return {
    customerName: "",
    homeName: "",
    address: "",
    visitWeekday: "monday",
    inviteCode: "",
  };
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function today() {
  return new Date();
}

function accountName(state, id) {
  return state.accounts.find((account) => account.id === id)?.name || "Home";
}

function customerOf(state, home) {
  return state.accounts.find((account) => account.id === home.customerId) || null;
}

function cleanerOf(state, home) {
  return state.accounts.find((account) => account.id === home.cleanerId) || null;
}

function orderedAccounts(state) {
  const cleaners = state.accounts.filter((account) => account.role === "cleaner");
  const customers = state.accounts.filter((account) => account.role === "customer");
  const ordered = [];
  for (const home of state.homes) {
    const customer = customers.find((account) => account.id === home.customerId);
    if (customer && !ordered.includes(customer)) ordered.push(customer);
  }
  for (const customer of customers) {
    if (!ordered.includes(customer)) ordered.push(customer);
  }
  return [...cleaners, ...ordered];
}

function optionLabel(state, account) {
  if (account.role === "cleaner") return `${account.name} · cleaner`;
  const home = state.homes.find((item) => item.customerId === account.id);
  return `${account.name} · ${home ? shortAddress(home.address) : "new home"}`;
}

function cardAddress(address) {
  return String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

function preview(text, max = 88) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trim()}…`;
}

function noteKey(homeId, kind) {
  return `${homeId}:${kind}`;
}

function noteDraft(home, kind) {
  const key = noteKey(home.id, kind);
  if (Object.prototype.hasOwnProperty.call(ui.notes, key)) return ui.notes[key];
  return kind === "customer" ? home.customerNote || "" : home.cleanerNote || "";
}

function lastDoneText(task, viewer, now) {
  const last = latestCompletion(task);
  if (!last) return "Not done yet";
  const when = new Date(last.at);
  if (Number.isNaN(when.getTime())) return "Not done yet";
  const who = last.accountId === viewer?.id ? "you" : firstName(last.name);
  if (isSameDay(when, now)) return `Done today by ${who}`;
  return `Last done ${formatUkDate(when)} by ${who}`;
}

function lastDoneInputValue(task) {
  const last = latestCompletion(task);
  if (!last) return "";
  const when = new Date(last.at);
  if (Number.isNaN(when.getTime())) return "";
  return toDateInputValue(when);
}

function dateFaceText(kind, value) {
  const parsed = parseDateInput(value);
  if (!String(value || "").trim()) return kind === "done-on" ? "Choose a date" : "Not done yet";
  if (!parsed.ok) return "That date isn't valid";
  if (startOfDay(parsed.date).getTime() > startOfDay(today()).getTime()) return "That date is in the future";
  return formatUkDate(parsed.date);
}

function dateHintFor(kind, value) {
  const blank =
    kind === "done-on"
      ? "Choose the day it was actually done. A future day isn't allowed."
      : "Leave this blank if it has never been done. It will show as due.";
  if (!String(value || "").trim()) return blank;
  const parsed = parseDateInput(value);
  if (!parsed.ok) return parsed.error;
  if (startOfDay(parsed.date).getTime() > startOfDay(today()).getTime()) {
    return "That date is in the future. Choose today or an earlier day.";
  }
  const shown = formatUkDate(parsed.date);
  if (kind === "done-on") return `Shows as ${shown}. The next due date is worked out from this day.`;
  return `Shows as ${shown}. Saving updates when it is next due.`;
}

function dateField(options) {
  const empty = !String(options.value || "").trim();
  return `<div class="date-wrap">
    <div class="date-face${empty ? " is-empty" : ""}" id="${esc(options.faceId)}" aria-hidden="true">${esc(dateFaceText(options.kind, options.value))}</div>
    <input id="${esc(options.id)}" name="${esc(options.name)}" type="date" lang="en-GB" max="${esc(toDateInputValue(today()))}" autocomplete="off" value="${esc(options.value)}" aria-describedby="${esc(options.hintId)}" data-date-hint="${esc(options.kind)}" data-date-face="${esc(options.faceId)}"${options.required ? " required" : ""} />
  </div>`;
}

function writeDateHint(input) {
  if (!input) return;
  const hint = document.getElementById(input.getAttribute("aria-describedby") || "");
  if (hint) hint.textContent = dateHintFor(input.dataset.dateHint, input.value);
  const face = document.getElementById(input.dataset.dateFace || "");
  if (!face) return;
  const parsed = parseDateInput(input.value);
  const ready = parsed.ok && parsed.date && startOfDay(parsed.date).getTime() <= startOfDay(today()).getTime();
  face.textContent = dateFaceText(input.dataset.dateHint, input.value);
  face.classList.toggle("is-empty", !ready);
}

function doneToday(task, now) {
  const last = latestCompletion(task);
  if (!last) return false;
  const when = new Date(last.at);
  return !Number.isNaN(when.getTime()) && isSameDay(when, now);
}

function logo() {
  return `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#146056"/><path d="M9 22.5 24 11l15 11.5V38a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V22.5z" fill="#fff8ef"/><path d="M20.5 39V28.5h7V39" fill="#e0b15c"/></svg>`;
}

function chevron() {
  return `<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function backIcon() {
  return `<svg class="icon-back" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function moreIcon() {
  return `<svg class="icon-more" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>`;
}

function visibleHome(state) {
  const homes = repo.visibleHomes();
  if (!state.view.homeId) return homes[0] || null;
  return homes.find((home) => home.id === state.view.homeId) || null;
}

function renderRoleSwitch(state) {
  const current = repo.currentAccount();
  const options = orderedAccounts(state)
    .map((account) => {
      const selected = account.id === current?.id ? " selected" : "";
      return `<option value="${esc(account.id)}"${selected}>${esc(optionLabel(state, account))}</option>`;
    })
    .join("");
  return `<label class="field" for="role-switch">Viewing as
      <select id="role-switch">${options}</select>
    </label>`;
}

function pageHead(title, lede = "") {
  return `<header class="hero">
    <div class="brand-row">${logo()}<p class="brand">${esc(APP_NAME)}</p></div>
    <h1>${esc(title)}</h1>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
  </header>`;
}

function renderHeader(state) {
  const account = repo.currentAccount();
  const view = state.view;
  const home = visibleHome(state);
  let back = "";
  let title = APP_NAME;
  let lede = "";

  const room = home && view.screen === "room"
    ? home.rooms.find((item) => item.id === view.roomId) || null
    : null;

  if (view.screen === "link") {
    const backLabel = account?.role === "cleaner" ? "Homes" : "Back";
    back = `<button type="button" class="back" data-action="back">${backIcon()} ${esc(backLabel)}</button>`;
    title = "Link a home";
    lede = "Enter the code your cleaner gave you. This links the home to their list.";
  } else if (room && home) {
    const card = roomCardModel(
      roomSummaries(home, today()).find((item) => item.id === room.id) || {
        id: room.id,
        name: room.name,
        taskCount: room.tasks.length,
        dueCount: 0,
        overdueCount: 0,
      },
    );
    back = `<button type="button" class="back" id="back-rooms" data-action="show-rooms" data-home="${esc(home.id)}">${backIcon()} Rooms</button>`;
    title = room.name;
    lede = card.dueCount ? `${card.taskLabel} · ${card.dueLabel}` : card.taskLabel;
  } else if (account?.role === "cleaner" && view.screen === "visit" && home) {
    const customer = customerOf(state, home);
    back = `<button type="button" class="back" id="back-rooms" data-action="show-rooms" data-home="${esc(home.id)}">${backIcon()} Rooms</button>`;
    title = customer?.name || home.name;
    lede = "What's due this visit";
  } else if (account?.role === "cleaner" && home && (view.screen === "home" || view.screen === "room")) {
    const customer = customerOf(state, home);
    back = `<button type="button" class="back" data-action="back">${backIcon()} Homes</button>`;
    title = customer?.name || home.name;
    const now = today();
    const { upcoming } = tasksWithStatus(home, now);
    lede = `${home.address} · Next visit ${formatWhen(upcoming, now)}`;
  } else if (account?.role === "cleaner") {
    title = `Hello, ${firstName(account.name)}`;
    lede = "Tap a home to see what's due this visit.";
  } else if (home && account) {
    const cleaner = cleanerOf(state, home);
    title = "Your home";
    lede = `${home.address}. Linked with ${cleaner ? cleaner.name : "your cleaner"}.`;
  } else if (account) {
    title = `Hello, ${firstName(account.name)}`;
    lede = "Link your home with the code from your cleaner.";
  }

  return `<header class="hero">
    <div class="brand-row">${logo()}<p class="brand">${esc(APP_NAME)}</p></div>
    ${back}
    <h1>${esc(title)}</h1>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
  </header>`;
}

function renderMain(state) {
  const account = repo.currentAccount();
  const warning = repo.saveWarning();
  const banner = warning ? `<p class="banner" role="status">${esc(warning)}</p>` : "";
  let body = "";
  const onHome = state.view.screen === "home" || state.view.screen === "room" || state.view.screen === "visit";
  if (state.view.screen === "link") body = renderLink(state);
  else if (account?.role === "cleaner" && (!onHome || !visibleHome(state))) body = renderOverview(state);
  else body = renderHome(state, account);
  return `<main id="main">${banner}${body}</main>`;
}

function renderOverview(state) {
  const now = today();
  const homes = repo.visibleHomes().slice().sort((a, b) => {
    const aVisit = tasksWithStatus(a, now).upcoming.getTime();
    const bVisit = tasksWithStatus(b, now).upcoming.getTime();
    if (aVisit !== bVisit) return aVisit - bVisit;
    return accountName(state, a.customerId).localeCompare(accountName(state, b.customerId), "en-GB");
  });
  const account = repo.currentAccount();
  const cards = homes.length
    ? `<div class="home-list">${homes.map((home) => renderHomeCard(state, home, now)).join("")}</div>`
    : `<div class="empty"><p>No homes yet. Share your code and a customer can link theirs.</p></div>`;
  return `<section class="invite">
      <h2>Your invite code</h2>
      <p class="code" id="invite-code">${esc(account?.inviteCode || "")}</p>
      <p>Share this with a customer. They enter it to link their home to you.</p>
      <div class="row">
        <button type="button" class="btn primary" data-action="copy-code">Copy code</button>
        <button type="button" class="btn ghost" data-action="share-code">Share</button>
      </div>
    </section>
    ${cards}`;
}

function renderHomeCard(state, home, now) {
  const { upcoming, rows } = tasksWithStatus(home, now);
  const counts = countByState(rows);
  const badge = counts.due
    ? `<span class="badge due">${counts.due} due</span>`
    : `<span class="badge ok">Nothing due</span>`;
  const soon = counts.soon ? `<span class="soon-line">${counts.soon} due soon</span>` : "";
  const note = preview(home.customerNote);
  return `<button type="button" class="home-card" data-action="open-home" data-home="${esc(home.id)}">
    <span class="home-top">
      <span class="home-name">${esc(accountName(state, home.customerId))}</span>
      ${badge}
    </span>
    <span class="address">${esc(cardAddress(home.address))}</span>
    <span class="when">${esc(formatWhen(upcoming, now))} · ${esc(weekdayLabel(home.visitWeekday, { plural: true }))}</span>
    ${soon}
    ${note ? `<span class="preview">${esc(note)}</span>` : ""}
    ${chevron()}
  </button>`;
}

function renderHome(state, account) {
  const home = visibleHome(state);
  if (!home || !account) {
    return `<div class="empty"><p>Link a home to start a cleaning schedule.</p>
      <button type="button" class="btn primary" data-action="show-link">Link a new home</button></div>`;
  }
  const now = today();
  const room = state.view.screen === "room"
    ? home.rooms.find((item) => item.id === state.view.roomId) || null
    : null;
  if (room) return renderRoomView(home, account, room, now);
  if (state.view.screen === "visit" && account.role === "cleaner") return renderVisitScreen(state, home, account, now);
  return renderRoomList(state, home, account, now);
}

function customerNoteBlock(state, home) {
  const customer = customerOf(state, home);
  const name = customer ? firstName(customer.name) : "The customer";
  const fromCustomer = home.customerNote
    ? `<blockquote class="note-card quote"><p class="note-label">Note from ${esc(name)}</p><p class="note-body">${esc(home.customerNote)}</p></blockquote>`
    : `<p class="quiet">No note from ${esc(name)} for this visit.</p>`;
  return { name, fromCustomer };
}

function renderRoomList(state, home, account, now) {
  const { rows } = tasksWithStatus(home, now);
  const counts = countByState(rows);
  const isCustomer = account.role === "customer";
  const cards = renderRoomCards(home, now);
  const add = addTaskButton(home);
  if (isCustomer) {
    const summary = rows.length
      ? `<p class="summary"><span class="pill due">${counts.due} due</span><span class="pill soon">${counts.soon} due soon</span><span class="pill later">${counts.later} not needed yet</span></p>`
      : "";
    const empty = rows.length
      ? ""
      : `<div class="empty">
          <p>Add rooms and tasks for this home. For example, clean the oven every 3 months, or hoover every week.</p>
          <button type="button" class="btn ghost" data-action="starter" data-home="${esc(home.id)}">Add a starter set</button>
        </div>`;
    return `${summary}${renderVisitEditor(home)}${add}${empty}${cards}${renderCustomerNotes(state, home)}`;
  }
  const { name, fromCustomer } = customerNoteBlock(state, home);
  const empty = rows.length
    ? ""
    : `<div class="empty"><p>No tasks yet. Add one, with the room and how often it needs doing.</p></div>`;
  return `${fromCustomer}${renderVisitCard(home, now)}${add}${empty}${cards}${renderCleanerReply(home, name)}`;
}

function renderVisitScreen(state, home, account, now) {
  const { rows } = tasksWithStatus(home, now);
  const { fromCustomer } = customerNoteBlock(state, home);
  return `${fromCustomer}${renderCleanerTasks(home, account, rows, now)}`;
}

function renderRoomCards(home, now) {
  const cards = roomSummaries(home, now).map(roomCardModel);
  if (!cards.length) return "";
  return `<h2 class="rooms-heading">Rooms</h2><div class="home-list">${cards.map((card) => renderRoomCard(home, card)).join("")}</div>`;
}

function renderRoomCard(home, card) {
  return `<button type="button" class="home-card room-card" data-action="open-room" data-home="${esc(home.id)}" data-room="${esc(card.id)}">
    <span class="home-top">
      <span class="home-name">${esc(card.name)}</span>
      <span class="badge ${esc(card.tone)}">${esc(card.dueLabel)}</span>
    </span>
    <span class="address">${esc(card.detail)}</span>
    ${chevron()}
  </button>`;
}

function renderVisitCard(home, now) {
  const overview = visitOverviewModel(home, now);
  const badge = overview.dueCount
    ? `<span class="badge due">${overview.dueCount === 1 ? "1 due" : `${overview.dueCount} due`}</span>`
    : `<span class="badge ok">Nothing due</span>`;
  const names = overview.names.slice(0, 3);
  const more = overview.names.length > 3 ? "…" : "";
  const line = names.length
    ? `<span class="preview">${esc(names.join(" · "))}${more}</span>`
    : `<span class="address">See what can wait, across every room</span>`;
  return `<button type="button" class="home-card visit-card" data-action="show-visit" data-home="${esc(home.id)}">
    <span class="home-top">
      <span class="home-name">What's due this visit</span>
      ${badge}
    </span>
    ${line}
    ${chevron()}
  </button>`;
}

function renderRoomView(home, account, room, now) {
  const rows = tasksWithStatus(home, now).rows.filter((row) => row.room.id === room.id);
  const add = addTaskButton(home, room.id);
  if (!rows.length) {
    return `${add}<div class="empty"><p>No tasks in this room yet.</p></div>`;
  }
  const order = { due: 0, soon: 1, later: 2 };
  const tasks = rows
    .slice()
    .sort((a, b) => order[a.status.state] - order[b.status.state])
    .map(({ task, status }) => renderTaskArticle(home, account, room, task, status, now, { showRoom: false, showPill: true }))
    .join("");
  return `${add}<section class="room">${tasks}</section>`;
}

function renderCleanerReply(home, name) {
  return `<section class="notes">
    <label class="field" for="cleaner-note">Note back to ${esc(name)}
      <textarea id="cleaner-note" data-home="${esc(home.id)}" data-kind="cleaner" maxlength="500" rows="3" placeholder="Leave a note after the visit, or ask for supplies">${esc(noteDraft(home, "cleaner"))}</textarea>
    </label>
    <button type="button" class="btn primary" data-action="save-note" data-kind="cleaner" data-home="${esc(home.id)}">Save note</button>
  </section>`;
}

function renderVisitEditor(home) {
  const options = WEEKDAYS.map((day) => {
    const selected = normaliseWeekday(home.visitWeekday) === day ? " selected" : "";
    return `<option value="${day}"${selected}>${esc(weekdayLabel(day, { plural: true }))}</option>`;
  }).join("");
  return `<label class="field" for="visit-weekday">Usual visit
    <select id="visit-weekday" data-home="${esc(home.id)}">${options}</select>
  </label>`;
}

function renderCustomerNotes(state, home) {
  const cleaner = cleanerOf(state, home);
  const cleanerName = cleaner ? firstName(cleaner.name) : "Your cleaner";
  const reply = home.cleanerNote
    ? `<blockquote class="note-card quote"><p class="note-label">${esc(cleanerName)} wrote</p><p class="note-body">${esc(home.cleanerNote)}</p></blockquote>`
    : `<p class="quiet">No note back from ${esc(cleanerName)} yet.</p>`;
  return `<section class="notes">
    <label class="field" for="customer-note">Note for ${esc(cleanerName)}
      <textarea id="customer-note" data-home="${esc(home.id)}" data-kind="customer" maxlength="500" rows="3" placeholder="Anything they should know for the next visit">${esc(noteDraft(home, "customer"))}</textarea>
    </label>
    <button type="button" class="btn primary" data-action="save-note" data-kind="customer" data-home="${esc(home.id)}">Save note</button>
    ${reply}
  </section>`;
}

function addedByMarkup(task) {
  const label = addedByLabel(task);
  return label ? `<p class="added-by">${esc(label)}</p>` : "";
}

function addTaskButton(home, roomId = "") {
  const room = roomId ? ` data-room="${esc(roomId)}"` : "";
  return `<div class="page-actions"><button type="button" class="btn primary" data-action="add-task" data-home="${esc(home.id)}"${room}>Add a task</button></div>`;
}

function menuOpenFor(home, task) {
  return ui.menu?.homeId === home.id && ui.menu?.taskId === task.id;
}

function taskMenu(home, task) {
  const open = menuOpenFor(home, task);
  const menuId = `menu-${task.id}`;
  const pop = open
    ? `<div class="menu-pop" id="${esc(menuId)}" role="menu">
        <button type="button" class="menu-item" role="menuitem" data-action="done-on" data-home="${esc(home.id)}" data-task="${esc(task.id)}">Done on a different day?</button>
        <button type="button" class="menu-item" role="menuitem" data-action="edit-task" data-home="${esc(home.id)}" data-task="${esc(task.id)}">Edit</button>
        <button type="button" class="menu-item menu-delete" role="menuitem" data-action="ask-delete" data-home="${esc(home.id)}" data-task="${esc(task.id)}">Delete</button>
      </div>`
    : "";
  return `<div class="task-menu">
    <button type="button" class="menu-toggle" data-action="toggle-menu" data-home="${esc(home.id)}" data-task="${esc(task.id)}" aria-label="Options for ${esc(task.name)}" aria-haspopup="menu" aria-expanded="${open ? "true" : "false"}"${open ? ` aria-controls="${esc(menuId)}"` : ""}>${moreIcon()}</button>
  </div>${pop}`;
}

function taskActions(home, task, now) {
  const todayDone = doneToday(task, now);
  const verb = todayDone ? "Undo" : "Mark done";
  const action = todayDone ? "undo" : "done";
  const style = todayDone ? "ghost" : "primary";
  return `<div class="task-actions">
    <button type="button" class="btn ${style}" data-action="${action}" data-home="${esc(home.id)}" data-task="${esc(task.id)}" aria-label="${esc(verb)}: ${esc(task.name)}">${verb}</button>
    <button type="button" class="text-action" data-action="done-on" data-home="${esc(home.id)}" data-task="${esc(task.id)}">Done on a different day?</button>
  </div>`;
}

function renderTaskArticle(home, account, room, task, status, now, { showRoom = false, showPill = false } = {}) {
  const freq = showRoom
    ? `${room.name} · ${formatFrequency(task.frequency)}`
    : formatFrequency(task.frequency);
  const pill = showPill ? `<p><span class="pill ${esc(status.state)}">${esc(status.label)}</span></p>` : "";
  return `<article class="task" id="task-${esc(task.id)}">
    <div class="task-body">
      <div class="task-head">
        <h3>${esc(task.name)}</h3>
        ${taskMenu(home, task)}
      </div>
      <p class="freq">${esc(freq)}</p>
      ${pill}
      <p class="detail ${esc(status.state)}">${esc(status.detail)}</p>
      <p class="meta">${esc(lastDoneText(task, account, now))}</p>
      ${addedByMarkup(task)}
    </div>
    ${taskActions(home, task, now)}
  </article>`;
}

function renderCleanerTasks(home, account, rows, now) {
  const add = addTaskButton(home);
  if (!rows.length) {
    return `${add}<div class="empty"><p>No tasks yet. Add one, with the room and how often it needs doing.</p></div>`;
  }
  const groups = [
    ["due", "Due this visit", "Nothing is due this visit."],
    ["soon", "Due soon", ""],
    ["later", "Not needed yet", ""],
  ];
  const groupsHtml = groups
    .map(([stateName, title, empty]) => {
      const items = rows.filter((row) => row.status.state === stateName);
      if (!items.length && !empty) return "";
      const list = items.length
        ? items
            .map(({ room, task, status }) => renderTaskArticle(home, account, room, task, status, now, { showRoom: true }))
            .join("")
        : `<p class="quiet">${esc(empty)}</p>`;
      return `<section class="group ${esc(stateName)}">
        <div class="section-head"><h2>${esc(title)}</h2><span class="count">${items.length}</span></div>
        ${list}
      </section>`;
    })
    .join("");
  return `${add}${groupsHtml}`;
}

function renderLink(state) {
  const cleaners = state.accounts.filter((account) => account.role === "cleaner");
  const hint = cleaners.length
    ? `Demo tip: ${cleaners.map((account) => `${firstName(account.name)}'s code is ${account.inviteCode}`).join(". ")}.`
    : "";
  const days = WEEKDAYS.map((day) => {
    const selected = ui.link.visitWeekday === day ? " selected" : "";
    return `<option value="${day}"${selected}>${esc(weekdayLabel(day, { plural: true }))}</option>`;
  }).join("");
  const error = ui.linkError ? `<p class="form-error" role="alert">${esc(ui.linkError)}</p>` : "";
  return `<form id="link-form" class="sheet-form" novalidate>
    ${error}
    <label class="field" for="customer-name">Your name
      <input id="customer-name" name="customerName" type="text" maxlength="80" autocomplete="name" enterkeyhint="next" required value="${esc(ui.link.customerName)}" />
    </label>
    <label class="field" for="home-name">Home name <span class="optional">(optional)</span>
      <input id="home-name" name="homeName" type="text" maxlength="40" autocomplete="off" enterkeyhint="next" placeholder="For example, Maple Road" value="${esc(ui.link.homeName)}" />
    </label>
    <label class="field" for="address">Address
      <input id="address" name="address" type="text" maxlength="120" autocomplete="street-address" enterkeyhint="next" required value="${esc(ui.link.address)}" />
    </label>
    <label class="field" for="link-day">Usual visit
      <select id="link-day" name="visitWeekday">${days}</select>
    </label>
    <label class="field" for="invite-code">Invite code
      <input id="invite-code" name="inviteCode" type="text" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="done" required value="${esc(ui.link.inviteCode)}" />
    </label>
    ${hint ? `<p class="quiet">${esc(hint)}</p>` : ""}
    <div class="page-actions">
      <button type="submit" class="btn primary">Link home</button>
    </div>
  </form>`;
}

function renderToast() {
  if (!ui.toast) return "";
  const undo = ui.toast.undo
    ? `<button type="button" class="btn ghost" data-action="undo" data-home="${esc(ui.toast.undo.homeId)}" data-task="${esc(ui.toast.undo.taskId)}">Undo</button>`
    : "";
  return `<div class="toast" role="status">${esc(ui.toast.message)}${undo}</div>`;
}

function renderModal() {
  if (ui.confirmReset) return renderResetDialog();
  if (ui.pendingDelete) return renderDeleteDialog();
  if (ui.doneOn) return renderDoneOnSheet();
  if (ui.sheet) return renderTaskSheet();
  return "";
}

function renderResetDialog() {
  return `<div class="backdrop center">
    <div class="sheet dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div class="sheet-body">
        <h2 id="reset-title">Reset demo data?</h2>
        <p>This puts Priya's three sample homes back, and removes notes, tasks, and homes added on this phone.</p>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn primary" data-action="confirm-reset">Reset demo data</button>
        <button type="button" class="btn ghost" data-action="cancel-reset">Cancel</button>
      </div>
    </div>
  </div>`;
}

function renderDeleteDialog() {
  const name = ui.pendingDelete?.name || "this task";
  return `<div class="backdrop center">
    <div class="sheet dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy">
      <div class="sheet-body">
        <h2 id="delete-title">Delete "${esc(name)}"?</h2>
        <p id="delete-copy">This can't be undone.</p>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" id="cancel-delete" data-action="cancel-delete">Cancel</button>
        <button type="button" class="btn danger" data-action="confirm-delete">Delete</button>
      </div>
    </div>
  </div>`;
}

function frequencyControl(sheet) {
  const units = FREQUENCY_UNITS.map(([id, label]) => {
    const selected = sheet.unit === id ? " selected" : "";
    return `<option value="${id}"${selected}>${esc(label)}</option>`;
  }).join("");
  const visit = sheet.unit === "visit" ? `<option value="visit" selected>Visit</option>` : "";
  return `<fieldset class="frequency">
    <legend>How often</legend>
    <div class="frequency-row">
      <span class="frequency-prefix" aria-hidden="true">Every</span>
      <label class="field frequency-every" for="every">
        <span class="sr-only">How many</span>
        <input id="every" name="every" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="99" step="1" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(sheet.every)}" />
      </label>
      <label class="field frequency-unit" for="unit">
        <span class="sr-only">Day, week, month, or year</span>
        <select id="unit" name="unit">${visit}${units}</select>
      </label>
    </div>
  </fieldset>`;
}

function renderTaskSheet() {
  const home = repo.homeById(ui.sheet.homeId);
  if (!home) return "";
  const sheet = ui.sheet;
  const title = sheet.mode === "edit" ? "Edit task" : "Add a task";
  const roomChoices = home.rooms
    .map((room) => {
      const selected = sheet.roomId === room.id ? " selected" : "";
      return `<option value="${esc(room.id)}"${selected}>${esc(room.name)}</option>`;
    })
    .join("");
  const newSelected = sheet.roomId === "__new" || home.rooms.length === 0 ? " selected" : "";
  const showNew = sheet.roomId === "__new" || home.rooms.length === 0;
  const roomField = home.rooms.length
    ? `<label class="field" for="room-id">Room
        <select id="room-id" name="roomId">${roomChoices}<option value="__new"${newSelected}>New room…</option></select>
      </label>
      <label class="field" id="new-room-field" for="new-room-name"${showNew ? "" : " hidden"}>New room name
        <input id="new-room-name" name="newRoomName" type="text" maxlength="40" autocomplete="off" value="${esc(sheet.newRoomName)}" />
      </label>`
    : `<label class="field" for="new-room-name">Room
        <input id="new-room-name" name="newRoomName" type="text" maxlength="40" autocomplete="off" placeholder="Kitchen, bathroom, bedroom…" value="${esc(sheet.newRoomName)}" required />
      </label>`;
  const error = sheet.error ? `<p class="form-error" role="alert">${esc(sheet.error)}</p>` : "";
  return `<div class="backdrop">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="task-title">
      <form id="task-form" novalidate>
        <div class="sheet-body">
          <h2 id="task-title">${title}</h2>
          ${error}
          <label class="field" for="task-name">Task
            <input id="task-name" name="name" type="text" maxlength="80" autocomplete="off" enterkeyhint="next" required value="${esc(sheet.name)}" />
          </label>
          ${roomField}
          ${frequencyControl(sheet)}
          <label class="field" for="last-done">Last done <span class="optional">(optional)</span>
            ${dateField({ id: "last-done", name: "lastDone", kind: "last-done", faceId: "last-done-face", hintId: "last-done-hint", value: sheet.lastDone })}
          </label>
          <p class="date-hint" id="last-done-hint">${esc(dateHintFor("last-done", sheet.lastDone))}</p>
          <button type="button" class="text-action" data-action="clear-last-done">Not done yet</button>
        </div>
        <div class="sheet-actions">
          <button type="submit" class="btn primary">Save task</button>
          <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderDoneOnSheet() {
  const done = ui.doneOn;
  if (!done) return "";
  const error = done.error ? `<p class="form-error" role="alert">${esc(done.error)}</p>` : "";
  return `<div class="backdrop">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <form id="done-on-form" novalidate>
        <div class="sheet-body">
          <h2 id="done-title">Done on a different day?</h2>
          <p>Mark "${esc(done.name)}" done on the day it was actually finished. The usual Mark done button still means today.</p>
          ${error}
          <label class="field" for="done-on">When was it done?
            ${dateField({ id: "done-on", name: "doneOn", kind: "done-on", faceId: "done-on-face", hintId: "done-on-hint", value: done.date, required: true })}
          </label>
          <p class="date-hint" id="done-on-hint">${esc(dateHintFor("done-on", done.date))}</p>
        </div>
        <div class="sheet-actions">
          <button type="submit" class="btn primary">Mark done on this day</button>
          <button type="button" class="btn ghost" data-action="close-done-on">Cancel</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderCleanerProfile(model) {
  const homes = model.homes.length
    ? model.homes
        .map(
          (home) => `<div class="link-row">
            <p class="home-name">${esc(home.customerName || home.name)}</p>
            <p class="address">${esc(home.address)}</p>
          </div>`,
        )
        .join("")
    : `<p class="quiet">No homes linked yet. Share your code and a customer can link theirs.</p>`;
  return `<section class="panel">
      <h2>Invite code</h2>
      <p class="code" id="invite-code">${esc(model.inviteCode)}</p>
      <p>Share this with a customer. They enter it to link their home to you.</p>
      <div class="row">
        <button type="button" class="btn primary" data-action="copy-code">Copy code</button>
        <button type="button" class="btn ghost" data-action="share-code">Share</button>
      </div>
    </section>
    <section class="panel">
      <h2>Homes</h2>
      ${homes}
    </section>`;
}

function renderCustomerProfile(model) {
  if (!model.homes.length) {
    return `<section class="panel">
      <h2>Your home</h2>
      <p class="quiet">No home linked yet.</p>
      <button type="button" class="btn primary" data-action="show-link">Link a new home</button>
    </section>`;
  }
  const homeTitle = model.homes.length > 1 ? "Your homes" : "Your home";
  const homes = model.homes
    .map(
      (home) => `<div class="link-row">
        <p class="home-name">${esc(home.name)}</p>
        <p class="address">${esc(home.address)}</p>
        <p class="when">Usual visit ${esc(weekdayLabel(home.visitWeekday, { plural: true }))}</p>
      </div>`,
    )
    .join("");
  const cleanerNames = [...new Set(model.homes.map((home) => home.cleanerName).filter(Boolean))];
  const cleanerTitle = cleanerNames.length > 1 ? "Your cleaners" : "Your cleaner";
  const cleaners = cleanerNames.length
    ? `<section class="panel">
        <h2>${cleanerTitle}</h2>
        ${cleanerNames.map((name) => `<p class="person-name">${esc(name)}</p>`).join("")}
      </section>`
    : `<section class="panel"><h2>Your cleaner</h2><p class="quiet">No cleaner linked yet.</p></section>`;
  return `<section class="panel"><h2>${homeTitle}</h2>${homes}</section>${cleaners}`;
}

function renderProfile(state) {
  const model = profileModel(state);
  if (!model.role) {
    return `${pageHead("Profile")}
      <main id="main"><div class="empty"><p>No demo user is selected.</p></div></main>`;
  }
  const error = ui.profileError ? `<p class="form-error" role="alert">${esc(ui.profileError)}</p>` : "";
  const links = model.role === "cleaner" ? renderCleanerProfile(model) : renderCustomerProfile(model);
  return `${pageHead("Profile")}
    <main id="main">
      <section class="panel">
        <form id="profile-form" novalidate>
          ${error}
          <label class="field" for="display-name">Display name
            <input id="display-name" name="displayName" type="text" maxlength="80" autocomplete="name" enterkeyhint="done" required value="${esc(model.name)}" />
          </label>
          <p class="quiet">Tasks you mark done from now on use this name.</p>
          <button type="submit" class="btn primary">Save name</button>
        </form>
        <dl class="facts">
          <div><dt>Role</dt><dd>${esc(model.roleLabel)}</dd></div>
        </dl>
      </section>
      ${links}
    </main>`;
}

function renderSettings(state) {
  return `${pageHead("Settings")}
    <main id="main">
      <section class="panel">
        <h2>Demo</h2>
        <p>${esc(SETTINGS_NOTE)}</p>
        ${renderRoleSwitch(state)}
        <div class="stack">
          <button type="button" class="btn ghost" data-action="show-link">Link a new home</button>
          <button type="button" class="btn ghost" data-action="ask-reset">Reset demo data</button>
        </div>
      </section>
    </main>`;
}

function renderPlaceholder() {
  const tab = placeholderTab();
  return `${pageHead(tab?.label || "More")}
    <main id="main">
      <section class="panel coming-soon">
        <h2>${esc(MORE_SCREEN.title)}</h2>
        <p>${esc(MORE_SCREEN.body)}</p>
      </section>
    </main>`;
}

function renderScreen(state) {
  const tab = normaliseTab(ui.tab);
  if (tab === "profile") return renderProfile(state);
  if (tab === "settings") return renderSettings(state);
  const placeholder = placeholderTab();
  if (placeholder && tab === placeholder.id) return renderPlaceholder();
  return `${renderHeader(state)}${renderMain(state)}`;
}

function mountTabBar(active) {
  const html = renderTabBar(active);
  const existing = document.getElementById("tab-bar");
  if (existing) existing.outerHTML = html;
  else document.body.insertAdjacentHTML("beforeend", html);
  const bar = document.getElementById("tab-bar");
  const modalOpen = Boolean(ui.sheet || ui.doneOn || ui.confirmReset || ui.pendingDelete);
  bar?.toggleAttribute("inert", modalOpen);
}

function render(options = {}) {
  const root = document.querySelector("#app");
  const state = repo.getState();
  const y = options.scroll === "top" ? 0 : window.scrollY;
  root.innerHTML = `${renderScreen(state)}${renderToast()}${renderModal()}`;
  mountTabBar(ui.tab);
  document.body.classList.toggle("modal-open", Boolean(ui.sheet || ui.doneOn || ui.confirmReset || ui.pendingDelete));
  if (options.scroll === "top") window.scrollTo(0, 0);
  else window.scrollTo(0, y);
  if (ui.scrollToId) {
    document.getElementById(ui.scrollToId)?.scrollIntoView({ block: "center" });
    ui.scrollToId = "";
  }
  if (options.focus) document.getElementById(options.focus)?.focus();
}

function showToast(toast, options = {}) {
  ui.toast = toast;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    render({ scroll: "keep" });
  }, 6000);
  render(options);
}

function clearTransient() {
  ui.sheet = null;
  ui.doneOn = null;
  ui.confirmReset = false;
  ui.pendingDelete = null;
  ui.menu = null;
  ui.toast = null;
  ui.linkError = "";
  ui.profileError = "";
  ui.notes = {};
  clearTimeout(toastTimer);
}

function findTaskInHome(homeId, taskId) {
  const home = repo.homeById(homeId);
  for (const room of home?.rooms || []) {
    const task = room.tasks.find((item) => item.id === taskId);
    if (task) return { home, room, task };
  }
  return null;
}

function readLinkForm() {
  const form = document.getElementById("link-form");
  if (!form) return;
  const data = new FormData(form);
  ui.link = {
    customerName: String(data.get("customerName") || ""),
    homeName: String(data.get("homeName") || ""),
    address: String(data.get("address") || ""),
    visitWeekday: normaliseWeekday(data.get("visitWeekday")),
    inviteCode: String(data.get("inviteCode") || ""),
  };
}

function dismissToast() {
  ui.toast = null;
  clearTimeout(toastTimer);
}

function openTaskSheet({ homeId, task = null, roomId = "" }) {
  ui.menu = null;
  ui.pendingDelete = null;
  ui.doneOn = null;
  dismissToast();
  if (task) {
    const frequency = frequencyFormValue(task.frequency);
    ui.sheet = {
      mode: "edit",
      homeId,
      taskId: task.id,
      roomId: roomId || "__new",
      newRoomName: "",
      name: task.name,
      every: frequency.every,
      unit: frequency.unit,
      lastDone: lastDoneInputValue(task),
      error: "",
    };
  } else {
    ui.sheet = {
      mode: "create",
      homeId,
      taskId: null,
      roomId: roomId || "__new",
      newRoomName: "",
      name: "",
      every: "1",
      unit: "weeks",
      lastDone: "",
      error: "",
    };
  }
  render({ focus: "task-name" });
}

function openDoneOn(homeId, taskId) {
  const found = findTaskInHome(homeId, taskId);
  ui.menu = null;
  dismissToast();
  if (!found) {
    render();
    return;
  }
  ui.sheet = null;
  ui.pendingDelete = null;
  ui.confirmReset = false;
  ui.doneOn = { homeId, taskId: found.task.id, name: found.task.name, date: "", error: "" };
  render({ focus: "done-on" });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-999px";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (copyError) {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  const insideMenu = Boolean(event.target.closest(".task-menu, .menu-pop"));
  if (event.target.classList?.contains("backdrop")) {
    ui.sheet = null;
    ui.doneOn = null;
    ui.confirmReset = false;
    ui.pendingDelete = null;
    ui.menu = null;
    render();
    return;
  }
  // A tap outside the menu only closes it. That includes Mark done, so opening
  // the menu cannot tick the task off by accident.
  if (ui.menu && !insideMenu) {
    ui.menu = null;
    const action = button?.dataset.action;
    const tick = action === "done" || action === "undo";
    if (!button || tick) {
      render();
      return;
    }
  }
  if (!button) return;
  const action = button.dataset.action;
  const homeId = button.dataset.home || repo.getState().view.homeId;
  const taskId = button.dataset.task || "";

  if (action === "toggle-menu") {
    const same = ui.menu && ui.menu.homeId === homeId && ui.menu.taskId === taskId;
    ui.menu = same ? null : { homeId, taskId };
    render();
    return;
  }
  if (action === "show-tab") {
    ui.menu = null;
    ui.profileError = "";
    ui.tab = normaliseTab(button.dataset.tab);
    render({ scroll: "top", focus: `tab-${ui.tab}` });
    return;
  }
  if (action === "ask-reset") {
    ui.confirmReset = true;
    ui.sheet = null;
    ui.menu = null;
    ui.pendingDelete = null;
    render();
    return;
  }
  if (action === "cancel-reset") {
    ui.confirmReset = false;
    render();
    return;
  }
  if (action === "confirm-reset") {
    clearTransient();
    ui.link = emptyLink();
    await repo.reset();
    showToast({ message: "Demo data reset." }, { scroll: "top" });
    return;
  }
  if (action === "show-link") {
    ui.tab = "dashboard";
    ui.sheet = null;
    ui.linkError = "";
    await repo.showLinkForm();
    render({ scroll: "top", focus: "customer-name" });
    return;
  }
  if (action === "back") {
    ui.sheet = null;
    await repo.cancelLink();
    if (repo.getState().view.screen === "home" && repo.currentAccount()?.role === "cleaner") {
      await repo.setAccount(repo.currentAccount().id);
    }
    render({ scroll: "top" });
    return;
  }
  if (action === "open-home") {
    const result = await repo.openHome(button.dataset.home);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't open that home." });
      return;
    }
    render({ scroll: "top" });
    return;
  }
  if (action === "copy-code" || action === "share-code") {
    const code = repo.currentAccount()?.inviteCode || "";
    if (action === "share-code" && navigator.share) {
      try {
        await navigator.share({
          title: APP_NAME,
          text: `Link your home in ${APP_NAME} with my code: ${code}`,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    const ok = await copyText(code);
    showToast({ message: ok ? "Code copied." : "Select the code and copy it." });
    return;
  }
  if (action === "save-note") {
    const kind = button.dataset.kind;
    const field = document.getElementById(kind === "customer" ? "customer-note" : "cleaner-note");
    const result = await repo.setNote(homeId, kind, field ? field.value : "");
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't save the note." });
      return;
    }
    delete ui.notes[noteKey(homeId, kind)];
    showToast({ message: "Note saved." });
    return;
  }
  if (action === "done") {
    const result = await repo.markDone(homeId, taskId);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't mark that done." });
      return;
    }
    showToast({ message: "Marked done.", undo: { homeId, taskId } });
    return;
  }
  if (action === "undo") {
    const result = await repo.undoToday(homeId, taskId);
    ui.toast = null;
    clearTimeout(toastTimer);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't undo that." });
      return;
    }
    showToast({ message: "Undone." });
    return;
  }
  if (action === "open-room") {
    ui.menu = null;
    const result = await repo.openRoom(button.dataset.home, button.dataset.room);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't open that room." });
      return;
    }
    render({ scroll: "top" });
    return;
  }
  if (action === "show-rooms") {
    ui.menu = null;
    const result = await repo.showRooms(homeId);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't open the rooms." });
      return;
    }
    render({ scroll: "top" });
    return;
  }
  if (action === "show-visit") {
    ui.menu = null;
    const result = await repo.showVisitOverview(homeId);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't open what's due." });
      return;
    }
    render({ scroll: "top" });
    return;
  }
  if (action === "add-task") {
    const home = repo.homeById(homeId);
    const roomId = button.dataset.room || home?.rooms[0]?.id || "__new";
    openTaskSheet({ homeId, roomId });
    return;
  }
  if (action === "edit-task") {
    ui.menu = null;
    const found = findTaskInHome(homeId, taskId);
    if (!found) {
      render();
      return;
    }
    openTaskSheet({ homeId, task: found.task, roomId: found.room.id });
    return;
  }
  if (action === "done-on") {
    openDoneOn(homeId, taskId);
    return;
  }
  if (action === "clear-last-done") {
    const input = document.getElementById("last-done");
    if (input) {
      input.value = "";
      writeDateHint(input);
      input.focus();
    }
    return;
  }
  if (action === "close-sheet") {
    ui.sheet = null;
    render();
    return;
  }
  if (action === "close-done-on") {
    ui.doneOn = null;
    render();
    return;
  }
  if (action === "ask-delete") {
    ui.menu = null;
    const found = findTaskInHome(homeId, taskId);
    if (!found) {
      render();
      return;
    }
    ui.sheet = null;
    ui.pendingDelete = { homeId, taskId: found.task.id, name: found.task.name };
    render({ focus: "cancel-delete" });
    return;
  }
  if (action === "cancel-delete") {
    ui.pendingDelete = null;
    render();
    return;
  }
  if (action === "confirm-delete") {
    if (!ui.pendingDelete) return;
    const target = ui.pendingDelete;
    ui.pendingDelete = null;
    const result = await repo.deleteTask(target.homeId, target.taskId);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't delete that task." });
      return;
    }
    const view = repo.getState().view;
    if (view.screen === "room") {
      const home = repo.homeById(view.homeId);
      const stillThere = home?.rooms.some((room) => room.id === view.roomId);
      if (!stillThere) await repo.showRooms(target.homeId);
    }
    showToast({ message: "Task deleted." });
    return;
  }
  if (action === "starter") {
    const result = await repo.addStarterSet(homeId);
    if (!result.ok) {
      showToast({ message: result.error || "Couldn't add starter tasks." });
      return;
    }
    showToast({ message: "Starter tasks added. Change anything that doesn't fit." }, { scroll: "top" });
  }
}

async function handleSubmit(event) {
  if (event.target.id === "profile-form") {
    const data = new FormData(event.target);
    const result = await repo.setDisplayName(data.get("displayName"));
    if (!result.ok) {
      ui.profileError = result.error || "Couldn't save that name.";
      render({ focus: "display-name" });
      return;
    }
    ui.profileError = "";
    showToast({ message: "Name saved." });
    return;
  }
  if (event.target.id === "link-form") {
    readLinkForm();
    const result = await repo.linkHome(ui.link);
    if (!result.ok) {
      ui.linkError = result.error;
      render({ focus: "invite-code" });
      return;
    }
    ui.tab = "dashboard";
    ui.link = emptyLink();
    ui.linkError = "";
    showToast({ message: "Home linked. You're seeing it as the customer." }, { scroll: "top" });
    return;
  }
  if (event.target.id === "task-form") {
    const data = new FormData(event.target);
    const everyRaw = String(data.get("every") ?? "");
    const unitRaw = String(data.get("unit") || "");
    const frequencyResult = readFrequency(everyRaw, unitRaw);
    const roomId = String(data.get("roomId") || ui.sheet?.roomId || "__new");
    const lastDoneRaw = String(data.get("lastDone") || "");
    const parsed = parseDateInput(lastDoneRaw);
    const future = parsed.ok && parsed.date && startOfDay(parsed.date).getTime() > startOfDay(today()).getTime();
    const draft = {
      ...ui.sheet,
      name: String(data.get("name") || ""),
      roomId,
      newRoomName: String(data.get("newRoomName") || ""),
      every: everyRaw,
      unit: unitRaw,
      lastDone: lastDoneRaw,
    };
    if (!frequencyResult.ok) {
      ui.sheet = { ...draft, error: frequencyResult.error };
      render({ focus: frequencyResult.error.startsWith("Choose") ? "unit" : "every" });
      return;
    }
    if (!parsed.ok || future) {
      ui.sheet = { ...draft, error: future ? "Choose today or an earlier date." : parsed.error };
      render({ focus: "last-done" });
      return;
    }
    const homeId = ui.sheet.homeId;
    const result = await repo.saveTask(homeId, {
      taskId: ui.sheet.taskId,
      roomId,
      newRoomName: data.get("newRoomName"),
      name: data.get("name"),
      frequency: frequencyResult.frequency,
      lastDone: parsed.date,
    });
    if (!result.ok) {
      ui.sheet = { ...draft, error: result.error };
      const dateError = result.error?.includes("date") || result.error?.includes("earlier");
      render({ focus: dateError ? "last-done" : "task-name" });
      return;
    }
    const found = findTaskInHome(homeId, result.taskId);
    const screen = repo.getState().view.screen;
    if (found && (screen === "home" || (screen === "room" && found.room.id !== repo.getState().view.roomId))) {
      await repo.openRoom(homeId, found.room.id);
    }
    ui.scrollToId = `task-${result.taskId}`;
    ui.sheet = null;
    showToast({ message: "Task saved." });
    return;
  }
  if (event.target.id === "done-on-form") {
    const data = new FormData(event.target);
    const raw = String(data.get("doneOn") || "");
    const parsed = parseDateInput(raw);
    const future = parsed.ok && parsed.date && startOfDay(parsed.date).getTime() > startOfDay(today()).getTime();
    if (!parsed.ok || !parsed.date || future) {
      ui.doneOn = {
        ...ui.doneOn,
        date: raw,
        error: !parsed.ok ? parsed.error : future ? "Choose today or an earlier date." : "Choose the day it was done.",
      };
      render({ focus: "done-on" });
      return;
    }
    const target = ui.doneOn;
    const result = await repo.markDone(target.homeId, target.taskId, parsed.date);
    if (!result.ok) {
      ui.doneOn = { ...ui.doneOn, date: raw, error: result.error || "Couldn't mark that done." };
      render({ focus: "done-on" });
      return;
    }
    ui.doneOn = null;
    ui.scrollToId = `task-${target.taskId}`;
    const todayDone = isSameDay(parsed.date, today());
    showToast({
      message: todayDone ? "Marked done for today." : `Marked done on ${formatUkDate(parsed.date)}.`,
      undo: todayDone ? { homeId: target.homeId, taskId: target.taskId } : undefined,
    });
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.id === "role-switch") {
    clearTransient();
    void repo.setAccount(target.value).then(() => render({ scroll: "top" }));
    return;
  }
  if (target.id === "visit-weekday") {
    void repo.setVisitWeekday(target.dataset.home, target.value).then((result) => {
      if (!result.ok) {
        showToast({ message: result.error || "Couldn't save the visit day." });
        return;
      }
      showToast({ message: "Visit day saved." });
    });
    return;
  }
  if (target.id === "room-id") {
    const field = document.getElementById("new-room-field");
    if (field) field.hidden = target.value !== "__new";
    return;
  }
  if (target.dataset?.dateHint) writeDateHint(target);
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset?.kind && target.dataset.home) {
    ui.notes[noteKey(target.dataset.home, target.dataset.kind)] = target.value;
    return;
  }
  if (target.form?.id === "link-form") readLinkForm();
  if (target.dataset?.dateHint) writeDateHint(target);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

function bind() {
  document.addEventListener("click", (event) => {
    void handleClick(event);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form?.id === "link-form" || form?.id === "task-form" || form?.id === "done-on-form" || form?.id === "profile-form") {
      event.preventDefault();
      void handleSubmit(event);
    }
  });
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!ui.sheet && !ui.doneOn && !ui.confirmReset && !ui.pendingDelete && !ui.menu) return;
    ui.sheet = null;
    ui.doneOn = null;
    ui.confirmReset = false;
    ui.pendingDelete = null;
    ui.menu = null;
    render();
  });
}

bind();
mountTabBar(ui.tab);
void repo.load().then(() => {
  render({ scroll: "top" });
  registerServiceWorker();
});
