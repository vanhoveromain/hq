// Supabase connection settings for the browser app.
//
// Both values are PUBLIC by design: the URL is the project's address and the
// publishable key only lets the app "ring the doorbell". What protects the data
// is Row Level Security (every table only shows your own rows) and the fact
// that public sign-ups are disabled.
//
// NEVER put the secret / service_role key here (or anywhere in this app).
export const SUPABASE_URL = "https://cmctqoshvncnzxavghqf.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PATtWKyTn8z2ree9fs53jg_3tps8MW4";
