# QED HQ — database setup

QED HQ has its **own Supabase project** (EU region), separate from the shared hq / Sport HQ project,
so QED client data stays apart from personal data (decided 2026-11-08).

Schema changes only through SQL files in `migrations/`, run in order in the QED project's SQL Editor.
One database serves local testing and the live app, so every migration is flagged before it runs.

## First-time setup (build step 1)

1. **Create the project**: Supabase dashboard → New project. Name `qed-hq`, region in the EU
   (e.g. Frankfurt), and a strong database password saved in your password manager.
2. **Create your account**: Authentication → Users → Add user → Create new user. Use the **same email and
   password** as your hq login (ownhq.app signs in to both projects with them). Tick "Auto Confirm User".
3. **Close sign-ups**: Authentication → Sign In / Providers → turn off "Allow new users to sign up".
   The app's public key is public by design; without this, anyone could create an account here.
4. **Turn on the scheduler**: Integrations → Cron → enable (installs `pg_cron`).
5. **Run the migration**: SQL Editor → new query → paste `migrations/20261108000001_init_schema.sql` → Run.
   Expect "Success". It must run **after** step 2 (the 4 starter links are given to your account).
6. **Check**:
   - Table Editor: `qed_projects`, `qed_tasks`, `qed_links`, each marked "RLS enabled".
   - `qed_links` holds 4 rows (the Tools links).
   - Integrations → Cron → Jobs: `qed-rollover-tasks`, every hour at :05.
7. **For build step 2**, copy from Settings → API Keys: the **Project URL** and the **publishable key**.
   Both are safe to put in browser code. **Never** copy the secret / `service_role` key anywhere.

## What is in the database

| Table | Holds |
|---|---|
| `qed_projects` | Events, non-event projects and sales leads (`type = 'sales'`) |
| `qed_tasks` | Tasks, linked or not to a project |
| `qed_links` | The Tools panel links on Home |

- `qed_rollover_tasks()`: moves every open task due before today (Brussels time) to today. Run by the
  scheduler at 5 past every hour, and by the app when it opens. Safe to run any number of times.
- Every table: Row Level Security, one policy "you only see and change your own rows"; no access for
  visitors who are not logged in.
