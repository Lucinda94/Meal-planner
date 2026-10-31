import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSeed } from "../js/demo-data.js";
import {
  MORE_SCREEN,
  SETTINGS_NOTE,
  TABS,
  normaliseTab,
  placeholderTab,
  profileModel,
  renderTabBar,
} from "../js/nav.js";

const tuesday = new Date(2026, 9, 27, 12, 0, 0);

function tabButtons(html) {
  return [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
}

test("the tab bar is four buttons, with the open tab marked current", () => {
  assert.deepEqual(
    TABS.map((tab) => tab.id),
    ["dashboard", "profile", "settings", "more"],
  );
  assert.equal(TABS[0].id, "dashboard");
  assert.equal(normaliseTab("profile"), "profile");
  assert.equal(normaliseTab("nope"), "dashboard");
  assert.equal(normaliseTab(""), "dashboard");

  const html = renderTabBar("settings");
  assert.match(html, /<nav class="tab-bar" id="tab-bar" aria-label="Main">/);
  const buttons = tabButtons(html);
  assert.equal(buttons.length, TABS.length);
  for (const button of buttons) {
    assert.match(button, /type="button"/);
    assert.match(button, /data-action="show-tab"/);
  }
  const current = buttons.filter((button) => button.includes('aria-current="page"'));
  assert.equal(current.length, 1);
  assert.match(current[0], /data-tab="settings"/);
  assert.match(current[0], /is-active/);
  assert.equal(html.includes("aria-current"), true);
  for (const tab of TABS) {
    assert.match(html, new RegExp(`data-tab="${tab.id}"`));
    assert.match(html, new RegExp(`>${tab.label}</span>`));
  }
  assert.equal((html.match(/<svg /g) || []).length, TABS.length);
  assert.match(html, /aria-hidden="true"/);

  const dashboard = renderTabBar(undefined);
  const dashboardCurrent = tabButtons(dashboard).filter((button) => button.includes('aria-current="page"'));
  assert.equal(dashboardCurrent.length, 1);
  assert.match(dashboardCurrent[0], /data-tab="dashboard"/);
});

test("the spare tab is a single placeholder that is easy to rename", () => {
  const placeholders = TABS.filter((tab) => tab.placeholder);
  assert.equal(placeholders.length, 1);
  assert.equal(placeholders[0].id, "more");
  assert.equal(placeholders[0].label, "More");
  assert.equal(placeholderTab().id, "more");
  assert.equal(MORE_SCREEN.title, "Coming soon");
  assert.match(MORE_SCREEN.body, /yet/);
  assert.match(SETTINGS_NOTE, /demo/i);
  assert.match(SETTINGS_NOTE, /this browser/i);
  assert.match(SETTINGS_NOTE, /Nothing is sent to a server/);
});

test("profile describes the cleaner and the customer from the same homes", () => {
  const state = buildSeed(tuesday);
  const priya = profileModel(state);
  assert.equal(priya.name, "Priya Adeyemi");
  assert.equal(priya.role, "cleaner");
  assert.equal(priya.roleLabel, "Cleaner");
  assert.equal(priya.inviteCode, "MAPLE-7K");
  assert.deepEqual(
    priya.homes.map((home) => home.customerName),
    ["Helen Cartwright", "James Okonkwo", "Amina Rahman"],
  );
  assert.equal(priya.homes[0].address.includes("Maple Road"), true);

  state.view = { accountId: "acct_helen", screen: "home", homeId: "home_helen" };
  const helen = profileModel(state);
  assert.equal(helen.roleLabel, "Customer");
  assert.equal(helen.inviteCode, "");
  assert.equal(helen.homes.length, 1);
  assert.equal(helen.homes[0].name, "Maple Road");
  assert.equal(helen.homes[0].cleanerName, "Priya Adeyemi");
  assert.equal(helen.homes[0].visitWeekday, "tuesday");

  state.view = { accountId: "missing", screen: "overview", homeId: null };
  assert.equal(profileModel(state).role, "");
  assert.deepEqual(profileModel(null).homes, []);
});

test("the service worker cache includes the tab bar and has been bumped", () => {
  const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(source, /const CACHE = "tidy-together-v4"/);
  assert.match(source, /js\/nav\.js/);
  assert.doesNotMatch(source, /tidy-together-v3/);
});
