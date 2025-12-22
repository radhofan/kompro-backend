/** @format */

import express from "express";
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";

export function createUserRouter(pool) {
  const router = express.Router();

  // --- LOGIN ROUTE ---
  router.post("/login", async (req, res) => {
    console.log("\n========================================");
    console.log("📥 [DEBUG] Request Login Masuk!");

    try {
      // 1. Cek Body Request
      console.log("📦 [DEBUG] Data Body:", req.body);

      const { email, password } = req.body;
      if (!email || !password) {
        console.log("❌ [DEBUG] Email atau Password kosong");
        return res
          .status(400)
          .send({ error: "Email and password are required" });
      }

      // 2. Cek Koneksi DB & Query User
      console.log(`🔍 [DEBUG] Mencari user dengan email: ${email}...`);
      const result = await pool.query(
        'SELECT user_id, username_email, password_hash FROM "User" WHERE username_email = $1',
        [email]
      );

      console.log("📄 [DEBUG] Hasil Query DB:", result.rows);

      if (result.rows.length === 0) {
        console.log("❌ [DEBUG] User TIDAK DITEMUKAN di Database");
        return res.status(401).send({ error: "User not found" });
      }

      const user = result.rows[0];

      // 3. Cek Password
      console.log("🔑 [DEBUG] Cek Password...");
      console.log(`   - Input Frontend: '${password}'`);
      console.log(`   - Data Database : '${user.password_hash}'`);

      if (user.password_hash !== password) {
        console.log("❌ [DEBUG] Password SALAH!");
        return res.status(401).send({ error: "Invalid password" });
      }
      console.log("✅ [DEBUG] Password BENAR!");

      // 4. Generate OTP
      const code = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
      });
      console.log(`🔢 [DEBUG] OTP Generated: ${code}`);

      // 5. Simpan OTP ke DB
      console.log("💾 [DEBUG] Menyimpan OTP ke Database...");
      await pool.query("DELETE FROM user_2fa_codes WHERE user_id = $1", [
        user.user_id,
      ]);

      await pool.query(
        "INSERT INTO user_2fa_codes(user_id, code, expires_at) VALUES($1, $2, NOW() + INTERVAL '5 minutes')",
        [user.user_id, code]
      );
      console.log("✅ [DEBUG] OTP Tersimpan.");

      // 6. Kirim Email (Poin Rawan Error)
      console.log("📧 [DEBUG] Mencoba mengirim email via Nodemailer...");

      // Pastikan EMAIL_USER dan EMAIL_PASS ada di .env
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log("❌ [DEBUG] Config Email di .env KOSONG!");
        throw new Error("Email configuration missing");
      }

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

      console.log("✅ [DEBUG] Email Terkirim!");
      console.log("========================================\n");

      // Response Sukses
      res.status(200).send({
        message: "Login successful, 2FA code sent",
        userId: user.user_id,
        email: user.username_email,
      });
    } catch (err) {
      console.error("🔥 [DEBUG] ERROR FATAL:", err);
      // Kirim error detail ke frontend supaya muncul di SnackBar
      res.status(500).send({ error: "Backend Error: " + err.message });
    }
  });

  // ... (Sisa kode forget-password & verify-2fa biarkan saja dulu) ...

  // --- VERIFY 2FA ---
  router.post("/verify-2fa", async (req, res) => {
    // (Biarkan kode lama atau tambahkan log serupa jika perlu nanti)
    // Untuk sekarang kita fokus debug Login dulu.
    try {
      const { userId, code } = req.body;
      // ... (Kode Asli Anda) ...
      const codeResult = await pool.query(
        "SELECT * FROM user_2fa_codes WHERE user_id = $1 AND code = $2 AND expires_at > NOW()",
        [userId, code]
      );
      if (codeResult.rows.length === 0)
        return res.status(401).send({ error: "Invalid or expired code" });
      await pool.query(
        "DELETE FROM user_2fa_codes WHERE user_id = $1 AND code = $2",
        [userId, code]
      );
      const userResult = await pool.query(
        'SELECT username_email FROM "User" WHERE user_id = $1',
        [userId]
      );
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

  // --- RESEND 2FA ---
  router.post("/resend-2fa", async (req, res) => {
    // ... (Kode Asli Anda) ...
    try {
      const { userId } = req.body;
      // ... logic ...
      res.status(200).send({ message: "2FA code resent" });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to resend" });
    }
  });

  return router;
}
