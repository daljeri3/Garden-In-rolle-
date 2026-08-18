# Tahani Flowers — Staff & Payroll

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
