# Deploying Starship Yard + Second Watch to Netlify

This package is a complete website with its own **Second Watch sign-in page**. Nobody sees any part of the site (the app, rules, printables, ads or files) until they sign in.

## Sign-in

- **Username:** `secondwatch`
- **Password:** `engage-2367`

The username is not case-sensitive; the password is. Visitors stay signed in on that device for 30 days. **Sign out** is in the top bar of the intro page and of every document page.

## What's in the folder

| Path | What it is |
|---|---|
| `public/` | The website itself: the app (`index.html`), the Library, rules, quick-start, printables, ads, 3D libraries and fonts |
| `netlify/edge-functions/gate.js` | The sign-in page and the check that runs before every page and file |
| `netlify.toml` | Tells Netlify to publish `public/`, run the sign-in gate, and keep search engines out |
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
7. Open the address. You should see the Second Watch sign-in page. Sign in with the username and password above.
8. Optional: rename the address under **Project configuration → General → Project details → Change project name**.

## Changing the password, or adding accounts

The password lives in `gate.js` as a default. To change it without editing code:

1. In Netlify, open the project, go to **Project configuration → Environment variables**, and click **Add a variable** (choose to add a single variable).
2. Key: `SW_USERS`. Value: `username:password:all`, for example `secondwatch:make-it-so:all`. For several accounts, separate them with commas: `secondwatch:make-it-so:all,admiral:red-alert:all`.
3. Save, then go to **Deploys → Trigger deploy → Deploy project** so the change takes effect.

Changing any password signs everyone out, so they sign in again with the new one. Usernames and passwords cannot contain `:` or `,`.

**Later: a separate Generic login.** Each account already carries an "area" (the last part, `all` today). When we split the Generic version of Second Watch from the Star Trek skin, a Generic-only account will use `generic` there, and the gate will send it to the Generic site. Nothing changes for existing accounts.

## Updating the site later

When you get a new zip from me, open the repository on GitHub, click **Add file → Upload files**, drag the new contents in the same way (it replaces files with the same names), and click **Commit changes**. Netlify redeploys on its own within a minute.

## What to tell playtesters

- Open the link and sign in, then click **Start a new ship**.
- **Saves stay in their own browser.** Ships save to that browser on that device, not to an account. Use **Hangar → Export ship file** to move a ship or send it to the Admiral.
- **Printing.** Launch → Second Watch → Ship record sheet downloads the sheet; open it and print, or save as PDF. Ready-made PDFs are in the Library.
- **3D printing.** Launch → 3D print downloads a .zip of STL files at the chosen sizes.
- Desktop or tablet works best; phones work but are cramped for ship design.

## Good to know

- **How strong is it?** The sign-in check runs on Netlify's servers before any page or file is sent, so the site's contents cannot be reached by guessing addresses. It is a shared playtest password, not bank-grade security: anyone you give it to can pass it on.
- **Search engines.** Every response tells search engines not to index the site, and `robots.txt` asks crawlers to stay out. Crawlers would only see the sign-in page anyway.
- **The Star Trek skin.** Keeping the site behind sign-in for a small group keeps it a private fan project. If you ever open it more widely, make the Generic skin the default and drop the Trek names first.
- **Backup method (drag-and-drop).** If you would rather drag and drop at app.netlify.com/drop, the sign-in page will not run. Instead, rename `drag-and-drop-backup-_headers` to `_headers`, move it into `public/`, and drag the `public` folder onto the drop page. Visitors then get the browser's plain password box with the same username and password.
