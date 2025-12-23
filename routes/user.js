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

  /**
   * GET /user/get-notification-latest
   *
   * Description:
   *   Retrieves the latest notification for a user.
   *
   * Query Parameters:
   *   userId (integer, required) - the ID of the user
   *
   * Successful Response (200):
   *   {
   *     "notificationId": 5,
   *     "title": "Alert",
   *     "message": "Unusual login attempt detected on your account.",
   *     "createdAt": "2025-12-23T18:20:00.000Z"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId is required" }
   *
   *   404 Not Found
   *     { "error": "No notifications found" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to fetch latest notification" }
   */
  router.get("/get-notification-latest", async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      const result = await pool.query(
        "SELECT notification_id, title, message, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: "No notifications found" });
      }

      const row = result.rows[0];
      res.status(200).send({
        notificationId: row.notification_id,
        title: row.title,
        message: row.message,
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch latest notification" });
    }
  });

  /**
   * GET /user/notifications
   *
   * Description:
   *   Retrieves all notifications for the user, ordered from newest to oldest.
   *
   * Query Parameters:
   *   userId (integer, required) - the ID of the user
   *
   * Successful Response (200):
   *   [
   *     {
   *       "notificationId": 1,
   *       "title": "Welcome",
   *       "message": "Thanks for signing up! We hope you enjoy our service.",
   *       "createdAt": "2025-12-23T09:00:00.000Z"
   *     },
   *     ...
   *   ]
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId is required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to fetch notifications" }
   */
  router.get("/get-notifications-all", async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      const result = await pool.query(
        "SELECT notification_id, title, message, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );

      const notifications = result.rows.map((row) => ({
        notificationId: row.notification_id,
        title: row.title,
        message: row.message,
        createdAt: row.created_at,
      }));

      res.status(200).send(notifications);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch notifications" });
    }
  });

  /**
   * POST /user/get-user
   *
   * Description:
   *   Retrieves a user by their ID. The userId is sent in the request body.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1   // integer, required
   *   }
   *
   * Successful Response (200):
   *   {
   *     "userId": 1,
   *     "name": "John Doe",
   *     "email": "john@example.com",
   *     "role": "admin",
   *     "nim_nip": "123456789"
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
   *     { "error": "Failed to fetch user" }
   */
  router.post("/get-user", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      const result = await pool.query(
        'SELECT user_id, name, username_email, role, nim_nip FROM "User" WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      const user = result.rows[0];

      res.status(200).send({
        userId: user.user_id,
        name: user.name,
        email: user.username_email,
        role: user.role,
        nim_nip: user.nim_nip,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch user" });
    }
  });

  /**
   * POST /user/check-in
   *
   * Description:
   *   Records a check-in attendance for a user at a specific location.
   *   Automatically sets the type to "check-in" and timestamp to current time.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,            // integer, required
   *     "locationId": 2,        // integer, required
   *     "userLatitude": 123.45, // number, optional
   *     "userLongitude": 67.89, // number, optional
   *     "notes": "Some note"    // string, optional
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "Check-in recorded",
   *     "attendanceId": 10,
   *     "timestamp": "2025-12-23T09:00:00.000Z"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId and locationId are required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to record check-in" }
   */
  router.post("/check-in", async (req, res) => {
    try {
      const { userId, locationId, userLatitude, userLongitude, notes } =
        req.body;

      if (!userId || !locationId) {
        return res
          .status(400)
          .send({ error: "userId and locationId are required" });
      }

      const result = await pool.query(
        `INSERT INTO attendance
       (user_id, location_id, type, user_latitude, user_longitude, notes)
       VALUES ($1, $2, 'check-in', $3, $4, $5)
       RETURNING attendance_id, timestamp`,
        [
          userId,
          locationId,
          userLatitude || null,
          userLongitude || null,
          notes || null,
        ]
      );

      res.status(200).send({
        message: "Check-in recorded",
        attendanceId: result.rows[0].attendance_id,
        timestamp: result.rows[0].timestamp,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to record check-in" });
    }
  });

  /**
   * POST /user/checkout
   *
   * Description:
   *   Records a checkout attendance for a user at a specific location.
   *   Automatically sets the type to "checkout" and timestamp to current time.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,            // integer, required
   *     "locationId": 2,        // integer, required
   *     "userLatitude": 123.45, // number, optional
   *     "userLongitude": 67.89, // number, optional
   *     "notes": "Some note"    // string, optional
   *   }
   *
   * Successful Response (200):
   *   {
   *     "message": "Checkout recorded",
   *     "attendanceId": 11,
   *     "timestamp": "2025-12-23T17:00:00.000Z"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId and locationId are required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to record checkout" }
   */
  router.post("/checkout", async (req, res) => {
    try {
      const { userId, locationId, userLatitude, userLongitude, notes } =
        req.body;

      if (!userId || !locationId) {
        return res
          .status(400)
          .send({ error: "userId and locationId are required" });
      }

      const result = await pool.query(
        `INSERT INTO attendance
       (user_id, location_id, type, user_latitude, user_longitude, notes)
       VALUES ($1, $2, 'checkout', $3, $4, $5)
       RETURNING attendance_id, timestamp`,
        [
          userId,
          locationId,
          userLatitude || null,
          userLongitude || null,
          notes || null,
        ]
      );

      res.status(200).send({
        message: "Checkout recorded",
        attendanceId: result.rows[0].attendance_id,
        timestamp: result.rows[0].timestamp,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to record checkout" });
    }
  });

  return router;
}
