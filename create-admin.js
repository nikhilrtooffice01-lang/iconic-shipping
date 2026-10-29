require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  if (ADMIN_PASSWORD.length < 12) throw new Error("Admin password must be at least 12 characters.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query(`
    INSERT INTO users(name,email,password_hash,role)
    VALUES($1,$2,$3,'admin')
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'
  `, ["ICONIC Administrator", ADMIN_EMAIL.toLowerCase(), hash]);
  await pool.end();
  console.log("Admin account created/updated.");
})().catch(e => { console.error(e); process.exit(1); });
