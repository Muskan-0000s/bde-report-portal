# BDE Overall Report Portal

A small web app for tracking your BDE team's daily reports. Upload each team member's
report, it's parsed automatically, and the whole team's data lives in a real database —
synced live, from any device, for anyone with the link.

## What you need first

1. A free [Supabase](https://supabase.com) account (this is the database).
2. A free [Vercel](https://vercel.com) account (this hosts the app).
3. A GitHub account, to hold the code so Vercel can deploy it.

## Step 1 — Create the database (Supabase)

1. Go to supabase.com → **New project**. Pick any name/region, set a database password (save it somewhere).
2. Once it's created, open **SQL Editor** in the left sidebar → **New query**.
3. Open the `supabase-schema.sql` file in this folder, copy all of it, paste it into the query editor, and click **Run**.
4. Go to **Project Settings → API**. You'll need three values from this page in Step 3:
   - **Project URL**
   - **anon public** key
   - **service_role** key (click "reveal" — keep this one secret, never share it publicly)

## Step 2 — Put this code on GitHub

1. Create a new empty repository on GitHub (e.g. `bde-report-portal`).
2. Upload/push everything in this folder to that repository.
   - Simplest way with no command line: on the new repo's page, use "uploading an existing file" and drag in this whole folder's contents (keep the folder structure intact — `app/`, `lib/`, `package.json`, etc.).

## Step 3 — Deploy to Vercel

1. Go to vercel.com → **Add New → Project** → **Import** your GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add the three values from Step 1:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service_role key
3. Click **Deploy**. After a minute or two you'll get a live URL like `https://bde-report-portal.vercel.app`.

That URL is your portal — share it with your team. Everyone who opens it sees and edits
the same live data.

## Important: there's no login

This app has no sign-in — anyone with the link can view and edit every date's report.
For a team tool that's usually fine, but if you want to lock it down, two easy options:

- **Vercel Password Protection** (Vercel Pro plan) — puts one shared password in front of the whole site.
- Ask me to add a simple login screen on top of this app later.

## Local development (optional)

If you want to run it on your own computer before deploying:

```bash
npm install
cp .env.example .env.local   # then fill in your real Supabase values
npm run dev
```

Then open http://localhost:3000.

## How the import works

Upload a team member's existing report file. The app looks for:
- a `Name of BDE` column (or similar),
- an org/company column to count as "Total calls made",
- a `Positive Response` column,
- a `Meetings scheduled` column,
- `Physical Meets` and `Status` columns, which become "Physical meets done" and "remarks".

If the workbook has a separate tab per date, the tab whose name matches the selected
report date is used automatically. Everything imported stays fully editable afterward —
fix any misread name or number right in the table.
