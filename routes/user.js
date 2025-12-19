import express from "express";

export function createUserRouter(pool) {
  const router = express.Router();

  // POST /user/login
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .send({ error: "Email and password are required" });
      }

      // query user by email
      const result = await pool.query(
        'SELECT username_email, password_hash FROM "User" WHERE username_email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).send({ error: "User not found" });
      }

      const user = result.rows[0];

      // pretend password check (not hashed)
      if (user.password_hash !== password) {
        return res.status(401).send({ error: "Invalid password" });
      }

      // login successful
      res
        .status(200)
        .send({ message: "Login successful", email: user.username_email });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Login failed" });
    }
  });

  return router;
}
