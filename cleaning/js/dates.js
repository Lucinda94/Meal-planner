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
