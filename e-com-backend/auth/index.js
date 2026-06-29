const { connectToDatabase } = require("../db/dbConnection");
const { supabase } = require("../db/supabase");
const { z } = require("zod");


const LoginSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(6, "Password is required"),
  portal: z.enum(["admin", "customer"]),
});

const SignupSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Invalid email"),
  phone: z.string().trim().min(10).max(15),
  password: z.string().min(6, "Password must be at least 6 characters"),
});


export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { action } = req.query;

  switch (action) {

    case "login":
      return login(req, res);

    case "signup":
      return signup(req, res);

    case "logout":
      return logout(req, res);

    case "refresh":
      return refreshToken(req, res);

    default:
      return res.status(404).json({
        success: false,
        message: "Invalid Action",
      });

  }

}

async function login(req, res) {

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

    // Login with Supabase
    const { data, error } =
      await supabase.auth.signInWithPassword({
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

    // Get User
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

    if (!user.is_verified) {

      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Account not verified",
      });

    }

    // Admin Portal
    if (
      portal === "admin" &&
      user.role !== "admin"
    ) {

      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Only admins can login.",
      });

    }

    // Customer Portal
    if (
      portal === "customer" &&
      user.role !== "customer"
    ) {

      await supabase.auth.signOut();

      return res.status(403).json({
        success: false,
        message: "Only customers can login.",
      });

    }

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

async function signup(req, res) {

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
      WHERE email = $1
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
      WHERE phone = $1
      `,
      [phone]
    );

    if (phoneExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Phone already registered",
      });
    }

    // Create Supabase User
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

    // Insert PostgreSQL User
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

async function logout(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST method allowed",
    });
  }

  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify User
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    // Logout from Supabase
    await supabase.auth.signOut();

    return res.status(200).json({
      success: true,
      message: "Logout Successful",
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });

  }

}