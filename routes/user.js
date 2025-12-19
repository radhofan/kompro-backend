import express from "express";
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";

export function createUserRouter(pool) {
  const router = express.Router();

  /**
   * POST /user/login
   *
   * Description:
   *   Logs in a user by email and password. If credentials are correct,
   *   a 6-digit 2FA code is generated, stored in the database, and sent via email.
   *
   * Request Body (JSON):
   *   {
   *     "email": "user@example.com",   // string, required
   *     "password": "userpassword"     // string, required
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "Login successful, 2FA code sent",
   *     "userId": 1,                   // integer, the ID of the logged-in user
   *     "email": "user@example.com"    // string, user’s email
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "Email and password are required" }
   *
   *   401 Unauthorized
   *     { "error": "User not found" }
   *     { "error": "Invalid password" }
   *
   *   500 Internal Server Error
   *     { "error": "Login failed" }
   *
   * Notes:
   *   - The user must verify the 2FA code via POST /user/verify-2fa to complete login.
   *   - No password hashing is implemented in this version.
   */
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
        'SELECT user_id, username_email, password_hash FROM "User" WHERE username_email = $1',
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

      // generate 6-digit 2FA code
      const code = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
      });

      // delete any existing 2FA codes for this user
      await pool.query("DELETE FROM user_2fa_codes WHERE user_id = $1", [
        user.user_id,
      ]);

      // store code in DB with 5-minute expiry
      await pool.query(
        "INSERT INTO user_2fa_codes(user_id, code, expires_at) VALUES($1, $2, NOW() + INTERVAL '5 minutes')",
        [user.user_id, code]
      );

      // send code via email
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: '"MyApp" <no-reply@myapp.com>',
        to: user.username_email,
        subject: "Your 2FA code",
        text: `Your 2FA code is: ${code}`,
      });

      // response
      res.status(200).send({
        message: "Login successful, 2FA code sent",
        userId: user.user_id,
        email: user.username_email,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Login failed" });
    }
  });

  /**
   * POST /user/forget-password
   *
   * Description:
   *   Resets a user's password. The user must provide their userId, email, and new password.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,                   // integer, required
   *     "email": "user@example.com",   // string, required
   *     "newPassword": "newpassword"   // string, required
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "Password updated successfully",
   *     "userId": 1,
   *     "email": "user@example.com"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId, email and newPassword are required" }
   *
   *   404 Not Found
   *     { "error": "User not found" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to reset password" }
   */
  router.post("/forget-password", async (req, res) => {
    try {
      const { userId, email, newPassword } = req.body;

      if (!userId || !email || !newPassword) {
        return res.status(400).send({
          error: "userId, email and newPassword are required",
        });
      }

      // check if user exists
      const userResult = await pool.query(
        'SELECT * FROM "User" WHERE user_id = $1 AND username_email = $2',
        [userId, email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      // update password (not hashed)
      await pool.query(
        'UPDATE "User" SET password_hash = $1 WHERE user_id = $2',
        [newPassword, userId]
      );

      res.status(200).send({
        message: "Password updated successfully",
        userId,
        email,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to reset password" });
    }
  });

  /**
   * POST /user/verify-2fa
   *
   * Description:
   *   Verifies the 6-digit 2FA code sent to the user via email.
   *   If the code is valid and not expired, it is consumed and login is completed.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,           // integer, required, the ID of the user attempting login
   *     "code": "123456"       // string, required, the 6-digit 2FA code
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "2FA verified",
   *     "userId": 1,                // integer, the verified user's ID
   *     "email": "user@example.com" // string, the verified user's email
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId and code are required" }
   *
   *   401 Unauthorized
   *     { "error": "Invalid or expired code" }
   *
   *   500 Internal Server Error
   *     { "error": "2FA verification failed" }
   *
   * Notes:
   *   - Once the code is verified, it is deleted from the database.
   *   - The frontend can now consider the user fully authenticated.
   */
  router.post("/verify-2fa", async (req, res) => {
    try {
      const { userId, code } = req.body;

      if (!userId || !code) {
        return res.status(400).send({ error: "userId and code are required" });
      }

      // check if code exists and is not expired
      const codeResult = await pool.query(
        "SELECT * FROM user_2fa_codes WHERE user_id = $1 AND code = $2 AND expires_at > NOW()",
        [userId, code]
      );

      if (codeResult.rows.length === 0) {
        return res.status(401).send({ error: "Invalid or expired code" });
      }

      // consume the code (delete it)
      await pool.query(
        "DELETE FROM user_2fa_codes WHERE user_id = $1 AND code = $2",
        [userId, code]
      );

      // get user email
      const userResult = await pool.query(
        'SELECT username_email FROM "User" WHERE user_id = $1',
        [userId]
      );

      // response
      res.status(200).send({
        message: "2FA verified",
        userId,
        email: userResult.rows[0].username_email,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "2FA verification failed" });
    }
  });

  /**
   * POST /user/resend-2fa
   *
   * Description:
   *   Resends a new 6-digit 2FA code to the user via email.
   *   The previous code(s) are deleted, and a new code with a fresh 5-minute expiry is inserted.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1           // integer, required, the ID of the user
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "2FA code resent",
   *     "userId": 1,
   *     "email": "user@example.com"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId is required" }
   *
   *   404 Not Found
   *     { "error": "User not found" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to resend 2FA code" }
   */
  router.post("/resend-2fa", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      // get user email
      const userResult = await pool.query(
        'SELECT username_email FROM "User" WHERE user_id = $1',
        [userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      const email = userResult.rows[0].username_email;

      // generate new 6-digit 2FA code
      const code = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
      });

      // delete any previous codes for this user
      await pool.query("DELETE FROM user_2fa_codes WHERE user_id = $1", [
        userId,
      ]);

      // store new code with 5-minute expiry
      await pool.query(
        "INSERT INTO user_2fa_codes(user_id, code, expires_at) VALUES($1, $2, NOW() + INTERVAL '5 minutes')",
        [userId, code]
      );

      // send code via email
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: `"MyApp" <no-reply@myapp.com>`,
        to: email,
        subject: "Your new 2FA code",
        text: `Your new 2FA code is: ${code}`,
      });

      res.status(200).send({ message: "2FA code resent", userId, email });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to resend 2FA code" });
    }
  });

  return router;
}
