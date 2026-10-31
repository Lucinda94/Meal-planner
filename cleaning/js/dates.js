export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayIndex(weekday) {
  const index = WEEKDAYS.indexOf(String(weekday || "").toLowerCase());
  return index === -1 ? 1 : index;
}

export function normaliseWeekday(weekday) {
  const id = String(weekday || "").toLowerCase();
  return WEEKDAYS.includes(id) ? id : "monday";
}

export function weekdayLabel(weekday, { plural = false } = {}) {
  const id = normaliseWeekday(weekday);
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  return plural ? `${name}s` : name;
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date, months) {
  const copy = new Date(date);
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return copy;
}

/** Calendar years. 29 Feb lands on 28 Feb when the target year is not a leap year. */
export function addYears(date, years) {
  return addMonths(date, years * 12);
}

export function daysBetween(from, to) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function nextVisitOnOrAfter(date, weekday) {
  const start = startOfDay(date);
  const delta = (weekdayIndex(weekday) - start.getDay() + 7) % 7;
  return addDays(start, delta);
}

export function formatDate(date) {
  const value = new Date(date);
  return `${SHORT_DAYS[value.getDay()]} ${value.getDate()} ${MONTHS[value.getMonth()]}`;
}

/** Day, month, year, as in 12 Oct 2026. */
export function formatUkDate(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

/** Value for `<input type="date">`, using the local calendar day. */
export function toDateInputValue(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Read a date-picker value (YYYY-MM-DD) as local noon.
 * An empty value is allowed and means no date.
 * Do not use `new Date("YYYY-MM-DD")` — that is UTC midnight and can land on the previous day.
 */
export function parseDateInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, date: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { ok: false, date: null, error: "That date isn't valid." };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { ok: false, date: null, error: "That date isn't valid." };
  }
  return { ok: true, date };
}

export function formatWhen(date, today) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(date);
}

export function atNoonDaysAgo(today, days) {
  const copy = startOfDay(today);
  copy.setDate(copy.getDate() - days);
  copy.setHours(12, 0, 0, 0);
  return copy;
}
