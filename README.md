# IAS IQ — Daily UPSC Test (with login + auto-updating questions + dashboard)

## What's in this folder

```
index.html            → Router: sends you to login.html or select-quiz.html
login.html             → Log in page
register.html          → Create account page
select-quiz.html        → Pick which day's test to attempt (shown right after login)
quiz.html               → The test itself, for whichever date was picked
dashboard.html          → Score history, streak, trend chart
style.css              → Shared theme
config.js              → Your Supabase keys go here
supabase-schema.sql     → Database setup (run once)
scripts/generate-questions.mjs   → Calls the Groq API, writes a day's questions
.github/workflows/daily-questions.yml  → Runs the script every day automatically
.env.example            → Template for the env vars the generator script needs
```

## How login → quiz flows now

1. `login.html` / `register.html` → on success, you land on **`select-quiz.html`**.
2. `select-quiz.html` lists every date that has questions in `questions_daily`
   (up to today), shows which ones you've already completed, and lets you pick
   one to start. Clicking "Start test" opens `quiz.html?date=YYYY-MM-DD`.
3. `quiz.html` loads questions for whichever date is in the URL — not always
   "today" — so old test days are still attemptable if they were never taken.

## Step 1 — Create a free Supabase project (2 min)

1. Go to https://supabase.com → sign up → **New project**.
2. Once it's created, go to **Project Settings → API**. You'll need:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep this one secret — never put it in `config.js`)
3. Go to **SQL Editor → New query**, paste the entire contents of
   `supabase-schema.sql`, and click **Run**. This creates the two tables
   (`questions_daily`, `attempts`) and the security rules that keep each
   user's data private to them.
4. Go to **Authentication → Providers** and make sure **Email** is enabled
   (it is by default). Optionally, under **Authentication → Settings**, you
   can turn OFF "Confirm email" if you want students to log in immediately
   after signing up without checking their inbox.

## Step 2 — Fill in `config.js`

Open `config.js` and paste your `Project URL` and `anon public` key:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

This key is safe to expose publicly — it only works within the permission
rules you just created in Step 1.

## Step 3 — Host the website (pick one, all free)

**Easiest: Netlify Drop**
Go to https://app.netlify.com/drop and drag the whole `ias-iq` folder
(except `.github` and `scripts`, though it's fine to leave them — they're
just ignored by the browser). You get a live URL instantly.

**Or GitHub Pages**
1. Create a new GitHub repo, push this whole folder to it.
2. Repo → **Settings → Pages** → set source to your main branch.
3. Your site will be live at `https://yourusername.github.io/reponame/`.

**Or Vercel**
Import the repo at https://vercel.com/new — it auto-detects static sites.

> Since you're also using GitHub Actions for the daily cron (Step 4), pushing
> this to a **GitHub repo** and enabling **GitHub Pages** on it is the most
> convenient option — everything lives in one place.

## Step 4 — Automate daily question generation with Groq

This uses **Groq** (console.groq.com — fast open-model inference), not to be
confused with xAI's "Grok". Groq API keys start with `gsk_`.

1. Grab a free API key from https://console.groq.com/keys.
2. Push this folder to a GitHub repository (if you haven't already).
3. In your repo, go to **Settings → Secrets and variables → Actions → New
   repository secret** and add three secrets:
   - `GROQ_API_KEY` — your Groq API key
   - `SUPABASE_URL` — same project URL as in `config.js`
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** key from Step 1
     (this is what lets the cron write questions — never put this in
     `config.js` or any frontend file)
4. That's it. `.github/workflows/daily-questions.yml` is already set up to
   run **every day at 6:00 AM IST** and call `scripts/generate-questions.mjs`,
   which asks Groq for 15 fresh current-affairs MCQs and saves them into
   Supabase for that date.
5. To test it right now without waiting for 6 AM: go to your repo's
   **Actions** tab → **Generate Daily UPSC Questions** → **Run workflow**.

### Testing the generator locally (optional)
```bash
npm install
cp .env.example .env   # then fill in your real keys in .env
npm run generate:local
```
`.env` is git-ignored on purpose — never commit real keys to a public repo.

### If the model name doesn't work
Groq occasionally retires/renames models. If the Action fails with a "model
decommissioned" error, open `scripts/generate-questions.mjs` and change:
```js
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
```
to whichever current model name is listed at https://console.groq.com/docs/models.

### ⚠️ About the key you shared in chat
If you pasted a real Groq API key into a chat at any point (including this
one), treat it as potentially exposed — go to
https://console.groq.com/keys and regenerate/revoke it once you've copied the
new one into your GitHub secrets and local `.env`. This costs nothing and
takes 10 seconds, and avoids someone else racking up usage on your key.

## How it all fits together

- A student visits your site → sees **login/signup** (`index.html`).
- After logging in → redirected to **quiz.html**, which pulls today's
  15 questions from the `questions_daily` table in Supabase.
- On submit, their answers + score get saved to the `attempts` table,
  tagged with their own `user_id` — so nobody can see anyone else's scores.
- **dashboard.html** reads back all of that user's past attempts and shows:
  average score, tests taken, day streak, a score trend chart, and a
  click-to-expand full review of every past test.
- Every morning, GitHub Actions wakes up, asks Grok for a new set of 15
  questions, and drops them into Supabase — fully automatic, no manual work.

## Notes

- One attempt per user per day is enforced by the database itself
  (a student can't retake and overwrite today's score).
- If you ever want to wipe test data, just delete rows from `attempts` or
  `questions_daily` in the Supabase Table Editor — no code changes needed.
