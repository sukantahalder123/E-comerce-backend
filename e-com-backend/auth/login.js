const { connectToDatabase } = require("../db/dbConnection");
const { supabase } = require("../db/supabase");
const { z } = require("zod");
require("dotenv").config();

const LoginSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(6, "Password is required"),
  portal: z.enum(["admin", "customer"]),
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST method allowed",
    });
  }

  let client;

  try {
    // Validate Request
    const validation = LoginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { email, password, portal } = validation.data;

    // Login with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    client = await connectToDatabase();

    // Fetch user from PostgreSQL
    const result = await client.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        phone,
        role,
        is_verified,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [data.user.id]
    );

    if (result.rows.length === 0) {
      await supabase.auth.signOut();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    // Check verification
    if (!user.is_verified) {
      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Account not verified",
      });
    }

    // Admin Portal Login
    if (portal === "admin" && user.role !== "admin") {
      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Only admins can login.",
      });
    }

    // Customer Portal Login
    if (portal === "customer" && user.role !== "customer") {
      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Only customers can login.",
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      message: "Login Successful",
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user,
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });

  } finally {
    if (client) {
      if (typeof client.release === "function") {
        client.release();
      } else if (typeof client.end === "function") {
        await client.end();
      }
    }
  }
}