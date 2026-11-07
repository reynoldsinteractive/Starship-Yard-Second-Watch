# Deploying Starship Yard + Second Watch to Netlify

This package is a complete website with its own **Second Watch sign-in page**. Nobody sees any part of the site (the app, rules, printables, ads or files) until they sign in.

## Sign-in

- **Access code:** `engage-2063`

The sign-in page asks only for the access code (it is case-sensitive). Visitors stay signed in on that device for 30 days. **Sign out** is in the top bar of the intro page and of every document page.

## Visitor stats

The gate counts visitors for you, free, with no other service. Sign in with the **admin code** `make-it-so` (instead of `engage-2063`), then go to **your-site-address/stats**, for example `https://ssysw.netlify.app/stats`. It shows, for the last 14 days:

- unique visitors per day and in total, and page views
- successful sign-ins and wrong access codes (a sign of someone guessing)
- which countries visitors come from

A visitor is one network address: people on the same Wi-Fi count once, and a phone that switches networks can count twice. Raw IP addresses are never stored; each is replaced by a scrambled code that can't be turned back into an address. Testers' code `engage-2063` cannot open the stats page. Keep the admin code to yourself; to change it, see "Changing the access code" below and use `admiral:your-new-code:admin` as one of the entries.

## What's in the folder

| Path | What it is |
|---|---|
| `public/` | The website itself: the app (`index.html`), the Second Watch Core Book (`book.html`), the Library, rules, quick-start, printables, ads, 3D libraries and fonts |
| `netlify/edge-functions/gate.js` | The sign-in page and the check that runs before every page and file |
| `netlify.toml` | Tells Netlify to publish `public/`, run the sign-in gate, and keep search engines out |
| `package.json` | Lists the one add-on the gate uses to save visitor stats (Netlify installs it for you) |
| `drag-and-drop-backup-_headers` | A backup password method, only for drag-and-drop deploys (see the end) |

## Why GitHub and not drag-and-drop

The sign-in page is a small program that runs on Netlify's servers (an edge function). Netlify's drag-and-drop upload only publishes plain files and does not run these, so this package is deployed through GitHub instead. It is all done in the browser; nothing to install.

## Step 1: Put the files on GitHub (about 5 minutes)

1. Unzip `starship-yard-netlify.zip`. You get a folder named `starship-yard-site` containing `public`, `netlify`, `netlify.toml` and this README.
2. Go to **https://github.com** and sign in (or create a free account).
3. Click the **+** at the top right, then **New repository**.
4. Name it `starship-yard`. Choose **Private**. Leave everything else as it is, and click **Create repository**.
5. On the new, empty repository page, click the link **uploading an existing file**.
6. Open the `starship-yard-site` folder on your computer, select **everything inside it** (`public`, `netlify`, `netlify.toml`, `README-DEPLOY.md`, and the backup file), and drag the selection onto the GitHub upload area. Drag the contents, not the `starship-yard-site` folder itself.
7. Wait until all files are listed, then click **Commit changes**.
8. Check: the repository's main page should show `netlify`, `public` and `netlify.toml` at the top level.

## Step 2: Connect Netlify (about 5 minutes)

1. Go to **https://app.netlify.com** and sign in.
2. Click **Add new project**, then **Import an existing project**, then **GitHub**.
3. Approve Netlify's access to GitHub when asked. You can limit it to the `starship-yard` repository only.
4. Pick `starship-yard` from the list.
5. On the settings screen, leave **Build command** empty. **Publish directory** should show `public` (read from `netlify.toml`); if it is empty, type `public`.
6. Click **Deploy**. After a minute, Netlify shows the site address, such as `https://jolly-otter-12ab34.netlify.app`.
7. Open the address. You should see the Second Watch sign-in page. Enter the access code above.
8. Optional: rename the address under **Project configuration → General → Project details → Change project name**.

## Changing the access code, or adding codes

The access code lives in `gate.js` as a default. To change it without editing code:

1. In Netlify, open the project, go to **Project configuration → Environment variables**, and click **Add a variable** (choose to add a single variable).
2. Key: `SW_USERS`. Value: `name:code:area`, for example `secondwatch:new-code:all,admiral:my-admin-code:admin` (keep one `admin` entry so you can still see the stats). The name is just a label for you; visitors only type the code. For several codes, separate them with commas, giving each a different code: `secondwatch:warp-five:all,crew2:red-alert:all,admiral:my-admin-code:admin`.
3. Save, then go to **Deploys → Trigger deploy → Deploy project** so the change takes effect.

Changing any code signs everyone out, so they sign in again with the new one. Names and codes cannot contain `:` or `,`.

**Later: a separate Generic login.** Each account already carries an "area" (the last part, `all` today). When we split the Generic version of Second Watch from the Star Trek skin, a Generic-only code will use `generic` there, and the gate will send whoever enters it to the Generic site. Nothing changes for existing accounts.

## Updating the site later

When you get a new zip from me, open the repository on GitHub, click **Add file → Upload files**, drag the new contents in the same way (it replaces files with the same names), and click **Commit changes**. Netlify redeploys on its own within a minute.

## What to tell playtesters

- Open the link and sign in. New players should start with **Read the Second Watch book** (Chapters 1 to 3 take about 15 minutes), then click **Start a new ship**.
- **Saves stay in their own browser.** Ships save to that browser on that device, not to an account. Use **Hangar → Export ship file** to move a ship or send it to the Admiral.
- **Printing.** Launch → Second Watch → Ship record sheet downloads the sheet; open it and print, or save as PDF. Ready-made PDFs are in the Library.
- **3D printing.** Launch → 3D print downloads a .zip of STL files at the chosen sizes.
- Desktop or tablet works best; phones work but are cramped for ship design.

## Good to know

- **How strong is it?** The sign-in check runs on Netlify's servers before any page or file is sent, so the site's contents cannot be reached by guessing addresses. It is a shared playtest code, not bank-grade security: anyone you give it to can pass it on.
- **Search engines.** Every response tells search engines not to index the site, and `robots.txt` asks crawlers to stay out. Crawlers would only see the sign-in page anyway.
- **The Star Trek skin.** Keeping the site behind sign-in for a small group keeps it a private fan project. If you ever open it more widely, make the Generic skin the default and drop the Trek names first.
- **Backup method (drag-and-drop).** If you would rather drag and drop at app.netlify.com/drop, the sign-in page will not run. Instead, rename `drag-and-drop-backup-_headers` to `_headers`, move it into `public/`, and drag the `public` folder onto the drop page. Visitors then get the browser's plain password box instead, which asks for a username (`secondwatch`) and password (`engage-2063`).
