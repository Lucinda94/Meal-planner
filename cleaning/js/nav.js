/**
 * Bottom navigation for Tidy Together.
 *
 * Dashboard is first and is the default tab.
 * The entry with `placeholder: true` is the undecided tab: change its `label`
 * to rename it, or remove `placeholder` and render that id from app.js when
 * it gets a real page. The coming-soon copy lives in MORE_SCREEN.
 */

export const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
  { id: "more", label: "More", placeholder: true },
];

/** Shown until the placeholder tab is given a real job. */
export const MORE_SCREEN = {
  title: "Coming soon",
  body: "Nothing else lives here yet. When something new is ready, it will show up on this tab.",
};

export const SETTINGS_NOTE =
  "This is a demo. Homes, tasks, and notes stay in this browser. Nothing is sent to a server.";

const ICONS = {
  dashboard: {
    outline: `<path d="M4.5 10.8 12 4.6l7.5 6.2V19a1.2 1.2 0 0 1-1.2 1.2h-4.2v-5.4h-4.2v5.4H5.7A1.2 1.2 0 0 1 4.5 19v-8.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
    filled: `<path d="M4.2 10.7 12 4.2l7.8 6.5V19a1.4 1.4 0 0 1-1.4 1.4h-3.8v-5.6h-5.2v5.6H5.6A1.4 1.4 0 0 1 4.2 19v-8.3z" fill="currentColor"/>`,
  },
  profile: {
    outline: `<circle cx="12" cy="8" r="3.15" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.1 19.3c1-3.4 3.4-5 6.9-5s5.9 1.6 6.9 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
    filled: `<circle cx="12" cy="8" r="3.35" fill="currentColor"/><path d="M4.8 19.5c1.05-3.6 3.55-5.3 7.2-5.3s6.15 1.7 7.2 5.3c.16.55-.25.9-.78.9H5.58c-.53 0-.94-.35-.78-.9z" fill="currentColor"/>`,
  },
  settings: {
    outline: `<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>`,
    filled: `<path fill="currentColor" fill-rule="evenodd" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>`,
  },
  more: {
    outline: `<rect x="3.6" y="3.6" width="6.6" height="6.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.8" y="3.6" width="6.6" height="6.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3.6" y="13.8" width="6.6" height="6.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.8" y="13.8" width="6.6" height="6.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
    filled: `<rect x="3.4" y="3.4" width="7" height="7" rx="1.7" fill="currentColor"/><rect x="13.6" y="3.4" width="7" height="7" rx="1.7" fill="currentColor"/><rect x="3.4" y="13.6" width="7" height="7" rx="1.7" fill="currentColor"/><rect x="13.6" y="13.6" width="7" height="7" rx="1.7" fill="currentColor"/>`,
  },
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleLabel(role) {
  if (role === "cleaner") return "Cleaner";
  if (role === "customer") return "Customer";
  return "Account";
}

export function normaliseTab(id) {
  return TABS.some((tab) => tab.id === id) ? id : TABS[0].id;
}

/** The tab that still shows the coming-soon screen. Null if that flag is removed. */
export function placeholderTab() {
  return TABS.find((tab) => tab.placeholder) || null;
}

function tabIcon(id, active) {
  const icon = ICONS[id] || ICONS.more;
  return `<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">${active ? icon.filled : icon.outline}</svg>`;
}

export function renderTabBar(activeId) {
  const active = normaliseTab(activeId);
  const buttons = TABS.map((tab) => {
    const on = tab.id === active;
    const current = on ? ` aria-current="page"` : "";
    return `<button type="button" class="tab${on ? " is-active" : ""}" id="tab-${esc(tab.id)}" data-action="show-tab" data-tab="${esc(tab.id)}"${current}>${tabIcon(tab.id, on)}<span class="tab-label">${esc(tab.label)}</span></button>`;
  }).join("");
  return `<nav class="tab-bar" id="tab-bar" aria-label="Main">${buttons}</nav>`;
}

/**
 * What Profile shows for the account currently being viewed.
 * A cleaner gets their invite code and the homes they look after.
 * A customer gets their homes and the cleaner linked to each one.
 */
export function profileModel(state) {
  const accounts = Array.isArray(state?.accounts) ? state.accounts : [];
  const homes = Array.isArray(state?.homes) ? state.homes : [];
  const account = accounts.find((item) => item.id === state?.view?.accountId) || null;
  if (!account) {
    return { name: "", role: "", roleLabel: "", inviteCode: "", homes: [] };
  }
  const linked = homes.filter((home) =>
    account.role === "cleaner" ? home.cleanerId === account.id : home.customerId === account.id,
  );
  return {
    name: account.name || "",
    role: account.role || "",
    roleLabel: roleLabel(account.role),
    inviteCode: account.role === "cleaner" ? account.inviteCode || "" : "",
    homes: linked.map((home) => ({
      id: home.id,
      name: home.name || "",
      address: home.address || "",
      visitWeekday: home.visitWeekday || "",
      customerName: accounts.find((item) => item.id === home.customerId)?.name || "",
      cleanerName: accounts.find((item) => item.id === home.cleanerId)?.name || "",
    })),
  };
}
