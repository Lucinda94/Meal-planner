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

On the **Recipes** tab, **Add recipe** and **Edit** use the same details as the sheet: name, whose recipe, ingredients, optional extras, method, serves and time, and notes. Ingredients can be one per line (a comma stays inside the line), or, on a single line, separated by commas. **Method** is the steps. **Notes** is for your own comments. **Delete recipe** asks before it removes a dinner, and takes it off the week plan too.

The add and edit form stays closed until you tap **Add recipe** or **Edit**. It does not sit at the bottom of the week plan.

If an older note is written as numbered steps, Edit offers **Move steps to Method**. Nothing moves until you tap it, and a comment with no step numbers is left in Notes.

**Add a recipe from a link or a photo.** On Add recipe, paste a link to a recipe page, or add a photo of a recipe. The steps go into **Method**, and servings and timing go into **Serves and time**. **Notes** is left for your own comments. Correct anything, then **Save recipe**. Facebook and Instagram usually cannot be read. Paste the caption, or add a photo, instead.

Saving, editing, or deleting a recipe stores it on this phone straight away. When sharing is set up, the app also sends the whole list to [`recipes.csv`](recipes.csv) in this repository, which is the list every phone loads. Until that file updates on the site, the phone keeps its own copy so nothing disappears. A new ingredient is grouped on the shopping list when the app knows the aisle, and otherwise it goes under **Other**.

**Back up my recipes** downloads every dinner as a CSV with the same columns. **Restore from backup** reads that file back onto this phone and, when sharing is set up, sends it on as well.

## The recipe file

[`recipes.csv`](recipes.csv) in this repository is the recipe list. It started as an export of the Google Sheet “My recipes”, and the app writes later changes into that same file. The sheet is no longer the master copy.

Column headings, in this order:

1. **Recipe**
2. **Whose recipe**
3. **Ingredients**
4. **Optional extras**
5. **Method**
6. **Notes**

**Method** is optional. A file exported before that column exists still loads, and those dinners keep their text in **Notes**. When **Method** is present, the steps go there. The cell may start with servings and timing (`Makes`, `Serves`, `Prep`, `Cook`, `Ready in`, or `From:`), then a blank line, then the steps. The app shows that opening part above the steps. **Notes** stays for comments. Ingredients and optional extras are comma-separated. If a dinner has no ingredients, the app says “Ingredients haven't been added yet”.

The week plan, the shopping switches, and ticked items stay on the phone. They are not part of `recipes.csv`.

## Share saves with every phone

The page is a static site, so it cannot keep a GitHub password inside it. A small free Cloudflare Worker holds two secrets and is the only thing that writes `recipes.csv`. The app sends the recipe file and a shared passcode to that Worker. The Worker checks the passcode and then updates the file. Random visitors do not have the passcode, so they cannot change the list. Their own phone can still keep a private copy.

Until the Worker address is filled in, **Save recipe** only stores the change on that phone and says so.

What you need to do once:

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it `Meal planner recipes`. Set the resource owner to your account, and repository access to **Only select repositories**: `Lucinda94/Meal-planner`.
3. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**. Leave every other permission as **No access**. Generate the token and copy it. You will not be shown it again. Do not paste it into the app, into a file in this repository, or into a chat.
4. Create a free Cloudflare account at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). You do not need a paid plan or a credit card.
5. In the Cloudflare dashboard, go to **Workers & Pages → Create → Start with Hello World**. Name the Worker `meal-planner-recipes`. Choose the module worker format if it asks.
6. Replace the sample code with the whole of [`worker/recipe-publish.js`](worker/recipe-publish.js) from this repository, then deploy.
7. Open the Worker → **Settings → Variables and Secrets**. Add a secret named `GITHUB_TOKEN` and paste the token from step 3. Add a secret named `RECIPE_PASSCODE` and type a phrase you will remember. That phrase is the shared passcode. Deploy again if Cloudflare asks you to.
8. Copy the Worker address. It looks like `https://meal-planner-recipes.<your-name>.workers.dev`.
9. In this repository, open [`publish.json`](publish.json) and set `endpoint` to that address, including `https://`. Commit the change to the `main` branch. The address is not a password. The passcode is what protects the list.
10. On the phone, add or edit a recipe and save. The first time, enter the same passcode. The phone remembers it. After that, saves update the shared list. Other phones catch up once GitHub Pages refreshes, usually within a couple of minutes.

If the Worker is down, or the passcode is wrong, the recipe stays on that phone and the app says it could not be shared.
