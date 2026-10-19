# Setting up the TSP Band App database in Supabase (beginner guide)

Supabase is the online database for the app. You will create a project, paste four SQL files into it, and create your own login. About 20 minutes. Nothing here can break Marks Music: this is a brand-new, separate project.

## Words you will see
- **Project**: your own private database plus login system, hosted by Supabase.
- **SQL Editor**: a page where you paste instructions for the database and press Run.
- **Anon / publishable key**: a public key the web page uses to talk to the database. Safe to put in the page.
- **Secret / service_role key**: a master key. Never paste it into chat, GitHub or the web page.

## Step 1: Account and organization
1. Go to supabase.com and click Start your project / Sign in. Signing in with GitHub is easiest.
2. If asked, create an organization (name it TSP or your own name, plan Free).

## Step 2: New project
1. Click New project.
2. Name: `tsp-band-app`. Database password: click Generate a password, then save it in a password manager (the app never needs it, but you cannot see it again).
3. Region: pick the closest to India, **South Asia (Mumbai)**.
4. Plan: Free. Click Create new project and wait 1 to 2 minutes until the dashboard opens.

## Step 3: Turn off public sign-ups
Without this, anyone who finds your project address could create an account.
1. Left menu: **Authentication**, then **Sign In / Providers**.
2. Open **Email**. Switch **Allow new users to sign up** OFF. Click Save.

## Step 4: Paste the four SQL files, in order
1. Left menu: **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_schema.sql` on your computer, copy everything, paste into the editor, click **Run**. Expect "Success. No rows returned".
3. Click New query again. Repeat for `0002_security.sql`, then `0003_reference_data.sql`, then `0004_import_master_setlist.sql`. Always in this order, one file per query.
4. If Supabase warns about "destructive operations" on one of them, that is normal; confirm and run.
5. If any file shows a red error, stop and send me the exact error text. Do not run the next files.

## Step 5: Check your data arrived
In the SQL Editor, run each line separately:
```sql
select count(*) from songs;            -- expect 50
select count(*) from song_tasks;       -- expect 700
select * from setlist_summary;         -- expect Oct 30, 26 songs, 7954 seconds
```
You can also open **Table Editor** in the left menu and click the `songs` table to see all 50 songs.

## Step 6: Create your own login (you are the admin)
1. In the SQL Editor run this (use your real email):
```sql
insert into member_emails (member_id, email)
select id, 'YOUR-EMAIL@example.com' from members where slug = 'aaron';
```
2. Left menu: **Authentication**, then **Users**, then **Add user**, then **Create new user**. Enter the same email and a password. Tick **Auto Confirm User**. Create.
3. Check the link worked:
```sql
select slug, name, user_id is not null as logged_in_account_linked from members where slug = 'aaron';
```
It must say `true`.
Other band members: later.

## Step 7: Copy the two values the web page needs
1. Click **Connect** at the top of the dashboard (or Project Settings, then API).
2. Copy the **Project URL** (looks like `https://xxxx.supabase.co`) and the **anon** or **publishable** key.
3. Send both to me. Never send the secret / service_role key.
