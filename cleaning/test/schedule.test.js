import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, addYears, formatUkDate, nextVisitOnOrAfter, parseDateInput, toDateInputValue } from "../js/dates.js";
import { buildSeed } from "../js/demo-data.js";
import {
  canonicalFrequency,
  formatFrequency,
  frequencyFormValue,
  isCanonicalFrequency,
  latestCompletion,
  readFrequency,
  roomCardModel,
  roomSummaries,
  taskStatus,
  tasksWithStatus,
  visitOverviewModel,
} from "../js/dueness.js";
import { STORAGE_KEY } from "../js/config.js";
import { addedByLabel, createDemoRepository, memoryStorage, normaliseCode } from "../js/store.js";

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

function statusOf(state, id, now = tuesday) {
  const found = taskById(state, id);
  assert.ok(found, id);
  return taskStatus(found.task, { today: now, visitWeekday: found.home.visitWeekday });
}

function stateOf(state, id, now = tuesday) {
  return statusOf(state, id, now).state;
}

test("years use calendar maths and clamp the end of February", () => {
  const january = new Date(2026, 0, 31, 12);
  const nextJanuary = addYears(january, 1);
  assert.equal(nextJanuary.getFullYear(), 2027);
  assert.equal(nextJanuary.getMonth(), 0);
  assert.equal(nextJanuary.getDate(), 31);

  const leap = new Date(2024, 1, 29, 12);
  const notLeap = addYears(leap, 1);
  assert.equal(notLeap.getFullYear(), 2025);
  assert.equal(notLeap.getMonth(), 1);
  assert.equal(notLeap.getDate(), 28);

  const nextLeap = addYears(leap, 4);
  assert.equal(nextLeap.getFullYear(), 2028);
  assert.equal(nextLeap.getMonth(), 1);
  assert.equal(nextLeap.getDate(), 29);

  const march = new Date(2026, 2, 31, 12);
  const april = addMonths(march, 1);
  assert.equal(april.getDate(), 30);
  const threeMonths = addMonths(january, 3);
  assert.equal(threeMonths.getMonth(), 3);
  assert.equal(threeMonths.getDate(), 30);
});

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
  assert.equal(formatFrequency({ every: 1, unit: "visit" }), "Every visit");
  assert.equal(formatFrequency({ unit: "days", every: 1 }), "Every day");
  assert.equal(formatFrequency({ unit: "weeks", every: 1 }), "Every week");
  assert.equal(formatFrequency({ unit: "weeks", every: 2 }), "Every 2 weeks");
  assert.equal(formatFrequency({ unit: "months", every: 3 }), "Every 3 months");
  assert.equal(formatFrequency({ unit: "months", every: 1 }), "Every month");
  assert.equal(formatFrequency({ unit: "years", every: 1 }), "Every year");
  assert.equal(formatFrequency({ unit: "years", every: 2 }), "Every 2 years");
  assert.equal(formatFrequency({ unit: "days", every: 10 }), "Every 10 days");
  assert.equal(formatFrequency({ unit: "year", every: "1" }), "Every year");
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

  await repo.setAccount("acct_priya");
  const seenByCleaner = taskById(repo.getState(), "task_helen_oven").task;
  assert.equal(seenByCleaner.name, "Clean the oven");
  assert.equal(formatFrequency(seenByCleaner.frequency), "Every week");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
});

test("cleaner and customer can each add a task the other person sees", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();

  const oven = taskById(repo.getState(), "task_helen_oven").task;
  assert.equal(oven.addedBy, undefined);
  assert.equal(addedByLabel(oven), "");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");

  await repo.setAccount("acct_priya");
  const byCleaner = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Wipe the skirting boards",
    frequency: { unit: "weeks", every: 2 },
  });
  assert.equal(byCleaner.ok, true);
  const cleanerTask = taskById(repo.getState(), byCleaner.taskId);
  assert.equal(cleanerTask.room.name, "Kitchen");
  assert.equal(cleanerTask.task.name, "Wipe the skirting boards");
  assert.equal(cleanerTask.task.addedBy, "cleaner");
  assert.equal(addedByLabel(cleanerTask.task), "Added by cleaner");
  assert.equal(formatFrequency(cleanerTask.task.frequency), "Every 2 weeks");
  assert.equal(stateOf(repo.getState(), byCleaner.taskId), "due");

  const otherHome = await repo.saveTask("home_james", {
    roomId: "room_james_kitchen",
    name: "Not Helen's",
    frequency: { unit: "visit" },
  });
  assert.equal(otherHome.ok, true);

  await repo.setAccount("acct_helen");
  const seen = taskById(repo.getState(), byCleaner.taskId);
  assert.equal(seen.task.name, "Wipe the skirting boards");
  assert.equal(seen.task.addedBy, "cleaner");
  assert.equal(repo.visibleHomes().some((home) => home.rooms.some((room) => room.tasks.some((task) => task.name === "Not Helen's"))), false);

  const foreign = await repo.saveTask("home_james", {
    roomId: "room_james_kitchen",
    name: "Helen should not add this",
    frequency: { unit: "visit" },
  });
  assert.equal(foreign.ok, false);

  const byCustomer = await repo.saveTask("home_helen", {
    roomId: "__new",
    newRoomName: "Utility",
    name: "Clean the utility floor",
    frequency: { unit: "months", every: 3 },
  });
  assert.equal(byCustomer.ok, true);
  assert.equal(taskById(repo.getState(), byCustomer.taskId).task.addedBy, "customer");
  assert.equal(addedByLabel(taskById(repo.getState(), byCustomer.taskId).task), "Added by customer");

  const kept = await repo.saveTask("home_helen", {
    taskId: byCleaner.taskId,
    roomId: "room_helen_kitchen",
    name: "Wipe the skirting boards",
    frequency: { unit: "weeks", every: 2 },
  });
  assert.equal(kept.ok, true);
  assert.equal(taskById(repo.getState(), byCleaner.taskId).task.addedBy, "cleaner");

  await repo.setAccount("acct_priya");
  const seenByCleaner = taskById(repo.getState(), byCustomer.taskId);
  assert.equal(seenByCleaner.room.name, "Utility");
  assert.equal(seenByCleaner.task.name, "Clean the utility floor");
  assert.equal(seenByCleaner.task.addedBy, "customer");
  assert.equal(formatFrequency(seenByCleaner.task.frequency), "Every 3 months");
  assert.equal(stateOf(repo.getState(), byCustomer.taskId), "due");

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.version, 1);
  assert.equal(raw.homes[0].rooms.some((room) => room.tasks.some((task) => task.id === byCleaner.taskId && task.addedBy === "cleaner")), true);
  for (const task of raw.homes[0].rooms.find((room) => room.id === "room_helen_kitchen").tasks) {
    if (task.id.startsWith("task_helen_")) assert.equal(task.addedBy, undefined);
  }
});

test("either person can edit or delete a task, and the other person sees it", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();

  const original = taskById(repo.getState(), "task_helen_oven").task;
  assert.equal(original.addedBy, undefined);
  const completions = original.completions.length;
  const note = repo.getState().homes[0].customerNote;

  await repo.setAccount("acct_priya");
  const renamed = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_bathroom",
    name: "Clean the oven and trays",
    frequency: { unit: "weeks", every: 2 },
  });
  assert.equal(renamed.ok, true);
  let oven = taskById(repo.getState(), "task_helen_oven");
  assert.equal(oven.room.name, "Bathroom");
  assert.equal(oven.task.name, "Clean the oven and trays");
  assert.equal(formatFrequency(oven.task.frequency), "Every 2 weeks");
  assert.equal(oven.task.addedBy, undefined);
  assert.equal(oven.task.completions.length, completions);
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "soon");
  assert.equal(repo.getState().homes[0].customerNote, note);

  const blank = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_bathroom",
    name: "   ",
    frequency: { unit: "visit" },
  });
  assert.equal(blank.ok, false);
  assert.equal(taskById(repo.getState(), "task_helen_oven").task.name, "Clean the oven and trays");

  await repo.setAccount("acct_helen");
  const seen = taskById(repo.getState(), "task_helen_oven");
  assert.equal(seen.room.name, "Bathroom");
  assert.equal(seen.task.name, "Clean the oven and trays");
  assert.equal(formatFrequency(seen.task.frequency), "Every 2 weeks");

  const moved = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "__new",
    newRoomName: "Utility",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
  });
  assert.equal(moved.ok, true);
  assert.equal(taskById(repo.getState(), "task_helen_oven").room.name, "Utility");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");

  const foreignEdit = await repo.saveTask("home_james", {
    taskId: "task_james_oven",
    roomId: "room_james_kitchen",
    name: "Helen should not change this",
    frequency: { unit: "visit" },
  });
  assert.equal(foreignEdit.ok, false);
  const foreignDelete = await repo.deleteTask("home_james", "task_james_oven");
  assert.equal(foreignDelete.ok, false);
  assert.equal(taskById(repo.getState(), "task_james_oven").task.name, "Clean the oven");

  const removed = await repo.deleteTask("home_helen", "task_helen_oven");
  assert.equal(removed.ok, true);
  assert.equal(taskById(repo.getState(), "task_helen_oven"), null);
  assert.equal(repo.getState().homes[0].rooms.some((room) => room.name === "Utility"), false);
  assert.ok(taskById(repo.getState(), "task_helen_worktops"));

  const missing = await repo.deleteTask("home_helen", "task_does_not_exist");
  assert.equal(missing.ok, false);

  await repo.setAccount("acct_priya");
  assert.equal(taskById(repo.getState(), "task_helen_oven"), null);
  const byCleaner = await repo.deleteTask("home_helen", "task_helen_hall");
  assert.equal(byCleaner.ok, true);
  assert.ok(taskById(repo.getState(), "task_helen_alarm"));
  assert.equal(repo.getState().homes[0].rooms.some((room) => room.name === "Hall"), true);
  const alarm = await repo.deleteTask("home_helen", "task_helen_alarm");
  assert.equal(alarm.ok, true);
  assert.equal(repo.getState().homes[0].rooms.some((room) => room.name === "Hall"), false);

  await repo.setAccount("acct_helen");
  assert.equal(taskById(repo.getState(), "task_helen_hall"), null);
  assert.equal(taskById(repo.getState(), "task_helen_alarm"), null);
  assert.ok(taskById(repo.getState(), "task_helen_worktops"));
  assert.equal(repo.getState().homes[0].customerNote, note);

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.version, 1);
});

test("dates for people are shown as day, month and year", () => {
  assert.equal(formatUkDate(new Date(2026, 9, 12, 18, 30)), "12 Oct 2026");
  assert.equal(toDateInputValue(new Date(2026, 9, 12, 23, 30)), "2026-10-12");
  const parsed = parseDateInput("2026-10-12");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.date.getFullYear(), 2026);
  assert.equal(parsed.date.getMonth(), 9);
  assert.equal(parsed.date.getDate(), 12);
  assert.equal(parsed.date.getHours(), 12);
  assert.equal(parseDateInput("").ok, true);
  assert.equal(parseDateInput("").date, null);
  assert.equal(parseDateInput("12/10/2026").ok, false);
  assert.equal(parseDateInput("2026-02-31").ok, false);

  const state = buildSeed(tuesday);
  assert.equal(statusOf(state, "task_helen_oven").detail, "Next due 15 Jan 2027");
  assert.equal(statusOf(state, "task_helen_extractor").detail, "Overdue · was due 17 Oct 2026");
  assert.equal(statusOf(state, "task_helen_bedding").detail, "Due 6 Nov 2026");
});

test("either person can set when a task was last done, and the due date updates", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  await repo.setAccount("acct_helen");

  const ovenBefore = taskById(repo.getState(), "task_helen_oven").task;
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");
  assert.equal(statusOf(repo.getState(), "task_helen_oven").detail, "Next due 15 Jan 2027");
  const originalAt = latestCompletion(ovenBefore).at;
  const originalCount = ovenBefore.completions.length;

  const sameDay = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
    lastDone: new Date(originalAt),
  });
  assert.equal(sameDay.ok, true);
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_oven").task).at, originalAt);
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_oven").task).accountId, "acct_helen");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_oven").task).name, "Helen Cartwright");
  assert.equal(taskById(repo.getState(), "task_helen_oven").task.completions.length, originalCount);

  const moved = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
    lastDone: new Date(2026, 5, 1, 9),
  });
  assert.equal(moved.ok, true);
  const movedTask = taskById(repo.getState(), "task_helen_oven").task;
  assert.equal(latestCompletion(movedTask).accountId, "acct_helen");
  assert.equal(latestCompletion(movedTask).name, "Helen Cartwright");
  assert.equal(new Date(latestCompletion(movedTask).at).getMonth(), 5);
  assert.equal(new Date(latestCompletion(movedTask).at).getDate(), 1);
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
  assert.equal(statusOf(repo.getState(), "task_helen_oven").detail, "Overdue · was due 1 Sep 2026");

  await repo.setAccount("acct_priya");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
  assert.equal(statusOf(repo.getState(), "task_helen_oven").detail, "Overdue · was due 1 Sep 2026");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_oven").task).name, "Helen Cartwright");

  const cleared = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
    lastDone: null,
  });
  assert.equal(cleared.ok, true);
  assert.equal(taskById(repo.getState(), "task_helen_oven").task.completions.length, 0);
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
  assert.equal(statusOf(repo.getState(), "task_helen_oven").detail, "Due today");

  await repo.setAccount("acct_helen");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_oven").task), null);

  const kept = taskById(repo.getState(), "task_helen_windows").task;
  const keptAt = latestCompletion(kept).at;
  const untouched = await repo.saveTask("home_helen", {
    taskId: "task_helen_windows",
    roomId: "room_helen_living",
    name: "Clean the inside of the windows",
    frequency: { unit: "months", every: 1 },
  });
  assert.equal(untouched.ok, true);
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_windows").task).at, keptAt);

  const future = await repo.saveTask("home_helen", {
    taskId: "task_helen_windows",
    roomId: "room_helen_living",
    name: "This name should not be saved",
    frequency: { unit: "weeks", every: 1 },
    lastDone: new Date(2026, 9, 28, 12),
  });
  assert.equal(future.ok, false);
  assert.match(future.error, /earlier/);
  assert.equal(taskById(repo.getState(), "task_helen_windows").task.name, "Clean the inside of the windows");
  assert.equal(formatFrequency(taskById(repo.getState(), "task_helen_windows").task.frequency), "Every month");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_windows").task).at, keptAt);

  const invalid = await repo.saveTask("home_helen", {
    taskId: "task_helen_windows",
    roomId: "room_helen_living",
    name: "Clean the inside of the windows",
    frequency: { unit: "months", every: 1 },
    lastDone: new Date("not a date"),
  });
  assert.equal(invalid.ok, false);
  const asText = await repo.saveTask("home_helen", {
    taskId: "task_helen_windows",
    roomId: "room_helen_living",
    name: "Clean the inside of the windows",
    frequency: { unit: "months", every: 1 },
    lastDone: "2026-06-01",
  });
  assert.equal(asText.ok, false);
  assert.equal(latestCompletion(taskById(repo.getState(), "task_helen_windows").task).at, keptAt);

  const added = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Descale the kettle",
    frequency: { unit: "months", every: 3 },
    lastDone: new Date(2026, 9, 1, 12),
  });
  assert.equal(added.ok, true);
  assert.equal(taskById(repo.getState(), added.taskId).task.addedBy, "customer");
  assert.equal(latestCompletion(taskById(repo.getState(), added.taskId).task).role, "customer");
  assert.equal(stateOf(repo.getState(), added.taskId), "later");
  assert.equal(statusOf(repo.getState(), added.taskId).detail, "Next due 1 Jan 2027");

  const never = await repo.saveTask("home_helen", {
    roomId: "__new",
    newRoomName: "Utility",
    name: "Clean the utility floor",
    frequency: { unit: "weeks", every: 2 },
    lastDone: null,
  });
  assert.equal(never.ok, true);
  assert.equal(taskById(repo.getState(), never.taskId).task.completions.length, 0);
  assert.equal(stateOf(repo.getState(), never.taskId), "due");

  const blocked = await repo.saveTask("home_james", {
    taskId: "task_james_oven",
    roomId: "room_james_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
    lastDone: new Date(2026, 5, 1, 12),
  });
  assert.equal(blocked.ok, false);
  assert.equal(stateOf(repo.getState(), "task_james_oven"), "later");

  await repo.setAccount("acct_priya");
  assert.equal(statusOf(repo.getState(), added.taskId).detail, "Next due 1 Jan 2027");
  assert.equal(stateOf(repo.getState(), never.taskId), "due");

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.version, 1);
  const savedOven = raw.homes[0].rooms
    .flatMap((room) => room.tasks)
    .find((task) => task.id === "task_helen_oven");
  assert.deepEqual(savedOven.completions, []);
  assert.equal(savedOven.addedBy, undefined);
});

test("tasks saved before last-done editing still accept a new date", async () => {
  const storage = memoryStorage();
  const seed = createDemoRepository({ storage, now: () => tuesday });
  await seed.load();
  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  for (const home of raw.homes) {
    for (const room of home.rooms) {
      for (const task of room.tasks) delete task.addedBy;
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(raw));

  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  assert.equal(repo.getState().version, 1);
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");

  await repo.setAccount("acct_priya");
  const saved = await repo.saveTask("home_helen", {
    taskId: "task_helen_oven",
    roomId: "room_helen_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 3 },
    lastDone: new Date(2026, 5, 1, 12),
  });
  assert.equal(saved.ok, true);
  assert.equal(taskById(repo.getState(), "task_helen_oven").task.addedBy, undefined);
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "due");
  assert.equal(statusOf(repo.getState(), "task_helen_oven").detail, "Overdue · was due 1 Sep 2026");

  const again = createDemoRepository({ storage, now: () => tuesday });
  await again.load();
  assert.equal(again.getState().version, 1);
  assert.equal(statusOf(again.getState(), "task_helen_oven").detail, "Overdue · was due 1 Sep 2026");
  await again.setAccount("acct_helen");
  assert.equal(stateOf(again.getState(), "task_helen_oven"), "due");
});

test("marking a task done on an earlier day updates the due date for both people", async () => {
  const repo = createDemoRepository({ storage: memoryStorage(), now: () => tuesday });
  await repo.load();
  await repo.setAccount("acct_priya");
  assert.equal(stateOf(repo.getState(), "task_amina_oven"), "due");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_amina_oven").task), null);

  const todayTick = await repo.markDone("home_amina", "task_amina_oven");
  assert.equal(todayTick.ok, true);
  assert.equal(stateOf(repo.getState(), "task_amina_oven"), "later");
  assert.equal(statusOf(repo.getState(), "task_amina_oven").detail, "Next due 27 Jan 2027");

  const corrected = await repo.markDone("home_amina", "task_amina_oven", new Date(2026, 5, 1, 15));
  assert.equal(corrected.ok, true);
  assert.equal(corrected.completion.role, "cleaner");
  assert.equal(corrected.completion.name, "Priya Adeyemi");
  const oven = taskById(repo.getState(), "task_amina_oven").task;
  assert.equal(oven.completions.length, 1);
  assert.equal(new Date(latestCompletion(oven).at).getMonth(), 5);
  assert.equal(stateOf(repo.getState(), "task_amina_oven"), "due");
  assert.equal(statusOf(repo.getState(), "task_amina_oven").detail, "Overdue · was due 1 Sep 2026");
  const undone = await repo.undoToday("home_amina", "task_amina_oven");
  assert.equal(undone.ok, false);
  assert.equal(stateOf(repo.getState(), "task_amina_oven"), "due");

  const future = await repo.markDone("home_amina", "task_amina_oven", new Date(2026, 9, 28, 12));
  assert.equal(future.ok, false);
  assert.match(future.error, /earlier/);
  assert.equal(oven.completions.length, 1);
  const missing = await repo.markDone("home_amina", "task_amina_oven", null);
  assert.equal(missing.ok, false);

  await repo.setAccount("acct_amina");
  assert.equal(statusOf(repo.getState(), "task_amina_oven").detail, "Overdue · was due 1 Sep 2026");
  const byCustomer = await repo.markDone("home_amina", "task_amina_windows", new Date(2026, 7, 1, 12));
  assert.equal(byCustomer.ok, true);
  assert.equal(byCustomer.completion.role, "customer");
  assert.equal(stateOf(repo.getState(), "task_amina_windows"), "due");
  assert.equal(statusOf(repo.getState(), "task_amina_windows").detail, "Overdue · was due 1 Sep 2026");

  const visit = await repo.markDone("home_amina", "task_amina_dust", new Date(2026, 9, 20, 12));
  assert.equal(visit.ok, true);
  assert.equal(stateOf(repo.getState(), "task_amina_dust"), "due");

  const foreign = await repo.markDone("home_helen", "task_helen_oven", new Date(2026, 5, 1, 12));
  assert.equal(foreign.ok, false);

  await repo.setAccount("acct_priya");
  assert.equal(statusOf(repo.getState(), "task_amina_windows").detail, "Overdue · was due 1 Sep 2026");
  assert.equal(latestCompletion(taskById(repo.getState(), "task_amina_windows").task).name, "Amina Rahman");
  assert.equal(stateOf(repo.getState(), "task_amina_dust"), "due");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");
});

test("tasks saved before anyone recorded who added them can still be edited and deleted", async () => {
  const storage = memoryStorage();
  const seed = createDemoRepository({ storage, now: () => tuesday });
  await seed.load();
  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  for (const home of raw.homes) {
    for (const room of home.rooms) {
      for (const task of room.tasks) delete task.addedBy;
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(raw));

  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  assert.equal(repo.getState().version, 1);
  assert.equal(taskById(repo.getState(), "task_amina_oven").task.addedBy, undefined);
  assert.equal(addedByLabel(taskById(repo.getState(), "task_amina_oven").task), "");

  await repo.setAccount("acct_priya");
  const saved = await repo.saveTask("home_amina", {
    taskId: "task_amina_oven",
    roomId: "room_amina_kitchen",
    name: "Clean the oven",
    frequency: { unit: "months", every: 1 },
  });
  assert.equal(saved.ok, true);
  const oven = taskById(repo.getState(), "task_amina_oven").task;
  assert.equal(oven.name, "Clean the oven");
  assert.equal(formatFrequency(oven.frequency), "Every month");
  assert.equal(oven.addedBy, undefined);
  assert.equal(stateOf(repo.getState(), "task_amina_oven"), "due");

  await repo.setAccount("acct_amina");
  assert.equal(taskById(repo.getState(), "task_amina_oven").task.name, "Clean the oven");
  const deleted = await repo.deleteTask("home_amina", "task_amina_windows");
  assert.equal(deleted.ok, true);
  assert.equal(taskById(repo.getState(), "task_amina_windows"), null);

  await repo.setAccount("acct_priya");
  assert.equal(taskById(repo.getState(), "task_amina_windows"), null);
  assert.ok(taskById(repo.getState(), "task_amina_dust"));
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

test("the display name can be edited and stays in this browser", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  await repo.setAccount("acct_helen");

  const blank = await repo.setDisplayName("   ");
  assert.equal(blank.ok, false);
  assert.match(blank.error, /name/);
  assert.equal(repo.currentAccount().name, "Helen Cartwright");

  const saved = await repo.setDisplayName("  Helen C.  ");
  assert.equal(saved.ok, true);
  assert.equal(saved.name, "Helen C.");
  assert.equal(repo.currentAccount().name, "Helen C.");

  const marked = await repo.markDone("home_helen", "task_helen_worktops");
  assert.equal(marked.ok, true);
  assert.equal(marked.completion.name, "Helen C.");
  const oven = latestCompletion(taskById(repo.getState(), "task_helen_oven").task);
  assert.equal(oven.name, "Helen Cartwright");

  await repo.setAccount("acct_priya");
  assert.equal(repo.getState().accounts.find((account) => account.id === "acct_helen").name, "Helen C.");
  const renamed = await repo.setDisplayName("Priya A.");
  assert.equal(renamed.ok, true);
  assert.equal(repo.currentAccount().inviteCode, "MAPLE-7K");
  assert.equal(repo.currentAccount().role, "cleaner");

  const again = createDemoRepository({ storage, now: () => tuesday });
  await again.load();
  assert.equal(again.getState().accounts.find((account) => account.id === "acct_helen").name, "Helen C.");
  assert.equal(again.getState().accounts.find((account) => account.id === "acct_priya").name, "Priya A.");

  await again.setAccount("acct_helen");
  const clipped = await again.setDisplayName("A".repeat(100));
  assert.equal(clipped.ok, true);
  assert.equal(again.currentAccount().name.length, 80);

  await again.reset();
  assert.equal(again.getState().accounts.find((account) => account.id === "acct_helen").name, "Helen Cartwright");
  assert.equal(again.currentAccount().id, "acct_priya");
  assert.equal(storage.getItem("meal-planner.v1"), null);
});

test("due dates follow days, weeks, months, and years", () => {
  const months = taskStatus(
    {
      frequency: { unit: "months", every: 1 },
      completions: [{ at: new Date(2026, 0, 31, 12).toISOString() }],
    },
    { today: tuesday, visitWeekday: "tuesday" },
  );
  assert.equal(months.state, "due");
  assert.equal(months.detail, "Overdue · was due 28 Feb 2026");

  const threeMonths = taskStatus(
    {
      frequency: { unit: "months", every: 3 },
      completions: [{ at: new Date(2026, 0, 31, 12).toISOString() }],
    },
    { today: tuesday, visitWeekday: "tuesday" },
  );
  assert.equal(threeMonths.detail, "Overdue · was due 30 Apr 2026");

  const years = taskStatus(
    {
      frequency: { unit: "years", every: 1 },
      completions: [{ at: new Date(2026, 0, 31, 12).toISOString() }],
    },
    { today: tuesday, visitWeekday: "tuesday" },
  );
  assert.equal(years.state, "later");
  assert.equal(years.detail, "Next due 31 Jan 2027");

  const leap = taskStatus(
    {
      frequency: { unit: "years", every: 1 },
      completions: [{ at: new Date(2024, 1, 29, 12).toISOString() }],
    },
    { today: new Date(2025, 2, 1, 12), visitWeekday: "monday" },
  );
  assert.equal(leap.detail, "Overdue · was due 28 Feb 2025");

  const days = taskStatus(
    {
      frequency: { unit: "days", every: 10 },
      completions: [{ at: new Date(2026, 9, 20, 12).toISOString() }],
    },
    { today: tuesday, visitWeekday: "tuesday" },
  );
  assert.equal(days.state, "soon");
  assert.equal(days.detail, "Due 30 Oct 2026");
});

test("how often rejects an empty, zero, negative, or partial number", () => {
  assert.equal(readFrequency("", "weeks").ok, false);
  assert.match(readFrequency("", "weeks").error, /how often/i);
  assert.equal(readFrequency("0", "weeks").ok, false);
  assert.match(readFrequency("0", "months").error, /1 or more/);
  assert.match(readFrequency("-2", "days").error, /1 or more/);
  assert.match(readFrequency("1.5", "years").error, /whole number/);
  assert.match(readFrequency("2.0", "weeks").error, /decimals/);
  assert.match(readFrequency("abc", "weeks").error, /whole number/);
  assert.match(readFrequency("100", "weeks").error, /99 or less/);
  assert.equal(readFrequency("nope", "fortnights").ok, false);

  const week = readFrequency("1", "weeks");
  assert.equal(week.ok, true);
  assert.deepEqual(week.frequency, { unit: "weeks", every: 1 });
  assert.deepEqual(readFrequency("3", "months").frequency, { unit: "months", every: 3 });
  assert.deepEqual(readFrequency("1", "years").frequency, { unit: "years", every: 1 });
  assert.deepEqual(readFrequency(" 2 ", "days").frequency, { unit: "days", every: 2 });
  assert.equal(formatFrequency(readFrequency("1", "years").frequency), "Every year");
  assert.equal(formatFrequency(readFrequency("2", "weeks").frequency), "Every 2 weeks");

  assert.deepEqual(frequencyFormValue({ unit: "months", every: 3 }), { every: "3", unit: "months" });
  assert.deepEqual(frequencyFormValue({ unit: "visit" }), { every: "1", unit: "visit" });
  assert.deepEqual(frequencyFormValue({ unit: "year", every: 1 }), { every: "1", unit: "years" });
  assert.deepEqual(frequencyFormValue("2-weeks"), { every: "2", unit: "weeks" });
});

test("saved tasks move from the old frequency onto number and unit", async () => {
  const storage = memoryStorage();
  const seeded = createDemoRepository({ storage, now: () => tuesday });
  await seeded.load();
  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  const tasks = raw.homes.flatMap((home) => home.rooms.flatMap((room) => room.tasks));
  const oven = tasks.find((task) => task.id === "task_helen_oven");
  const worktops = tasks.find((task) => task.id === "task_helen_worktops");
  const bedding = tasks.find((task) => task.id === "task_helen_bedding");
  const windows = tasks.find((task) => task.id === "task_helen_windows");
  oven.frequency = { unit: "month", every: "3" };
  worktops.frequency = { unit: "visit" };
  bedding.frequency = "2-weeks";
  windows.frequency = { preset: "1-months" };
  const dust = tasks.find((task) => task.id === "task_helen_living_dust");
  dust.frequency = { unit: "weeks", every: 0 };
  const alarm = tasks.find((task) => task.id === "task_helen_alarm");
  alarm.frequency = { unit: "years", every: 120 };
  storage.setItem(STORAGE_KEY, JSON.stringify(raw));

  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  assert.equal(repo.getState().version, 1);
  assert.deepEqual(taskById(repo.getState(), "task_helen_oven").task.frequency, { unit: "months", every: 3 });
  assert.deepEqual(taskById(repo.getState(), "task_helen_worktops").task.frequency, { every: 1, unit: "visit" });
  assert.deepEqual(taskById(repo.getState(), "task_helen_bedding").task.frequency, { unit: "weeks", every: 2 });
  assert.deepEqual(taskById(repo.getState(), "task_helen_windows").task.frequency, { unit: "months", every: 1 });
  assert.deepEqual(taskById(repo.getState(), "task_helen_living_dust").task.frequency, { unit: "weeks", every: 1 });
  assert.deepEqual(taskById(repo.getState(), "task_helen_alarm").task.frequency, { unit: "years", every: 99 });
  assert.equal(formatFrequency(taskById(repo.getState(), "task_helen_oven").task.frequency), "Every 3 months");
  assert.equal(formatFrequency(taskById(repo.getState(), "task_helen_worktops").task.frequency), "Every visit");
  assert.equal(stateOf(repo.getState(), "task_helen_oven"), "later");
  assert.equal(stateOf(repo.getState(), "task_helen_worktops"), "due");
  assert.equal(isCanonicalFrequency(taskById(repo.getState(), "task_helen_bedding").task.frequency), true);
  assert.equal(canonicalFrequency({ unit: "week", every: "2" }).unit, "weeks");

  const again = createDemoRepository({ storage, now: () => tuesday });
  await again.load();
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  const savedOven = saved.homes.flatMap((home) => home.rooms.flatMap((room) => room.tasks)).find((task) => task.id === "task_helen_oven");
  assert.deepEqual(savedOven.frequency, { unit: "months", every: 3 });
  assert.equal(saved.version, 1);

  await repo.setAccount("acct_helen");
  const rejected = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Too often",
    frequency: { unit: "weeks", every: 0 },
  });
  assert.equal(rejected.ok, false);
  const negative = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Too often",
    frequency: { unit: "weeks", every: -1 },
  });
  assert.equal(negative.ok, false);
  const fraction = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Too often",
    frequency: { unit: "months", every: 1.5 },
  });
  assert.equal(fraction.ok, false);
  const huge = await repo.saveTask("home_helen", {
    roomId: "room_helen_kitchen",
    name: "Too often",
    frequency: { unit: "years", every: 100 },
  });
  assert.equal(huge.ok, false);

  const yearly = await repo.saveTask("home_helen", {
    roomId: "room_helen_hall",
    name: "Service the boiler",
    frequency: { unit: "years", every: 1 },
    lastDone: new Date(2026, 0, 31, 12),
  });
  assert.equal(yearly.ok, true);
  assert.equal(formatFrequency(taskById(repo.getState(), yearly.taskId).task.frequency), "Every year");
  assert.equal(statusOf(repo.getState(), yearly.taskId).detail, "Next due 31 Jan 2027");
  assert.deepEqual(frequencyFormValue(taskById(repo.getState(), yearly.taskId).task.frequency), {
    every: "1",
    unit: "years",
  });
});

test("a home opens onto its rooms, and the cleaner can still see this visit", async () => {
  const storage = memoryStorage();
  const repo = createDemoRepository({ storage, now: () => tuesday });
  await repo.load();
  const state = repo.getState();
  const helen = state.homes[0];
  const kitchen = roomCardModel(roomSummaries(helen, tuesday).find((room) => room.id === "room_helen_kitchen"));
  assert.equal(kitchen.name, "Kitchen");
  assert.equal(kitchen.taskCount, 4);
  assert.equal(kitchen.dueCount, 3);
  assert.equal(kitchen.overdueCount, 1);
  assert.equal(kitchen.taskLabel, "4 tasks");
  assert.equal(kitchen.dueLabel, "3 due");
  assert.equal(kitchen.detail, "4 tasks · 1 overdue");
  assert.equal(kitchen.tone, "due");

  const hall = roomCardModel(roomSummaries(helen, tuesday).find((room) => room.id === "room_helen_hall"));
  assert.equal(hall.taskCount, 2);
  assert.equal(hall.dueCount, 0);
  assert.equal(hall.dueLabel, "Nothing due");
  assert.equal(hall.detail, "2 tasks");
  assert.equal(statusOf(state, "task_helen_alarm").detail, "Next due 27 Sep 2027");
  assert.equal(formatFrequency(taskById(state, "task_helen_alarm").task.frequency), "Every year");

  const overview = visitOverviewModel(helen, tuesday);
  assert.ok(overview.dueCount >= kitchen.dueCount);
  assert.ok(overview.names.includes("Wipe the worktops and hob"));
  assert.equal(overview.names.includes("Clean the oven"), false);

  await repo.setAccount("acct_priya");
  await repo.openHome("home_helen");
  assert.equal(repo.getState().view.screen, "home");
  assert.equal(repo.getState().view.roomId, null);

  const opened = await repo.openRoom("home_helen", "room_helen_kitchen");
  assert.equal(opened.ok, true);
  assert.equal(repo.getState().view.screen, "room");
  assert.equal(repo.getState().view.roomId, "room_helen_kitchen");

  const kept = createDemoRepository({ storage, now: () => tuesday });
  await kept.load();
  assert.equal(kept.getState().view.screen, "room");
  assert.equal(kept.getState().view.roomId, "room_helen_kitchen");
  assert.equal(kept.getState().version, 1);

  const missing = await kept.openRoom("home_helen", "room_missing");
  assert.equal(missing.ok, false);

  await kept.setAccount("acct_helen");
  const foreign = await kept.openRoom("home_james", "room_james_kitchen");
  assert.equal(foreign.ok, false);
  const notForCustomer = await kept.showVisitOverview("home_helen");
  assert.equal(notForCustomer.ok, false);

  const ownRoom = await kept.openRoom("home_helen", "room_helen_bathroom");
  assert.equal(ownRoom.ok, true);
  const back = await kept.showRooms("home_helen");
  assert.equal(back.ok, true);
  assert.equal(kept.getState().view.screen, "home");
  assert.equal(kept.getState().view.roomId, null);

  await kept.setAccount("acct_priya");
  await kept.openHome("home_helen");
  const visit = await kept.showVisitOverview("home_helen");
  assert.equal(visit.ok, true);
  assert.equal(kept.getState().view.screen, "visit");
  assert.equal(kept.getState().view.roomId, null);
  const roomsAgain = await kept.showRooms("home_helen");
  assert.equal(roomsAgain.ok, true);
  assert.equal(kept.getState().view.screen, "home");

  const single = roomCardModel({ id: "room", name: "Study", taskCount: 1, dueCount: 1, overdueCount: 1 });
  assert.equal(single.taskLabel, "1 task");
  assert.equal(single.dueLabel, "1 due");
  assert.equal(single.detail, "1 task · 1 overdue");
  const none = roomCardModel({ id: "room", name: "Study", taskCount: 0, dueCount: 0, overdueCount: 0 });
  assert.equal(none.taskLabel, "No tasks");
  assert.equal(none.dueLabel, "Nothing due");
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
