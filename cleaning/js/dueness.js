import { addDays, addMonths, formatUkDate, isSameDay, nextVisitOnOrAfter, startOfDay } from "./dates.js";

export const SOON_DAYS = 14;

export function normaliseFrequency(input) {
  if (!input || typeof input !== "object") return null;
  if (input.unit === "visit") return { unit: "visit" };
  if (!["days", "weeks", "months"].includes(input.unit)) return null;
  const every = Number(input.every);
  if (!Number.isInteger(every) || every < 1 || every > 36) return null;
  return { unit: input.unit, every };
}

export function formatFrequency(frequency) {
  const value = normaliseFrequency(frequency) || { unit: "visit" };
  if (value.unit === "visit") return "Every visit";
  const every = value.every;
  if (every === 1 && value.unit === "days") return "Every day";
  if (every === 1 && value.unit === "weeks") return "Every week";
  if (every === 1 && value.unit === "months") return "Every month";
  const plural = { days: "days", weeks: "weeks", months: "months" };
  return `Every ${every} ${plural[value.unit]}`;
}

export function presetForFrequency(frequency) {
  const value = normaliseFrequency(frequency);
  if (!value || value.unit === "visit") return "visit";
  const known = [
    ["1-weeks", "weeks", 1],
    ["2-weeks", "weeks", 2],
    ["1-months", "months", 1],
    ["3-months", "months", 3],
  ];
  const match = known.find(([, unit, every]) => value.unit === unit && value.every === every);
  return match ? match[0] : "custom";
}

export function frequencyFromPreset(preset, every, unit) {
  if (preset === "visit") return { unit: "visit" };
  if (preset === "1-weeks") return { unit: "weeks", every: 1 };
  if (preset === "2-weeks") return { unit: "weeks", every: 2 };
  if (preset === "1-months") return { unit: "months", every: 1 };
  if (preset === "3-months") return { unit: "months", every: 3 };
  return normaliseFrequency({ unit, every: Number(every) });
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
