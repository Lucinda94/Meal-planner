import { STATE_VERSION, STORAGE_KEY } from "./config.js";
import { buildSeed } from "./demo-data.js";
import { normaliseWeekday, startOfDay } from "./dates.js";
import { latestCompletion, normaliseFrequency } from "./dueness.js";

/**
 * DemoRepository is the only place that reads and writes data.
 * Screens ask for the signed-in account's homes and send changes
 * through these methods. They never touch localStorage.
 *
 * A Supabase or Firebase backend can replace this file. Each method
 * becomes a request, and the database only returns homes linked to
 * the signed-in account (row-level access). The screen code can stay.
 * See README.md.
 *
 * In this demo there is no login. The role switcher sets `view.accountId`,
 * and the methods below still refuse a home the account is not linked to.
 */

const NOTE_LIMIT = 500;
const NAME_LIMIT = 80;
const ROOM_LIMIT = 40;
const ADDRESS_LIMIT = 120;
const COMPLETION_LIMIT = 30;

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

export function createId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${random}`;
}

export function normaliseCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function firstName(name) {
  const part = String(name || "").trim().split(/\s+/)[0];
  return part || "Someone";
}

export function shortAddress(address) {
  return String(address || "").split(",")[0].trim();
}

/** Empty for tasks saved before anyone recorded who added them. */
export function addedByLabel(task) {
  if (task?.addedBy === "cleaner") return "Added by cleaner";
  if (task?.addedBy === "customer") return "Added by customer";
  return "";
}

function cloneSeed(now) {
  return buildSeed(now);
}

function looksLikeState(value) {
  return Boolean(
    value &&
      value.version === STATE_VERSION &&
      Array.isArray(value.accounts) &&
      Array.isArray(value.homes) &&
      value.view &&
      typeof value.view.accountId === "string",
  );
}

export function createDemoRepository(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const key = options.key || STORAGE_KEY;
  const clock = () => (options.now ? options.now() : new Date());
  let state = null;
  let saveWarning = "";

  function persist() {
    try {
      storage.setItem(key, JSON.stringify(state));
      saveWarning = "";
    } catch (error) {
      saveWarning = "This phone blocked saving. The demo will forget changes when you leave.";
    }
  }

  function accountById(id) {
    return state.accounts.find((account) => account.id === id) || null;
  }

  function currentAccount() {
    return accountById(state.view.accountId);
  }

  function homeById(id) {
    return state.homes.find((home) => home.id === id) || null;
  }

  function canAccess(home, account = currentAccount()) {
    if (!home || !account) return false;
    if (account.role === "cleaner") return home.cleanerId === account.id;
    if (account.role === "customer") return home.customerId === account.id;
    return false;
  }

  function findTask(home, taskId) {
    for (let roomIndex = 0; roomIndex < home.rooms.length; roomIndex += 1) {
      const room = home.rooms[roomIndex];
      const taskIndex = room.tasks.findIndex((task) => task.id === taskId);
      if (taskIndex !== -1) {
        return { room, task: room.tasks[taskIndex], roomIndex, taskIndex };
      }
    }
    return null;
  }

  function viewFor(account) {
    if (!account) return state.view;
    if (account.role === "cleaner") {
      return { accountId: account.id, screen: "overview", homeId: null };
    }
    const home = state.homes.find((item) => item.customerId === account.id) || null;
    return {
      accountId: account.id,
      screen: home ? "home" : "link",
      homeId: home ? home.id : null,
    };
  }

  function noonOn(day) {
    const at = startOfDay(day);
    at.setHours(12, 0, 0, 0);
    return at;
  }

  /**
   * A chosen last-done day. null clears it. A Date must be today or earlier.
   * Checked before any task is changed, so a bad date leaves the list alone.
   */
  function readLastDone(value) {
    if (value == null || value === "") return { ok: true, date: null };
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return { ok: false, error: "That date isn't valid." };
    }
    if (startOfDay(value).getTime() > startOfDay(clock()).getTime()) {
      return { ok: false, error: "Choose today or an earlier date." };
    }
    return { ok: true, date: value };
  }

  function completionOn(account, day) {
    return {
      at: noonOn(day).toISOString(),
      accountId: account.id,
      name: account.name,
      role: account.role,
    };
  }

  /**
   * Make `date` the day the schedule counts from.
   * Passing null means it has never been done.
   * The person already recorded stays attached when only the day changes.
   * Anything after the chosen day is dropped, so the new day is the latest.
   */
  function setLastDone(task, account, date) {
    if (date == null) {
      task.completions = [];
      return { ok: true };
    }
    const day = startOfDay(date);
    const existing = (Array.isArray(task.completions) ? task.completions : []).filter((item) => {
      const when = new Date(item?.at);
      return Boolean(item?.at) && !Number.isNaN(when.getTime());
    });
    const onDay = existing.filter((item) => startOfDay(new Date(item.at)).getTime() === day.getTime());
    if (onDay.length) {
      const chosen = onDay.reduce((best, item) => (!best || item.at >= best.at ? item : best));
      const earlier = existing.filter((item) => startOfDay(new Date(item.at)).getTime() < day.getTime());
      task.completions = [...earlier, chosen].slice(-COMPLETION_LIMIT);
      return { ok: true };
    }
    const latest = latestCompletion({ completions: existing });
    const chosen = latest ? { ...latest, at: noonOn(day).toISOString() } : completionOn(account, day);
    const earlier = existing.filter((item) => {
      if (latest && item === latest) return false;
      return startOfDay(new Date(item.at)).getTime() < day.getTime();
    });
    task.completions = [...earlier, chosen].slice(-COMPLETION_LIMIT);
    return { ok: true };
  }

  /**
   * Record that this person did the task on `date`, and count the schedule from that day.
   * A later tick (for example today, by mistake) is removed so the chosen day is the one that counts.
   */
  function recordDoneOn(task, account, date) {
    const day = startOfDay(date);
    const completion = completionOn(account, day);
    const kept = (Array.isArray(task.completions) ? task.completions : []).filter((item) => {
      const when = new Date(item?.at);
      return Boolean(item?.at) && !Number.isNaN(when.getTime()) && startOfDay(when).getTime() <= day.getTime();
    });
    task.completions = [...kept, completion].slice(-COMPLETION_LIMIT);
    return completion;
  }

  return {
    async load() {
      if (state) return state;
      try {
        const raw = storage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (looksLikeState(parsed)) {
            state = parsed;
            return state;
          }
        }
      } catch (error) {
        saveWarning = "";
      }
      state = cloneSeed(clock());
      persist();
      return state;
    },

    getState() {
      return state;
    },

    saveWarning() {
      return saveWarning;
    },

    currentAccount,
    homeById,

    visibleHomes() {
      const account = currentAccount();
      if (!account) return [];
      return state.homes.filter((home) => canAccess(home, account));
    },

    async reset() {
      state = cloneSeed(clock());
      persist();
      return state;
    },

    async setAccount(accountId) {
      const account = accountById(accountId);
      if (!account) return { ok: false };
      state.view = viewFor(account);
      persist();
      return { ok: true };
    },

    async openHome(homeId) {
      const home = homeById(homeId);
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      state.view = { ...state.view, screen: "home", homeId: home.id };
      persist();
      return { ok: true };
    },

    async showLinkForm() {
      state.view = { ...state.view, screen: "link", homeId: null };
      persist();
      return { ok: true };
    },

    async cancelLink() {
      const account = currentAccount();
      state.view = viewFor(account);
      persist();
      return { ok: true };
    },

    async linkHome(input) {
      const code = normaliseCode(input?.inviteCode);
      const cleaner = state.accounts.find(
        (account) => account.role === "cleaner" && normaliseCode(account.inviteCode) === code,
      );
      if (!cleaner) {
        return { ok: false, error: "That code doesn't match a cleaner. Check it and try again." };
      }
      const customerName = String(input?.customerName || "").trim().slice(0, NAME_LIMIT);
      const address = String(input?.address || "").trim().slice(0, ADDRESS_LIMIT);
      const homeName = String(input?.homeName || "").trim().slice(0, ROOM_LIMIT);
      if (!customerName) return { ok: false, error: "Add your name." };
      if (!address) return { ok: false, error: "Add the address." };
      const customer = { id: createId("acct"), role: "customer", name: customerName };
      const home = {
        id: createId("home"),
        name: homeName || `${firstName(customerName)}'s home`,
        address,
        customerId: customer.id,
        cleanerId: cleaner.id,
        visitWeekday: normaliseWeekday(input?.visitWeekday),
        customerNote: "",
        cleanerNote: "",
        rooms: [],
      };
      state.accounts.push(customer);
      state.homes.push(home);
      state.view = { accountId: customer.id, screen: "home", homeId: home.id };
      persist();
      return { ok: true, homeId: home.id, accountId: customer.id };
    },

    async setVisitWeekday(homeId, weekday) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home) || account.role !== "customer") {
        return { ok: false, error: "Only the customer can change the visit day." };
      }
      home.visitWeekday = normaliseWeekday(weekday);
      persist();
      return { ok: true };
    },

    async setNote(homeId, kind, text) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      const value = String(text || "").trim().slice(0, NOTE_LIMIT);
      if (kind === "customer") {
        if (account.role !== "customer") return { ok: false, error: "Only the customer can change that note." };
        home.customerNote = value;
      } else if (kind === "cleaner") {
        if (account.role !== "cleaner") return { ok: false, error: "Only the cleaner can change that note." };
        home.cleanerNote = value;
      } else {
        return { ok: false, error: "Unknown note." };
      }
      persist();
      return { ok: true };
    },

    async markDone(homeId, taskId, when) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      const found = findTask(home, taskId);
      if (!found) return { ok: false, error: "That task is no longer there." };
      if (when !== undefined) {
        const chosen = readLastDone(when);
        if (!chosen.ok) return chosen;
        if (!chosen.date) return { ok: false, error: "Choose the day it was done." };
        const completion = recordDoneOn(found.task, account, chosen.date);
        persist();
        return { ok: true, completion };
      }
      const completion = {
        at: clock().toISOString(),
        accountId: account.id,
        name: account.name,
        role: account.role,
      };
      found.task.completions = [...(found.task.completions || []), completion].slice(-COMPLETION_LIMIT);
      persist();
      return { ok: true, completion };
    },

    async undoToday(homeId, taskId) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      const found = findTask(home, taskId);
      if (!found) return { ok: false, error: "That task is no longer there." };
      const last = latestCompletion(found.task);
      if (!last) return { ok: false, error: "Nothing to undo." };
      const done = new Date(last.at);
      const today = clock();
      if (Number.isNaN(done.getTime()) || done.toDateString() !== today.toDateString()) {
        return { ok: false, error: "Only today's tick can be undone." };
      }
      const index = found.task.completions.lastIndexOf(last);
      if (index === -1) return { ok: false, error: "Nothing to undo." };
      found.task.completions.splice(index, 1);
      persist();
      return { ok: true };
    },

    async saveTask(homeId, input) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      // Either linked person can add a task or change one that is already there.
      const name = String(input?.name || "").trim().slice(0, NAME_LIMIT);
      if (!name) return { ok: false, error: "Give the task a name." };
      const frequency = normaliseFrequency(input?.frequency);
      if (!frequency) return { ok: false, error: "Choose how often this task needs doing." };
      const setsLastDone = Object.prototype.hasOwnProperty.call(input, "lastDone");
      let nextLastDone = null;
      if (setsLastDone) {
        const chosen = readLastDone(input.lastDone);
        if (!chosen.ok) return chosen;
        nextLastDone = chosen.date;
      }

      let room = null;
      if (input?.roomId && input.roomId !== "__new") {
        room = home.rooms.find((item) => item.id === input.roomId) || null;
      }
      if (!room) {
        const roomName = String(input?.newRoomName || "").trim().slice(0, ROOM_LIMIT);
        if (!roomName) return { ok: false, error: "Add a room, such as Kitchen or Bathroom." };
        room = home.rooms.find((item) => item.name.toLowerCase() === roomName.toLowerCase()) || null;
        if (!room) {
          room = { id: createId("room"), name: roomName, tasks: [] };
          home.rooms.push(room);
        }
      }

      if (input?.taskId) {
        const found = findTask(home, input.taskId);
        if (!found) return { ok: false, error: "That task is no longer there." };
        found.task.name = name;
        found.task.frequency = frequency;
        if (found.room !== room) {
          found.room.tasks.splice(found.taskIndex, 1);
          if (found.room.tasks.length === 0) {
            home.rooms = home.rooms.filter((item) => item !== found.room);
          }
          room.tasks.push(found.task);
        }
        if (setsLastDone) setLastDone(found.task, account, nextLastDone);
        persist();
        return { ok: true, taskId: found.task.id };
      }

      const task = {
        id: createId("task"),
        name,
        frequency,
        completions: [],
        addedBy: account.role === "cleaner" ? "cleaner" : "customer",
      };
      if (setsLastDone) setLastDone(task, account, nextLastDone);
      room.tasks.push(task);
      persist();
      return { ok: true, taskId: task.id };
    },

    async deleteTask(homeId, taskId) {
      const home = homeById(homeId);
      if (!canAccess(home)) return { ok: false, error: "That home isn't on this account." };
      const found = findTask(home, taskId);
      if (!found) return { ok: false, error: "That task is no longer there." };
      found.room.tasks.splice(found.taskIndex, 1);
      if (found.room.tasks.length === 0) {
        home.rooms = home.rooms.filter((item) => item !== found.room);
      }
      persist();
      return { ok: true };
    },

    async addStarterSet(homeId) {
      const home = homeById(homeId);
      const account = currentAccount();
      if (!canAccess(home) || account.role !== "customer") {
        return { ok: false, error: "Only the customer can change the schedule." };
      }
      const existing = home.rooms.some((room) => room.tasks.length > 0);
      if (existing) return { ok: false, error: "This home already has tasks." };
      const starter = [
        ["Kitchen", [
          ["Wipe the worktops and hob", { unit: "visit" }],
          ["Hoover and mop the floor", { unit: "visit" }],
          ["Clean the oven", { unit: "months", every: 3 }],
        ]],
        ["Bathroom", [
          ["Clean the bathroom", { unit: "visit" }],
          ["Change the towels", { unit: "weeks", every: 2 }],
        ]],
        ["Bedroom", [
          ["Change the bedding", { unit: "weeks", every: 2 }],
          ["Hoover", { unit: "visit" }],
        ]],
      ];
      home.rooms = starter.map(([roomName, tasks]) => ({
        id: createId("room"),
        name: roomName,
        tasks: tasks.map(([taskName, frequency]) => ({
          id: createId("task"),
          name: taskName,
          frequency,
          completions: [],
        })),
      }));
      persist();
      return { ok: true };
    },
  };
}
