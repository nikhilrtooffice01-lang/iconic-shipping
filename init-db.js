require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Database initialized.");
})().catch(e => { console.error(e); process.exit(1); });
