# Tidy Together

A test version of a cleaning schedule for a cleaner and the homes they look after. It lives in this folder, separate from the meal planner, so it can move to its own project later. It does not share pages, styling, or saved data with the meal planner.

**Try it:** https://lucinda94.github.io/Meal-planner/cleaning/

On an iPhone, open that link in Safari, tap Share, then **Add to Home Screen**.

The name “Tidy Together” is a placeholder. To change it, edit `APP_NAME` in `js/config.js`, the `<title>` in `index.html`, and `name` / `short_name` in `manifest.json`.

## Try the demo

Everything is saved on this phone only. Nothing is sent to a server, and the cleaner and the customers are not different people yet. Use **Demo** at the top to switch between Priya the cleaner and each home.

- Priya looks after three homes around Bristol. Each home has rooms and tasks, with how often they need doing.
- A task is **Due**, **Due soon**, or **Not needed yet**, from the last time it was done and how often it repeats.
- The customer or Priya can mark a task done. That records who did it and when, and it drops off the due list until it is needed again. Helen has already cleaned her oven, so Priya can see it is not needed for three months.
- Either person can add a task: the name, the room, how often it repeats, and, if it has already been done, the date it was last done. Leave Last done blank if it has never been done. Priya can add one from the visit screen, under the note from the customer. A short line says whether the cleaner or the customer added it. The other person sees the same task. Tasks that were already on the list stay as they are, with no extra line.
- Either person can change or remove a task. Tap the three dots beside it, then Edit or Delete. Edit opens the name, the room, how often, and Last done, already filled in. Change the date if it was done on a different day, or tap Not done yet to clear it. You can't pick a future day. Dates show as 12 Oct 2026. Saving updates when the task is next due, and the other person sees that straight away. Delete asks you to confirm first. Cancel leaves the task alone.
- Mark done still means today, in one tap. Done on a different day? — under that button, or in the three-dot menu — lets you record an earlier day, for example last Tuesday. The next due date is worked out from the day you pick. A future day isn't allowed.
- Priya’s home screen lists every home, the next visit, and how many tasks are due. Open a home for **Due this visit** and what can wait.
- The customer and the cleaner can each leave a note.
- Priya’s invite code is **MAPLE-7K**. **Link a new home** asks for that code.
- **Reset demo data** puts the three sample homes back, with dates worked out from today.

## How a real login and database would work

The screens never talk to `localStorage` themselves. They call `createDemoRepository()` in `js/store.js`. That file is the piece to replace. Each method already checks that the signed-in account is the cleaner or the customer for that home. A real backend should enforce the same rule in the database, so one account cannot read another cleaner’s homes.

There is no login in this test. The demo switcher only chooses which account `view.accountId` pretends to be.

Suggested tables:

| Table | What it stores |
| --- | --- |
| `accounts` | The person, their role (`cleaner` or `customer`), and the cleaner’s invite code. The id matches the login user. |
| `homes` | Address, visit weekday, customer id, cleaner id, and the two notes. |
| `rooms` | A room in one home. |
| `tasks` | The job, how often (`every visit`, or every N days, weeks, or months), and who added it (`cleaner` or `customer`) when that was recorded. |
| `completions` | When a task was marked done, including a date set by hand, and which account did it. |

### Supabase

Use a magic link (or similar) so each person has an `auth.uid()`. Turn on row-level security for every table.

- A customer can read and update the home where `customer_id = auth.uid()`. A cleaner can read homes where `cleaner_id = auth.uid()`.
- Rooms, tasks, and completions are allowed only when that person is allowed to see the home. Either linked person can add, edit, or delete a task. Only the customer can change the visit day or replace an empty list with the starter set. Either linked person can insert a completion. Undoing today’s tick deletes that latest row.
- Notes stay on the home. The customer may update `customer_note`. The cleaner may update `cleaner_note`. A narrow policy or a trigger should stop either person editing the other’s note.
- Don’t let a customer list every cleaner. A database function `link_home(invite_code, address, visit_weekday)` looks up the cleaner by code and inserts the home with `customer_id = auth.uid()`.

Swap `js/store.js` for a repository with the same methods (`visibleHomes`, `markDone`, `saveTask`, `setNote`, `linkHome`, and so on) that call Supabase. The screens can stay. Replace the Demo switcher with the signed-in user.

### Firebase

The same split works with Firebase Auth and Firestore security rules. Rules should check `request.auth.uid` against `customerId` or `cleanerId` on the home before a read or a write. Linking a home should go through a callable Cloud Function, so the invite code can be matched without listing every cleaner.

## Files

Copy this folder into a new repository when you want the real backend. There is no build step. `npm test` in this folder checks the due-date rules and the demo store.
