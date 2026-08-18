# Garden In Rolle — Staff & Payroll

Employee records + GPS punch in/out + leave requests + payroll, in one site.
Everyone logs in with a real email + password. Staff only ever see their own
name and can only punch themselves in — nothing else. Managers see everyone.
This is real, deployable code — not a prototype. Follow the steps below in order.
Total time: ~25 minutes, no coding required.

## 1. Create the database (Supabase) — 5 min

1. Go to https://supabase.com → sign up (free) → **New project**
   - Any name, any password (save it somewhere), pick a region close to Kuwait (e.g. `eu-central` or `me-south` if offered)
2. Once the project is ready, click **SQL Editor** in the left sidebar → **New query**
3. Open the file `supabase/schema.sql` from this project, copy ALL of it, paste into the editor, click **Run**
   - This creates the tables and adds 3 starter employees you can edit or delete later
4. Click **Project Settings** (gear icon) → **API**
   - Copy the **Project URL** and the **anon public** key — you'll need both in step 3

## 1b. Create your own login (do this now, before deploying) — 3 min

1. In Supabase, go to **Authentication → Users → Add user**
   - Enter your email and a password. Leave "Auto Confirm User" switched ON.
2. Go back to **SQL Editor → New query** and run this (replace the email with the exact one you just used):
   ```sql
   insert into employees (name, role, email, is_manager, salary)
   values ('Your Name', 'Manager', 'you@example.com', true, 0);
   ```
   This makes you the first manager. From the site itself, you'll add every other
   employee's record — but their login has to be created the same way, in
   **Authentication → Users → Add user**, one at a time. There's no self-signup;
   only you create accounts, which is what keeps this locked down.
3. For staff who don't use email day-to-day, any working email works as a
   username even if they never check the inbox — e.g. `mary@tahaniflowers.app`
   made up on the spot is fine, since Supabase won't need to deliver anything
   there as long as "Auto Confirm User" is on.
4. After creating each person's login, go to the site's **Records** tab and
   add their employee record with that *exact* same email — that's what links
   their login to their name and punches.

## 2. Put the code on GitHub — 5 min

1. Go to https://github.com → sign up if you don't have an account
2. Click **New repository** → name it `tahani-hr` → **Create repository**
3. On your computer, upload all the files in this project folder to that repository
   (easiest way: on the new repo page, click "uploading an existing file" and drag the whole folder in — or if you're comfortable with git: `git init`, `git add .`, `git commit -m "first version"`, then follow GitHub's push instructions)

## 3. Deploy the website (Vercel) — 5 min

1. Go to https://vercel.com → sign up with your GitHub account (free)
2. Click **Add New → Project** → select your `tahani-hr` repository → **Import**
3. Before clicking Deploy, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → paste the Project URL from step 1
   - `VITE_SUPABASE_ANON_KEY` → paste the anon public key from step 1
4. Click **Deploy**. In about a minute you'll get a real URL like `tahani-hr.vercel.app` — that's your live website, with HTTPS (needed for GPS to work on phones)

## 4. Try it

- Open the URL, sign in with the manager login you created in step 1b
- Go to **Records** → add your real staff (delete the 3 sample ones from the SQL seed if you don't want them)
- For each one: create their login in Supabase (**Authentication → Users → Add user**), then add their matching record in **Records** with that same email
- Give them the site URL. They sign in and see only their own name, with a **Punch in** button and their own leave requests — nothing else
- As manager, you'll see an **Overview** tab: today's floor, pending leave to approve, and this month's payroll

## Already deployed? Update without losing data

You already have a live database with real employees and punches in it.
Don't re-run `schema.sql`. Instead, run whichever migration files you
haven't run yet, in order:

1. `supabase/migration_v3.sql` (if you haven't already) — adds payroll adjustments and warnings
2. `supabase/migration_v4.sql` — adds medical certificate storage and the sick/absence fixes described below
3. `supabase/migration_v5.sql` — adds "start counting attendance from" so days before you started using the app aren't counted as absences

Supabase → **SQL Editor → New query** → paste the file → **Run**, for each one.
Then re-upload the project files to your GitHub repo (overwrite what's there) and let Vercel redeploy.

## What's new in this version

- **Garden In Rolle branding** — your real logo, everywhere
- **Live map** in the manager Overview — see where everyone punched today, and every punch has a "map ↗" link straight to Google Maps
- **Work location picker** — search an address or click the map to set the shop's exact GPS point (Settings → Work location); no Google account or API key needed
- **Editable payroll** — tap any employee's payroll row to add a bonus or manual deduction with a note, on top of the automatic math
- **Excel export** — "Export Excel" button in the Overview downloads every punch record (name, date, time, location, GPS, Google Maps link) as a `.xlsx` file
- **Kuwait Labor Law-based deductions and warnings** — see the section below
- **Installable as an app** — see "Install on a phone" below
- **Weekly off day** is now editable from Settings (defaults to Friday)
- **Medical certificates for sick leave**, and **leave balances calculated per Kuwait Labor Law** — see below

## How deductions and warnings work (Kuwait Labor Law)

Kuwait's Private Sector Labor Law (No. 6/2010) sets real rules for this, so the
app follows them rather than an arbitrary formula. There are two genuinely
different legal categories here, and the app now treats them differently:

**Lateness — a disciplinary fine.** Article 38 caps disciplinary wage
deductions at 5 days' pay per month, no matter how many times someone is
late. The app enforces that cap in code. The first late arrival in a
calendar month is a warning only (matching Article 37's requirement to
notify a worker in writing before penalizing them) — deductions apply from
the second late arrival onward, still capped.

**Unexcused absence — simply unpaid time, not a fine.** If someone doesn't
show up and has no approved leave or medical certificate covering that day,
that's not a "penalty" under the law — it's just not earning wages for a
day not worked. So absence deductions are **not** subject to the 5-day cap;
every unexcused absence directly deducts that day's wage from the start. If
an employee has more than 5 unexcused absences in a month, the payroll
screen flags it — Article 41 allows dismissal without notice for excessive
unauthorized absence, though the app only flags this for your review, it
never acts on it automatically.

**Sick leave — Article 69's pay scale, not a flat deduction.** Kuwait law
entitles employees to up to 75 sick days per year, paid on a sliding scale:
15 days full pay, next 10 at 75%, next 10 at 50%, next 10 at 25%, and the
final 30 unpaid. The app tracks each employee's sick days used so far this
calendar year and calculates pay for new sick leave against wherever they
are on that scale. **A medical certificate is required** to submit a sick
leave request — staff upload a photo or PDF of the doctor's note when they
request it, stored privately (only they and managers can see it), and
managers can view it before approving.

**Annual leave** accrues at 2.5 days per month of service (Article 70's
prorated entitlement), shown at the top of each employee's payroll row and
on their own punch screen.

**Starting mid-month?** If you begin using this app partway through a
month, the app has no way to know someone actually showed up on days
before you started tracking — it would otherwise show those as absences.
Set **Settings → Start counting attendance from** to the date you actually
began using the app, and nothing before that date counts against anyone.

Kuwait law does **not** set a fixed table like "15 minutes late = X%
deduction" for lateness — that's specific to other GCC countries, not
Kuwait. Employers set their own lateness penalty schedule, but it must be
filed with the Public Authority for Manpower (PAM) and posted publicly at
the workplace. **This app's Warnings list is a helpful internal record, not
a substitute for that filing** — if you want full legal coverage, get your
actual penalty bylaws reviewed and filed with PAM. I'm not a lawyer, and
this is a reasonable compliant structure based on the law's text, not
certified legal advice.

## Install on a phone (no App Store needed)

This is a Progressive Web App, so staff can install it like a real app icon
without you needing an Apple or Google developer account:

- **iPhone**: open the site in Safari → tap the Share icon → **Add to Home Screen**
- **Android**: open the site in Chrome → tap the ⋮ menu → **Install app** (or **Add to Home Screen**)

It'll appear as a normal app icon and open full-screen, no browser bar. If
you want it in the actual Apple App Store / Google Play Store later, that's
a bigger step — it needs a paid Apple Developer account ($99/year) and a
one-time $25 Google Play fee, plus wrapping this code with a tool like
Capacitor. Worth doing once you've got real staff using this daily; not
necessary to get the app-like experience today.

## How access is locked down

This version has real row-level security in the database, not just in the app:

- A staff login can only ever read or write **their own** punches and leave requests — enforced by the database itself, not just hidden in the interface
- Only a manager login can see the full staff list, approve/reject leave, or change settings
- If someone signs in but you haven't added their matching employee record yet, they'll see a message asking them to check with you — no data is exposed in the meantime

## Local development (optional, only if you want to test on your computer first)

```
npm install
cp .env.example .env    # then fill in your real Supabase values
npm run dev
```
