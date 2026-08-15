/* ShopSathi — inject SUPABASE_URL / SUPABASE_ANON_KEY into app.html at build time.
   Runs on Vercel as the build command. The anon key is public by design
   (RLS protects the data); this just avoids committing any URL/key strings. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appHtml = join(root, "public", "app.html");
let html = readFileSync(appHtml, "utf8");

// Keep the committed defaults when env vars are not set, so the
// app still works on a preview deploy without env configuration.
const committed = html.match(/window\.SUPABASE_CONFIG = \{([\s\S]*?)\};/);
const committedUrl = committed ? (committed[1].match(/url:\s*"([^"]*)"/) || [])[1] : "";
const committedKey = committed ? (committed[1].match(/anonKey:\s*"([^"]*)"/) || [])[1] : "";

const url = process.env.SUPABASE_URL || committedUrl || "";
const anonKey = process.env.SUPABASE_ANON_KEY || committedKey || "";

html = html.replace(
  /window\.SUPABASE_CONFIG = \{[\s\S]*?\};/,
  `window.SUPABASE_CONFIG = {\n    url: ${JSON.stringify(url)},\n    anonKey: ${JSON.stringify(anonKey)},\n  };`
);

writeFileSync(appHtml, html);
console.log(`inject-env: wrote SUPABASE_URL=${url ? "set" : "EMPTY"} SUPABASE_ANON_KEY=${anonKey ? "set" : "EMPTY"}`);
