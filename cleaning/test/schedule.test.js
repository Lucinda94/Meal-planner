import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, nextVisitOnOrAfter } from "../js/dates.js";
import { buildSeed } from "../js/demo-data.js";
import { formatFrequency, latestCompletion, taskStatus, tasksWithStatus } from "../js/dueness.js";
import { STORAGE_KEY } from "../js/config.js";
import { createDemoRepository, memoryStorage, normaliseCode } from "../js/store.js";

const tuesday = new Date(2026, 9, 27, 12, 0, 0);

function taskById(state, id) {
  for (const home of state.homes) {
    for (const room of home.rooms) {
      const task = room.tasks.find((item) => item.id === id);
      if (task) return { home, room, task };
    }
  }
  return null;
}

function stateOf(state, id, now = tuesday) {
  const found = taskById(state, id);
  assert.ok(found, id);
  return taskStatus(found.task, { today: now, visitWeekday: found.home.visitWeekday }).state;
}

test("month maths clamps to the end of a short month", () => {
  const january = new Date(2026, 0, 31, 12);
  const february = addMonths(january, 1);
  assert.equal(february.getMonth(), 1);
  assert.equal(february.getDate(), 28);

  const march = new Date(2026, 2, 31, 12);
  const april = addMonths(march, 1);
  assert.equal(april.getMonth(), 3);
  assert.equal(april.getDate(), 30);
});

test("next visit includes today when today is the cleaning day", () => {
  assert.equal(nextVisitOnOrAfter(tuesday, "tuesday").getDate(), 27);
  assert.equal(nextVisitOnOrAfter(tuesday, "thursday").getDate(), 29);
  const sunday = nextVisitOnOrAfter(tuesday, "sunday");
  assert.equal(sunday.getDate(), 1);
  assert.equal(sunday.getMonth(), 10);
});

test("frequency wording stays in plain English", () => {
  assert.equal(formatFrequency({ unit: "visit" }), "Every visit");
  assert.equal(formatFrequency({ unit: "weeks", every: 1 }), "Every week");
  assert.equal(formatFrequency({ unit: "weeks", every: 2 }), "Every 2 weeks");
  assert.equal(formatFrequency({ unit: "months", every: 3 }), "Every 3 months");
  assert.equal(formatFrequency({ unit: "days", every: 10 }), "Every 10 days");
});

test("sample homes mix due, due soon, and not needed yet", () => {
  const state = buildSeed(tuesday);
  const expected = {
    task_helen_worktops: "due",
    task_helen_oven: "later",
    task_helen_extractor: "due",
    task_helen_shower: "due",
    task_helen_bedding: "soon",
    task_helen_windows: "later",
    task_helen_hall: "later",
    task_james_fridge: "due",
    task_james_bedding: "soon",
    task_james_hoover: "later",
    task_james_oven: "later",
    task_amina_oven: "due",
    task_amina_towels: "soon",
    task_amina_dust: "later",
    task_amina_windows: "later",
  };
  for (const [id, status] of Object.entries(expected)) {
    assert.equal(stateOf(state, id), status, id);
  }

  assert.equal(state.accounts.filter((account) => account.role === "cleaner").length, 1);
  assert.equal(state.homes.length, 3);
  for (const home of state.homes) {
    const { rows, upcoming } = tasksWithStatus(home, tuesday);
    const states = new Set(rows.map((row) => row.status.state));
    assert.ok(states.has("due"), home.id);
    assert.ok(states.has("soon"), home.id);
    assert.ok(states.has("later"), home.id);
    assert.ok(upcoming.getTime() <= tuesday.getTime() + 6 * 86400000);
  }

  const helen = tasksWithStatus(state.homes[0], tuesday);
  assert.equal(helen.upcoming.getDate(), 27);
  const james = tasksWithStatus(state.homes[1], tuesday);
  assert.equal(james.upcoming.getDate(), 29);
  const amina = tasksWithStatus(state.homes[2], tuesday);
  assert.equal(amina.upcoming.getDate(), 30);
});

test("invite codes ignore spaces, case, and hyphens", () => {
  assert.equal(normaliseCode(" maple-7k "), "MAPLE7K");
  assert.equal(normaliseCode("MAPLE-7K"), normaliseCode("maple 7k"));
});

test("customer tick is visible to the cleaner and can be undone today", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  assert.equal(stateOf(repo.getState(), "task_helen_extractor"), "due");

  await repo.setAccount("acct_helen");
  assert.equal(repo.visibleHomes().length, 1);
  const blocked = await repo.openHome("home_james");
  assert.equal(blocked.ok, false);

  const marked = await repo.markDone("home_helen", "task_helen_extractor");
  assert.equal(marked.ok, true);
  assert.equal(marked.completion.role, "customer");
  assert.equal(marked.completion.name, "Helen Cartwright");
  assert.equal(stateOf(repo.getState(), "task_helen_extractor"), "later");

  await repo.setAccount("acct_priya");
  assert.equal(repo.visibleHomes().length, 3);
  const seen = latestCompletion(taskById(repo.getState(), "task_helen_extractor").task);
  assert.equal(seen.accountId, "acct_helen");
  assert.equal(stateOf(repo.getState(), "task_helen_extractor"), "later");

  const undone = await repo.undoToday("home_helen", "task_helen_extractor");
  assert.equal(undone.ok, true);
  assert.equal(stateOf(repo.getState(), "task_helen_extractor"), "due");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_extractor").task).role, "cleaner");
});

test("editing how often moves a task back onto the due list", async () => {
  const repo = createDemoRepository({ storage: memoryStorage(), now: () => tuesday });
  await repo.load();
  await repo.setAccount("acct_helen");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");

  const saved = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_kitchen",
    name: "Clean the oven",
    frequency: { unit: "weeks", every: 1 },
  });
  assert.equal(saved.ok, true);
  assert.equal(formatFrequency(taskById(repo.getState(), "task_helen_oven").task.frequency), "Every week");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");

  const created = await repo.saveTask("home_helen", {
    roomId: "__new",
    newRoomName: "Utility",
    name: "Polish the banister",
    frequency: { unit: "weeks", every: 2 },
  });
  assert.equal(created.ok, true);
  assert.equal(stateOf(repo.getState(), created.taskId), "due");
  assert.ok(repo.getState().homes[0].rooms.some((room) => room.name === "Utility"));

  const cleanerEdit = await repo.setAccount("acct_priya").then(() =>
    repo.saveTask("home_helen", {
      roomId: "room_helen_kitchen",
      name: "Should fail",
      frequency: { unit: "visit" },
    }),
  );
  assert.equal(cleanerEdit.ok, false);
});

test("notes only save for the person who writes them", async () => {
  const repo = createDemoRepository({ storage: memoryStorage(), now: () => tuesday });
  await repo.load();
  const original = repo.getState().homes[0].cleanerNote;

  await repo.setAccount("acct_helen");
  const blocked = await repo.setNote("home_helen", "cleaner", "Helen should not write this");
  assert.equal(blocked.ok, false);
  assert.equal(repo.getState().homes[0].cleanerNote, original);

  const saved = await repo.setNote("home_helen", "customer", "Please skip the spare room.");
  assert.equal(saved.ok, true);
  assert.equal(repo.getState().homes[0].customerNote, "Please skip the spare room.");

  await repo.setAccount("acct_priya");
  const reply = await repo.setNote("home_helen", "cleaner", "I'll bring a spare cloth.");
  assert.equal(reply.ok, true);
  assert.equal(repo.getState().homes[0].cleanerNote, "I'll bring a spare cloth.");
  const wrongWay = await repo.setNote("home_helen", "customer", "Priya should not write this");
  assert.equal(wrongWay.ok, false);
  assert.equal(repo.getState().homes[0].customerNote, "Please skip the spare room.");
});

test("a matching invite code links a new home the cleaner can see", async () => {
  const repo = createDemoRepository({ storage: memoryStorage(), now: () => tuesday });
  await repo.load();
  const bad = await repo.linkHome({
    customerName: "Sam Patel",
    address: "22 Albany Street, Bristol BS6 5LL",
    visitWeekday: "monday",
    inviteCode: "NOPE",
  });
  assert.equal(bad.ok, false);
  assert.equal(repo.getState().homes.length, 3);

  const linked = await repo.linkHome({
    customerName: "Sam Patel",
    homeName: "",
    address: "22 Albany Street, Bristol BS6 5LL",
    visitWeekday: "monday",
    inviteCode: "maple 7k",
  });
  assert.equal(linked.ok, true);
  assert.equal(repo.currentAccount().name, "Sam Patel");
  assert.equal(repo.visibleHomes().length, 1);
  assert.equal(repo.visibleHomes()[0].address, "22 Albany Street, Bristol BS6 5LL");
  assert.equal(repo.visibleHomes()[0].name, "Sam's home");

  await repo.setAccount("acct_priya");
  assert.equal(repo.visibleHomes().length, 4);
  assert.ok(repo.visibleHomes().some((home) => home.customerId === linked.accountId));

  await repo.setAccount("acct_helen");
  assert.equal(repo.visibleHomes().length, 1);
  assert.equal(repo.visibleHomes()[0].id, "home_helen");
});

test("reset puts the sample homes back and keeps them on this phone", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  await repo.linkHome({
    customerName: "Sam Patel",
    address: "22 Albany Street, Bristol",
    visitWeekday: "monday",
    inviteCode: "MAPLE-7K",
  });
  await repo.reset();
  assert.equal(repo.getState().homes.length, 3);
  assert.equal(repo.currentAccount().id, "acct_priya");
  assert.equal(storage.getItem("meal-planner.v1"), null);

  const later = createDemoRepository({
    storage,
    now: () => new Date(2030, 0, 1, 12),
  });
  await later.load();
  assert.equal(later.getState().homes.length, 3);
  assert.equal(later.getState().homes[0].customerNote.includes("oven"), true);

  storage.setItem(STORAGE_KEY, "{not json");
  const repaired = createDemoRepository({ storage, now: () => tuesday });
  await repaired.load();
  assert.equal(repaired.getState().homes.length, 3);
  assert.equal(repaired.getState().version, 1);
});
