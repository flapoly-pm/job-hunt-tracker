# Job Hunt Tracker

A website and installable Android app (PWA) for tracking a job search. Every user signs in with their own Google account and their data is saved in their own Google Drive, in a folder called **Job Hunt Tracker**. There is no server and no database to run.

## What it does

- Save jobs with the ad link, company, salary, work mode, tech stack, deadline and notes
- Board and list views, with a Today page for upcoming interviews and follow-ups
- Interview rounds with date, format, preparation and notes afterwards
- Contacts per job with their role (agency recruiter, hiring manager, panel and so on)
- CV and cover letter links from Google Drive, chosen per job
- CV match: a score, where you stand out, gaps with suggestions, and the ad highlighted green or amber
- Add jobs from Seek and LinkedIn by sharing from their Android apps, or with a bookmarklet on a computer
- Works offline and syncs to Drive when back online; CSV and JSON export

## One-time setup (about 10 minutes)

You only do this once. After that anyone can use the app by opening your link and signing in.

### 1. Host the files

The app is static files, so any HTTPS host works: GitHub Pages, Netlify, Cloudflare Pages or Firebase Hosting. HTTPS is required for Google sign-in, installing on Android and the Share button. Note the address you get, for example `https://yourname.github.io/jobtracker/`.

### 2. Create the Google project

1. Go to <https://console.cloud.google.com/> and create a project (for example "Job Hunt Tracker").
2. **APIs and Services > Library**: enable **Google Drive API**. Also enable **Google Picker API** if you want the Drive file chooser.
3. **APIs and Services > OAuth consent screen** (Google Auth Platform):
   - User type **External**, fill in the app name and your email.
   - Add these scopes: `.../auth/drive.file`, `userinfo.email`, `userinfo.profile`. `drive.file` lets the app see only files it created or that the user picks, never the rest of their Drive.
   - While the app is in **Testing**, only people you add under **Test users** can sign in (up to 100). To open it to anyone, choose **Publish app**. Check the console for whether Google asks for a review for your scopes; these scopes are normally in the lighter category.
4. **Credentials > Create credentials > OAuth client ID**:
   - Application type **Web application**.
   - **Authorised JavaScript origins**: your site address with no path, for example `https://yourname.github.io`. Add `http://localhost:8080` too if you want to test locally.
   - No redirect URI is needed.
   - Copy the **Client ID**.
5. Optional, for the Drive file picker: **Credentials > Create credentials > API key**. Restrict it to the Picker API and to your site address (HTTP referrers). Also note your **project number** (Dashboard > Project info).

### 3. Edit `config.js`

```js
window.JOBHUNT_CONFIG = {
  GOOGLE_CLIENT_ID: '1234567890-abc123.apps.googleusercontent.com',
  GOOGLE_API_KEY: '',   // optional, enables the Drive picker
  GOOGLE_APP_ID: '',    // optional, the project number
};
```

Upload the files again. Open your site and press **Continue with Google**.

Without the API key, people can still use the app: they paste a Drive share link for each CV or cover letter and paste their CV text.

## Sharing it with other people

Send them your site address. When they sign in, the app creates the **Job Hunt Tracker** folder in their Drive, with a `jobhunt-data.json` file inside. You never see their data. Each person adds their own CV in **Settings**.

## Installing on Android

1. Open the site in Chrome.
2. Menu, then **Install app** (or **Add to Home screen**).
3. In the Seek or LinkedIn app, open a job, tap **Share**, and choose **Job Hunt Tracker**. The link and title arrive ready to save.

## CV matching and privacy

- CV matching and "fill in the details from the ad" use the Claude API with the user's own key from <https://console.anthropic.com/>. Usage is billed to that key's owner. The key is kept on the device unless the user ticks the option to keep it in their Drive file.
- When the user runs an analysis, the CV text and ad text are sent from their browser to Anthropic and nowhere else.
- Seek and LinkedIn have no public job API, so the app does not fetch ads for you. Share the link, then paste the ad text or let the bookmarklet send it.

## Running locally

```bash
cd jobtracker
python3 -m http.server 8080
```

Open <http://localhost:8080> (add this origin in the Google console first).

## Files

- `index.html`, `styles.css`, `config.js`: page, styles and your settings
- `js/store.js`: Google sign-in, Drive storage, offline cache, sync and merge
- `js/ai.js`: Claude API calls
- `js/views.js`, `js/drawer.js`, `js/ui-core.js`: screens
- `js/util.js`: data model and helpers
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and installation
