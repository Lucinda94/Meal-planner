import { APP_NAME } from "./config.js";
import { atNoonDaysAgo } from "./dates.js";

/**
 * Sample dates are worked out from "today" when the demo is seeded or reset,
 * so the due list stays believable whenever someone opens it.
 */
export function buildSeed(now = new Date()) {
  const priya = { id: "acct_priya", role: "cleaner", name: "Priya Adeyemi", inviteCode: "MAPLE-7K" };
  const helen = { id: "acct_helen", role: "customer", name: "Helen Cartwright" };
  const james = { id: "acct_james", role: "customer", name: "James Okonkwo" };
  const amina = { id: "acct_amina", role: "customer", name: "Amina Rahman" };

  const by = (account, daysAgo) => ({
    at: atNoonDaysAgo(now, daysAgo).toISOString(),
    accountId: account.id,
    name: account.name,
    role: account.role,
  });

  const visit = { every: 1, unit: "visit" };
  const weeks = (every) => ({ unit: "weeks", every });
  const months = (every) => ({ unit: "months", every });
  const years = (every) => ({ unit: "years", every });

  const task = (id, name, frequency, completion) => ({
    id,
    name,
    frequency,
    completions: completion ? [completion] : [],
  });

  return {
    version: 1,
    appName: APP_NAME,
    accounts: [priya, helen, james, amina],
    homes: [
      {
        id: "home_helen",
        name: "Maple Road",
        address: "14 Maple Road, Redland, Bristol BS6 6HJ",
        customerId: helen.id,
        cleanerId: priya.id,
        visitWeekday: "tuesday",
        customerNote:
          "I've cleaned the oven, so that can wait. The dog is in the garden — please don't let him in until the floors are dry.",
        cleanerNote: "Thanks for doing the oven. I left the bathroom window on the latch to air the room.",
        rooms: [
          {
            id: "room_helen_kitchen",
            name: "Kitchen",
            tasks: [
              task("task_helen_worktops", "Wipe the worktops and hob", visit, by(priya, 7)),
              task("task_helen_kitchen_floor", "Hoover and mop the floor", visit, by(priya, 7)),
              task("task_helen_oven", "Clean the oven", months(3), by(helen, 12)),
              task("task_helen_extractor", "Clean the extractor filter", months(1), by(priya, 40)),
            ],
          },
          {
            id: "room_helen_bathroom",
            name: "Bathroom",
            tasks: [
              task("task_helen_bath", "Clean the bath, basin and toilet", visit, by(priya, 7)),
              task("task_helen_shower", "Clean the shower screen", weeks(2), by(priya, 18)),
              task("task_helen_towels", "Change the hand towels", visit, by(priya, 7)),
            ],
          },
          {
            id: "room_helen_bedroom",
            name: "Bedroom",
            tasks: [
              task("task_helen_bedding", "Change the bedding", weeks(2), by(helen, 4)),
              task("task_helen_bed_hoover", "Hoover", visit, by(priya, 7)),
            ],
          },
          {
            id: "room_helen_living",
            name: "Living room",
            tasks: [
              task("task_helen_living_hoover", "Hoover and mop", visit, by(priya, 7)),
              task("task_helen_living_dust", "Dust and polish", visit, by(priya, 7)),
              task("task_helen_windows", "Clean the inside of the windows", months(1), by(priya, 8)),
            ],
          },
          {
            id: "room_helen_hall",
            name: "Hall",
            tasks: [
              task("task_helen_hall", "Hoover the hall", visit, by(helen, 0)),
              task("task_helen_alarm", "Test the smoke alarm", years(1), by(priya, 30)),
            ],
          },
        ],
      },
      {
        id: "home_james",
        name: "Harbour View",
        address: "8 Harbour View, Clifton, Bristol BS8 4NN",
        customerId: james.id,
        cleanerId: priya.id,
        visitWeekday: "thursday",
        customerNote: "I'm working in the study this week. Please leave that room.",
        cleanerNote: "We need more bin liners — they're kept under the sink.",
        rooms: [
          {
            id: "room_james_kitchen",
            name: "Kitchen",
            tasks: [
              task("task_james_surfaces", "Wipe the surfaces", visit, by(priya, 7)),
              task("task_james_floor", "Hoover and mop the floor", visit, by(priya, 7)),
              task("task_james_oven", "Clean the oven", months(3), by(priya, 20)),
              task("task_james_fridge", "Clean the fridge", months(1), by(priya, 40)),
            ],
          },
          {
            id: "room_james_bathroom",
            name: "Bathroom",
            tasks: [
              task("task_james_bathroom", "Clean the bathroom", visit, by(priya, 7)),
              task("task_james_shower", "Descale the shower head", months(3), by(priya, 20)),
            ],
          },
          {
            id: "room_james_bedroom",
            name: "Bedroom",
            tasks: [
              task("task_james_bedding", "Change the bedding", weeks(2), by(james, 4)),
              task("task_james_hoover", "Hoover", visit, by(james, 0)),
            ],
          },
          {
            id: "room_james_living",
            name: "Living room",
            tasks: [
              task("task_james_living_hoover", "Hoover", visit, by(priya, 7)),
              task("task_james_dust", "Dust", visit, by(priya, 7)),
            ],
          },
        ],
      },
      {
        id: "home_amina",
        name: "Rose Court",
        address: "Flat 2, Rose Court, Southville, Bristol BS3 1PQ",
        customerId: amina.id,
        cleanerId: priya.id,
        visitWeekday: "friday",
        customerNote: "Please use the products under the sink. Grey cloths are for the bathroom only.",
        cleanerNote: "The oven still needs a deep clean when there's time.",
        rooms: [
          {
            id: "room_amina_kitchen",
            name: "Kitchen",
            tasks: [
              task("task_amina_surfaces", "Wipe the surfaces", visit, by(priya, 7)),
              task("task_amina_oven", "Clean the oven", months(3), null),
              task("task_amina_rubbish", "Take the rubbish out", visit, by(priya, 7)),
            ],
          },
          {
            id: "room_amina_bathroom",
            name: "Bathroom",
            tasks: [
              task("task_amina_bathroom", "Clean the bathroom", visit, by(priya, 7)),
              task("task_amina_towels", "Change the towels", weeks(2), by(amina, 4)),
            ],
          },
          {
            id: "room_amina_living",
            name: "Living room",
            tasks: [
              task("task_amina_hoover", "Hoover", visit, by(priya, 7)),
              task("task_amina_dust", "Dust", visit, by(priya, 0)),
              task("task_amina_windows", "Clean the inside of the windows", months(1), by(priya, 10)),
            ],
          },
        ],
      },
    ],
    view: { accountId: priya.id, screen: "overview", homeId: null },
  };
}
