import { addDays, addMonths, addYears, formatUkDate, isSameDay, nextVisitOnOrAfter, startOfDay } from "./dates.js";

export const SOON_DAYS = 14;
export const MAX_EVERY = 99;

const UNIT_ALIASES = {
  day: "days",
  days: "days",
  week: "weeks",
  weeks: "weeks",
  month: "months",
  months: "months",
  year: "years",
  years: "years",
  visit: "visit",
  visits: "visit",
};

const INTERVAL_UNITS = ["days", "weeks", "months", "years"];

export const FREQUENCY_UNITS = [
  ["days", "Day(s)"],
  ["weeks", "Week(s)"],
  ["months", "Month(s)"],
  ["years", "Year(s)"],
];

function normaliseUnit(unit) {
  return UNIT_ALIASES[String(unit || "").toLowerCase()] || "";
}

function wholeNumber(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Turn an older saved frequency into { every, unit }.
 * Preset ids ("2-weeks", "visit") and singular units ("week") are accepted.
 * A bad count is brought inside 1–99 so a saved task still loads.
 */
export function migrateFrequency(input) {
  if (typeof input === "string") return migrateFrequency(presetToFrequency(input));
  if (!input || typeof input !== "object" || Array.isArray(input)) return { every: 1, unit: "visit" };
  if (input.unit == null && input.preset) return migrateFrequency(presetToFrequency(input.preset, input.every, input.unit));
  const unit = normaliseUnit(input.unit);
  if (unit === "visit") return { every: 1, unit: "visit" };
  if (!INTERVAL_UNITS.includes(unit)) return { every: 1, unit: "visit" };
  let every = wholeNumber(input.every);
  if (every == null || every < 1) every = 1;
  if (every > MAX_EVERY) every = MAX_EVERY;
  return { unit, every };
}

function presetToFrequency(preset, every, unit) {
  const id = String(preset || "").trim().toLowerCase();
  if (id === "visit" || id === "every-visit" || id === "every visit") return { every: 1, unit: "visit" };
  if (id === "1-weeks") return { unit: "weeks", every: 1 };
  if (id === "2-weeks") return { unit: "weeks", every: 2 };
  if (id === "1-months") return { unit: "months", every: 1 };
  if (id === "3-months") return { unit: "months", every: 3 };
  if (id === "custom") return { unit, every };
  return { every: 1, unit: "visit" };
}

/** Strict read of a frequency object. Invalid values are rejected, not guessed. */
export function normaliseFrequency(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const unit = normaliseUnit(input.unit);
  if (unit === "visit") return { every: 1, unit: "visit" };
  if (!INTERVAL_UNITS.includes(unit)) return null;
  const every = wholeNumber(input.every);
  if (every == null || every < 1 || every > MAX_EVERY) return null;
  return { unit, every };
}

/** Saved shape, including a lenient pass for older phones. */
export function canonicalFrequency(input) {
  return normaliseFrequency(input) || normaliseFrequency(migrateFrequency(input)) || { every: 1, unit: "visit" };
}

/** True when localStorage already holds the canonical { every, unit } object. */
export function isCanonicalFrequency(value, canonical = canonicalFrequency(value)) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("every") || !keys.includes("unit")) return false;
  return value.unit === canonical.unit && value.every === canonical.every && typeof value.every === "number";
}

/**
 * Values from the How often controls.
 * Empty, zero, negative, and numbers that are not whole are rejected.
 */
export function readFrequency(everyRaw, unitRaw) {
  const unit = normaliseUnit(unitRaw);
  if (unit === "visit") {
    const text = String(everyRaw ?? "").trim();
    if (text === "" || text === "1") return { ok: true, frequency: { every: 1, unit: "visit" } };
    return {
      ok: false,
      error: "Every visit is once each visit. Choose 1, or pick days, weeks, months, or years.",
    };
  }
  if (!INTERVAL_UNITS.includes(unit)) {
    return { ok: false, error: "Choose days, weeks, months, or years." };
  }
  const text = String(everyRaw ?? "").trim();
  if (!text) return { ok: false, error: "Enter how often this needs doing." };
  if (text.startsWith("-") || Number(text) < 0) return { ok: false, error: "Enter 1 or more." };
  if (/^\d+\.\d+$/.test(text)) return { ok: false, error: "Enter a whole number, with no decimals." };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter a whole number from 1 to 99." };
  const every = Number(text);
  if (every === 0) return { ok: false, error: "Enter 1 or more." };
  if (every > MAX_EVERY) return { ok: false, error: "Enter 99 or less." };
  return { ok: true, frequency: { unit, every } };
}

/** Prefill for the number box and the unit menu. */
export function frequencyFormValue(frequency) {
  const value = canonicalFrequency(frequency);
  return { every: String(value.every), unit: value.unit };
}

export function formatFrequency(frequency) {
  const value = canonicalFrequency(frequency);
  if (value.unit === "visit") return "Every visit";
  const every = value.every;
  if (every === 1 && value.unit === "days") return "Every day";
  if (every === 1 && value.unit === "weeks") return "Every week";
  if (every === 1 && value.unit === "months") return "Every month";
  if (every === 1 && value.unit === "years") return "Every year";
  const plural = { days: "days", weeks: "weeks", months: "months", years: "years" };
  return `Every ${every} ${plural[value.unit]}`;
}

export function latestCompletion(task) {
  const list = Array.isArray(task?.completions) ? task.completions : [];
  let best = null;
  let bestIndex = -1;
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!item?.at) continue;
    if (!best || item.at > best.at || (item.at === best.at && index > bestIndex)) {
      best = item;
      bestIndex = index;
    }
  }
  return best;
}

function addInterval(date, frequency) {
  if (frequency.unit === "days") return addDays(date, frequency.every);
  if (frequency.unit === "weeks") return addDays(date, frequency.every * 7);
  if (frequency.unit === "months") return addMonths(date, frequency.every);
  if (frequency.unit === "years") return addYears(date, frequency.every);
  return new Date(date);
}

function dueOnDate(task, today) {
  const frequency = normaliseFrequency(task.frequency);
  if (!frequency || frequency.unit === "visit") return null;
  const last = latestCompletion(task);
  if (!last) return startOfDay(today);
  const done = new Date(last.at);
  if (Number.isNaN(done.getTime())) return startOfDay(today);
  return startOfDay(addInterval(done, frequency));
}

/**
 * Due: needed on the next visit (overdue, due today, or due by that visit).
 * Due soon: not this visit, but within a fortnight.
 * Not needed yet: the last tick still covers it.
 */
export function taskStatus(task, { today, visitWeekday }) {
  const frequency = normaliseFrequency(task.frequency) || { unit: "visit" };
  const upcoming = nextVisitOnOrAfter(today, visitWeekday);

  if (frequency.unit === "visit") {
    const last = latestCompletion(task);
    if (!last || Number.isNaN(new Date(last.at).getTime())) {
      return { state: "due", label: "Due", detail: "Due this visit", dueOn: null };
    }
    const coveredVisit = nextVisitOnOrAfter(new Date(last.at), visitWeekday);
    if (upcoming.getTime() > coveredVisit.getTime()) {
      return { state: "due", label: "Due", detail: "Due this visit", dueOn: null };
    }
    return { state: "later", label: "Not needed yet", detail: "Done for this visit", dueOn: null };
  }

  const dueOn = dueOnDate(task, today);
  if (dueOn.getTime() <= upcoming.getTime()) {
    if (dueOn.getTime() < startOfDay(today).getTime()) {
      return { state: "due", label: "Due", detail: `Overdue · was due ${formatUkDate(dueOn)}`, dueOn };
    }
    if (isSameDay(dueOn, today)) {
      return { state: "due", label: "Due", detail: "Due today", dueOn };
    }
    return { state: "due", label: "Due", detail: `Due this visit · ${formatUkDate(dueOn)}`, dueOn };
  }

  const soonLimit = addDays(startOfDay(today), SOON_DAYS);
  if (dueOn.getTime() <= soonLimit.getTime()) {
    return { state: "soon", label: "Due soon", detail: `Due ${formatUkDate(dueOn)}`, dueOn };
  }
  return { state: "later", label: "Not needed yet", detail: `Next due ${formatUkDate(dueOn)}`, dueOn };
}

export function tasksWithStatus(home, today) {
  const rows = [];
  for (const room of home.rooms || []) {
    for (const task of room.tasks || []) {
      rows.push({
        room,
        task,
        status: taskStatus(task, { today, visitWeekday: home.visitWeekday }),
      });
    }
  }
  const upcoming = nextVisitOnOrAfter(today, home.visitWeekday);
  return { upcoming, rows };
}

export function countByState(rows) {
  return {
    due: rows.filter((row) => row.status.state === "due").length,
    soon: rows.filter((row) => row.status.state === "soon").length,
    later: rows.filter((row) => row.status.state === "later").length,
  };
}

function isOverdue(status, today) {
  if (status.state !== "due" || !status.dueOn) return false;
  return status.dueOn.getTime() < startOfDay(today).getTime();
}

/** One row per room, in the home's room order, with due and overdue counts. */
export function roomSummaries(home, today) {
  const { rows } = tasksWithStatus(home, today);
  return (home?.rooms || []).map((room) => {
    const tasks = rows.filter((row) => row.room.id === room.id);
    const due = tasks.filter((row) => row.status.state === "due");
    return {
      id: room.id,
      name: room.name,
      taskCount: tasks.length,
      dueCount: due.length,
      overdueCount: due.filter((row) => isOverdue(row.status, today)).length,
    };
  });
}

/** Labels for a room card. Due includes overdue. */
export function roomCardModel(summary) {
  const taskLabel =
    summary.taskCount === 1 ? "1 task" : summary.taskCount === 0 ? "No tasks" : `${summary.taskCount} tasks`;
  const dueLabel = summary.dueCount === 1 ? "1 due" : summary.dueCount === 0 ? "Nothing due" : `${summary.dueCount} due`;
  const overdueLabel =
    summary.overdueCount === 1 ? "1 overdue" : summary.overdueCount > 1 ? `${summary.overdueCount} overdue` : "";
  return {
    ...summary,
    taskLabel,
    dueLabel,
    detail: overdueLabel ? `${taskLabel} · ${overdueLabel}` : taskLabel,
    tone: summary.dueCount > 0 ? "due" : "ok",
  };
}

/** Tasks that are due this visit, across every room. */
export function visitOverviewModel(home, today) {
  const { rows } = tasksWithStatus(home, today);
  const due = rows.filter((row) => row.status.state === "due");
  return {
    dueCount: due.length,
    names: due.map((row) => row.task.name),
  };
}
