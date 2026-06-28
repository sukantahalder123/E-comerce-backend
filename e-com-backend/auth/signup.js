const { connectToDatabase } = require("../db/dbConnection");
const { supabase } = require("../db/supabase");
const { z } = require("zod");
require("dotenv").config();

const SignupSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Invalid email"),
  phone: z.string().trim().min(10).max(15),
  password: z.string().min(6, "Password must be at least 6 characters"),
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
    const validation = SignupSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { name, email, phone, password } = validation.data;

    // Split Name
    const nameParts = name.trim().split(" ");

    const first_name = nameParts[0];

    const last_name = nameParts.slice(1).join(" ");

    client = await connectToDatabase();

    // Check Email
    const emailExists = await client.query(
      `
      SELECT id
      FROM users
      WHERE email=$1
      `,
      [email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Check Phone
    const phoneExists = await client.query(
      `
      SELECT id
      FROM users
      WHERE phone=$1
      `,
      [phone]
    );

    if (phoneExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Phone already registered",
      });
    }

    // Create Supabase Auth User
    const { data, error } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    const authUser = data.user;

    // Insert into PostgreSQL
    const result = await client.query(
      `
      INSERT INTO users
      (
        id,
        first_name,
        last_name,
        email,
        phone,
        role,
        is_verified
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)

      RETURNING
      id,
      first_name,
      last_name,
      email,
      phone,
      role,
      is_verified,
      created_at
      `,
      [
        authUser.id,
        first_name,
        last_name,
        email,
        phone,
        "customer",
        true,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Account Created Successfully",
      user: result.rows[0],
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
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