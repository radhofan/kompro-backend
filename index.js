// index.js
import "dotenv/config";
import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
const PORT = 3000;

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

pool
  .query("SELECT NOW()")
  .then((res) => console.log("Postgres connected:", res.rows[0]))
  .catch((err) => console.error("Postgres connection error:", err));

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.send(`Hello World! Postgres time is: ${result.rows[0].now}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
