import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, formatUkDate, nextVisitOnOrAfter, parseDateInput, toDateInputValue } from "../js/dates.js";
import { buildSeed } from "../js/demo-data.js";
import { formatFrequency, latestCompletion, taskStatus, tasksWithStatus } from "../js/dueness.js";
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
  assert.equal(repo.getState().homes[0].rooms.some((room) => room.name === "Hall"), false);

  await repo.setAccount("acct_helen");
  assert.equal(taskById(repo.getState(), "task_helen_hall"), null);
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
