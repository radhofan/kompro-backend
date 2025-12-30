import express from "express";
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";

// API LIST:

/* --- LOGIN & 2FA --- */
// POST /user/login
// POST /user/forget-password
// POST /user/verify-2fa
// POST /user/resend-2fa

/* --- USERS --- */
// GET /admin/get-user-all
// POST /admin/add-user
// PUT /admin/edit-user
// DELETE /admin/delete-user

/* --- ATTENDANCE --- */
// GET /admin/get-attendance
// POST /admin/get-attendance-user

/* --- NOTIFICATION --- */
// GET /admin/notifications
// POST /admin/add-notification
// DELETE /admin/delete-notification

/* --- OFFICE --- */
// GET /user/get-office-location
// POST /user/set-office-location

export function createAdminRouter(pool) {
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
   * GET /admin/get-user-all
   *
   * Description:
   *   Retrieves all users whose `nim_nip` starts with "NIM".
   *
   * Successful Response (200):
   *   [
   *     {
   *       "userId": 1,
   *       "name": "John Doe",
   *       "usernameEmail": "john@example.com",
   *       "role": "admin",
   *       "nimNip": "NIM123456"
   *     },
   *     ...
   *   ]
   *
   * Error Responses:
   *   500 Internal Server Error
   *     { "error": "Failed to fetch users" }
   */
  router.get("/get-user-all", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT user_id, name, username_email, role, nim_nip
       FROM "User"
       WHERE nim_nip LIKE 'NIM%'
       ORDER BY name ASC`
      );

      const users = result.rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        usernameEmail: row.username_email,
        role: row.role,
        nimNip: row.nim_nip,
      }));

      res.status(200).send(users);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch users" });
    }
  });

  /**
   * GET /admin/get-attendance
   *
   * Description:
   *   Retrieves all attendance records for all users.
   *
   * Successful Response (200):
   *   [
   *     {
   *       "attendanceId": 1,
   *       "userId": 1,
   *       "locationId": 2,
   *       "type": "check-in",
   *       "timestamp": "2025-12-23T09:00:00.000Z",
   *       "userLatitude": 123.45,
   *       "userLongitude": 67.89,
   *       "status": "present",
   *       "notes": "Arrived on time"
   *     },
   *     ...
   *   ]
   *
   * Error Responses:
   *   500 Internal Server Error
   *     { "error": "Failed to fetch attendance" }
   */
  router.get("/get-attendance", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT attendance_id, user_id, location_id, type, "timestamp", user_latitude, user_longitude, status, notes
       FROM "Attendance"
       ORDER BY "timestamp" DESC`
      );

      const attendanceRecords = result.rows.map((row) => ({
        attendanceId: row.attendance_id,
        userId: row.user_id,
        locationId: row.location_id,
        type: row.type,
        timestamp: row.timestamp,
        userLatitude: row.user_latitude,
        userLongitude: row.user_longitude,
        status: row.status,
        notes: row.notes,
      }));

      res.status(200).send(attendanceRecords);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch attendance" });
    }
  });

  /**
   * POST /admin/get-attendance-user
   *
   * Description:
   *   Retrieves attendance records for a single user.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1   // integer, required
   *   }
   *
   * Successful Response (200):
   *   [
   *     {
   *       "attendanceId": 1,
   *       "userId": 1,
   *       "locationId": 2,
   *       "type": "check-in",
   *       "timestamp": "2025-12-23T09:00:00.000Z",
   *       "userLatitude": 123.45,
   *       "userLongitude": 67.89,
   *       "status": "present",
   *       "notes": "Arrived on time"
   *     },
   *     ...
   *   ]
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId is required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to fetch attendance" }
   */
  router.post("/get-attendance-user", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      const result = await pool.query(
        `SELECT attendance_id, user_id, location_id, type, "timestamp", user_latitude, user_longitude, status, notes
       FROM "Attendance"
       WHERE user_id = $1
       ORDER BY "timestamp" DESC`,
        [userId]
      );

      const attendanceRecords = result.rows.map((row) => ({
        attendanceId: row.attendance_id,
        userId: row.user_id,
        locationId: row.location_id,
        type: row.type,
        timestamp: row.timestamp,
        userLatitude: row.user_latitude,
        userLongitude: row.user_longitude,
        status: row.status,
        notes: row.notes,
      }));

      res.status(200).send(attendanceRecords);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch attendance" });
    }
  });

  /**
   * GET /admin/notifications
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
   * POST /admin/add-notification
   *
   * Description:
   *   Adds a new notification.
   *
   * Body Parameters:
   *   notificationId (integer, required) - the ID of the notification
   *   title (string, required) - the title of the notification
   *   message (string, required) - the message content of the notification
   *
   * Successful Response (201):
   *   {
   *     "success": true,
   *     "notificationId": 1,
   *     "title": "New Notification",
   *     "message": "This is a new notification",
   *     "createdAt": "2025-12-25T10:00:00.000Z"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "notificationId, title, and message are required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to add notification" }
   */
  router.post("/add-notification", async (req, res) => {
    try {
      const { notificationId, title, message } = req.body;
      if (!notificationId || !title || !message) {
        return res
          .status(400)
          .send({ error: "notificationId, title, and message are required" });
      }

      const createdAt = new Date();

      await pool.query(
        "INSERT INTO notifications (notification_id, title, message, created_at) VALUES ($1, $2, $3, $4)",
        [notificationId, title, message, createdAt]
      );

      res
        .status(201)
        .send({ success: true, notificationId, title, message, createdAt });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to add notification" });
    }
  });

  /**
   * DELETE /admin/delete-notification
   *
   * Description:
   *   Deletes a notification by ID.
   *
   * Body Parameters:
   *   notificationId (integer, required) - the ID of the notification to delete
   *
   * Successful Response (200):
   *   {
   *     "success": true,
   *     "deletedNotification": {
   *       "notification_id": 1,
   *       "title": "Old Notification",
   *       "message": "This notification will be deleted",
   *       "created_at": "2025-12-23T09:00:00.000Z"
   *     }
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "notificationId is required" }
   *
   *   404 Not Found
   *     { "error": "Notification not found" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to delete notification" }
   */
  router.delete("/delete-notification", async (req, res) => {
    try {
      const { notificationId } = req.body;
      if (!notificationId) {
        return res.status(400).send({ error: "notificationId is required" });
      }

      const result = await pool.query(
        "DELETE FROM notifications WHERE notification_id = $1 RETURNING *",
        [notificationId]
      );

      if (result.rowCount === 0) {
        return res.status(404).send({ error: "Notification not found" });
      }

      res
        .status(200)
        .send({ success: true, deletedNotification: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to delete notification" });
    }
  });

  /**
   * POST /admin/add-user
   *
   * Description:
   *   Adds a new user to the system.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,                // integer, required
   *     "name": "John Doe",          // string, required
   *     "usernameEmail": "john@example.com", // string, required
   *     "password": "password123",   // string, required
   *     "role": "admin",             // string, optional
   *     "nimNip": "123456789"        // string, optional
   *   }
   *
   * Successful Response (201):
   *   {
   *     "success": true,
   *     "userId": 1,
   *     "name": "John Doe",
   *     "usernameEmail": "john@example.com",
   *     "role": "admin",
   *     "nimNip": "123456789"
   *   }
   *
   * Error Responses:
   *   400 Bad Request
   *     { "error": "userId, name, usernameEmail, and password are required" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to add user" }
   */
  router.post("/add-user", async (req, res) => {
    try {
      const { userId, name, usernameEmail, password, role, nimNip } = req.body;

      if (!userId || !name || !usernameEmail || !password) {
        return res.status(400).send({
          error: "userId, name, usernameEmail, and password are required",
        });
      }

      await pool.query(
        `INSERT INTO "User"(user_id, name, username_email, password_hash, role, nim_nip)
       VALUES($1, $2, $3, $4, $5, $6)`,
        [userId, name, usernameEmail, password, role || null, nimNip || null]
      );

      res
        .status(201)
        .send({ success: true, userId, name, usernameEmail, role, nimNip });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to add user" });
    }
  });

  /**
   * PUT /admin/edit-user
   *
   * Description:
   *   Edits an existing user's information.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1,                // integer, required
   *     "name": "John Doe",          // string, optional
   *     "usernameEmail": "john@example.com", // string, optional
   *     "password": "newpassword",   // string, optional
   *     "role": "admin",             // string, optional
   *     "nimNip": "987654321"        // string, optional
   *   }
   *
   * Successful Response (200):
   *   {
   *     "success": true,
   *     "userId": 1
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
   *     { "error": "Failed to edit user" }
   */
  router.put("/edit-user", async (req, res) => {
    try {
      const { userId, name, usernameEmail, password, role, nimNip } = req.body;

      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      // check if user exists
      const checkUser = await pool.query(
        `SELECT * FROM "User" WHERE user_id = $1`,
        [userId]
      );
      if (checkUser.rows.length === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      // build dynamic update query
      const fields = [];
      const values = [];
      let idx = 1;

      if (name) {
        fields.push(`name = $${idx++}`);
        values.push(name);
      }
      if (usernameEmail) {
        fields.push(`username_email = $${idx++}`);
        values.push(usernameEmail);
      }
      if (password) {
        fields.push(`password_hash = $${idx++}`);
        values.push(password);
      }
      if (role) {
        fields.push(`role = $${idx++}`);
        values.push(role);
      }
      if (nimNip) {
        fields.push(`nim_nip = $${idx++}`);
        values.push(nimNip);
      }

      if (fields.length === 0) {
        return res.status(400).send({ error: "No fields to update" });
      }

      values.push(userId); // for WHERE
      const query = `UPDATE "User" SET ${fields.join(
        ", "
      )} WHERE user_id = $${idx}`;
      await pool.query(query, values);

      res.status(200).send({ success: true, userId });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to edit user" });
    }
  });

  /**
   * DELETE /admin/delete-user
   *
   * Description:
   *   Deletes a user by ID.
   *
   * Request Body (JSON):
   *   {
   *     "userId": 1   // integer, required
   *   }
   *
   * Successful Response (200):
   *   {
   *     "success": true,
   *     "deletedUserId": 1
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
   *     { "error": "Failed to delete user" }
   */
  router.delete("/delete-user", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).send({ error: "userId is required" });
      }

      const result = await pool.query(
        `DELETE FROM "User" WHERE user_id = $1 RETURNING *`,
        [userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      res.status(200).send({ success: true, deletedUserId: userId });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to delete user" });
    }
  });

  /**
   * GET /admin/get-office-location
   *
   * Description:
   *   Retrieves Telkom University office location only (location_id = 1).
   *
   * Successful Response (200):
   *   {
   *     "locationId": 1,
   *     "locationName": "Telkom University Bandung",
   *     "latitude": -6.97321,
   *     "longitude": 107.63014,
   *     "radius": 50,
   *     "createdAt": "2025-12-25T10:00:00.000Z"
   *   }
   *
   * Error Responses:
   *   404 Not Found
   *     { "error": "Office location not found" }
   *
   *   500 Internal Server Error
   *     { "error": "Failed to fetch office location" }
   */
  router.get("/get-office-location", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT location_id, location_name, latitude, longitude, radius, created_at
       FROM "Locations"
       WHERE location_id = 1`
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: "Office location not found" });
      }

      const row = result.rows[0];

      res.status(200).send({
        locationId: row.location_id,
        locationName: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
        radius: row.radius,
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch office location" });
    }
  });

  /**
   * POST /admin/set-office-location
   *
   * Request Body (JSON):
   * {
   *   "locationName": "Telkom University Bandung",
   *   "latitude": -6.97321,
   *   "longitude": 107.63014,
   *   "radius": 50
   * }
   *
   * Successful Response (200):
   * {
   *   "success": true,
   *   "locationId": 1,
   *   "locationName": "Telkom University Bandung",
   *   "latitude": -6.97321,
   *   "longitude": 107.63014,
   *   "radius": 50
   * }
   */
  router.post("/set-office-location", async (req, res) => {
    try {
      const { locationName, latitude, longitude, radius } = req.body;

      if (
        !locationName ||
        latitude === undefined ||
        longitude === undefined ||
        radius === undefined
      ) {
        return res.status(400).send({
          error: "locationName, latitude, longitude, and radius are required",
        });
      }

      const existing = await pool.query(
        `SELECT location_id FROM "Locations" WHERE location_id = 1`
      );

      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO "Locations"
         (location_id, location_name, latitude, longitude, radius, created_at)
         VALUES (1, $1, $2, $3, $4, NOW())`,
          [locationName, latitude, longitude, radius]
        );
      } else {
        await pool.query(
          `UPDATE "Locations"
         SET location_name = $1,
             latitude = $2,
             longitude = $3,
             radius = $4
         WHERE location_id = 1`,
          [locationName, latitude, longitude, radius]
        );
      }

      res.status(200).send({
        success: true,
        locationId: 1,
        locationName,
        latitude,
        longitude,
        radius,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to set office location" });
    }
  });

  return router;
}
