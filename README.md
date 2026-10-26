# Meal planner

A phone-friendly weekly meal planner and shopping list, made to live on the iPhone home screen.

**Live site:** https://lucinda94.github.io/Meal-planner/

## Turn on GitHub Pages

The site is the files on the `main` branch (no build step). After the meal planner is merged into `main`:

1. Open this repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set the branch to **main** and the folder to **/ (root)**, then click **Save**.

GitHub shows the address on that same screen. It will be:

https://lucinda94.github.io/Meal-planner/

The first publish can take a minute. After that, the site updates whenever `main` changes.

## Add it to an iPhone

1. Open the link in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**.

It opens full screen, like an app, and still works offline after it has been opened once while online.

The app always opens on the week plan.

## Change recipes on your phone

On the **Recipes** tab, **Add recipe** and **Edit** use the same details as the sheet: name, whose recipe, ingredients, optional extras, and notes. Ingredients can be one per line, or separated by commas. **Delete recipe** asks before it removes a dinner, and takes it off the week plan too.

Those changes are saved on this phone, on top of `recipes.csv`. They stay put when you reload, and when the spreadsheet file is updated. A new ingredient is grouped on the shopping list when the app knows the aisle, and otherwise it goes under **Other**.

**Back up my recipes** downloads every dinner (the sheet plus your edits) as a CSV with the same columns. **Restore from backup** reads that file back onto this phone. Worth doing, because edits made in the app live only on that phone.

## Update the recipes from the spreadsheet

The starting dinners live in [`recipes.csv`](recipes.csv), exported from the Google Sheet “My recipes”. To change them for every phone:

1. In Google Sheets, use **File → Download → Comma-separated values (.csv)**.
2. On GitHub, open this repository and choose **Add file → Upload files**.
3. Drop the new CSV in, name it `recipes.csv` so it replaces the old one, and commit it to the `main` branch.

Keep the same column headings: **Recipe**, **Whose recipe**, **Ingredients**, **Optional extras**, **Notes**. Ingredients and optional extras are comma-separated. If a dinner has no ingredients, the app says “Ingredients haven't been added yet”.

The week plan, the shopping switches, and ticked items are saved on the phone, not in the spreadsheet.
