// vaqtinchalik diagnostika: admin kemasi bilan Edge Function'ni chaqirib,
// "Bunga ruxsatingiz yo'q" sababini aniq ko'rish uchun.
const fs = require("fs");
const env = fs.readFileSync(".env", "utf8");
const URL = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.log("usage: node diagnose-403.js <email> <password>");
  process.exit(1);
}

(async () => {
  const t = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tok = await t.json();
  if (!tok.access_token) {
    console.log("LOGIN FAIL", t.status, tok.error_description || tok.msg);
    return;
  }
  console.log("LOGIN OK as", tok.user.email);

  const p = await fetch(
    `${URL}/rest/v1/profiles?select=id,role,is_blocked,login`,
    {
      headers: { apikey: KEY, Authorization: `Bearer ${tok.access_token}` },
    },
  );
  console.log("PROFILE VISIBLE:", p.status, await p.text());

  const f = await fetch(`${URL}/functions/v1/admin-create-user`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${tok.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "update",
      userId: tok.user.id,
      patch: { phone: null },
    }),
  });
  console.log("FUNCTION:", f.status, (await f.text()).slice(0, 400));
})();
