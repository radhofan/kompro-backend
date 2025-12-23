import "dotenv/config";
import express from "express";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;
import { createUserRouter } from "./routes/user.js";

const app = express();
const PORT = 3000;
app.use(express.json());

app.use(cors());
app.use(express.json());

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

const userRouter = createUserRouter(pool);
app.use("/user", userRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
