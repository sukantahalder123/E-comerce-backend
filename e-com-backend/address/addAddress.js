
const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");

const AddressSchema = z.object({
  user_id: z.string().uuid("Invalid User ID"),

  full_name: z.string().trim().min(2, "Full name is required"),

  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Invalid mobile number"),

  address_line1: z.string().trim().min(5),

  address_line2: z.string().trim().optional().default(""),

  city: z.string().trim().min(2),

  state: z.string().trim().min(2),

  country: z.string().trim().default("India"),

  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Invalid pincode"),

  landmark: z.string().trim().optional().default(""),

  is_default: z.boolean().optional().default(false),
});

export default async function handler(req, res) {
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
    const validation = AddressSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      user_id,
      full_name,
      mobile,
      address_line1,
      address_line2,
      city,
      state,
      country,
      pincode,
      landmark,
      is_default,
    } = validation.data;

    client = await connectToDatabase();

    // Check User
    const user = await client.query(
      `SELECT id FROM users WHERE id = $1`,
      [user_id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Remove previous default address
    if (is_default) {
      await client.query(
        `
        UPDATE shipping_addresses
        SET is_default = FALSE
        WHERE user_id = $1
        `,
        [user_id]
      );
    }

    const result = await client.query(
      `
      INSERT INTO shipping_addresses
      (
        user_id,
        full_name,
        mobile,
        address_line1,
        address_line2,
        city,
        state,
        country,
        pincode,
        landmark,
        is_default
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      RETURNING *
      `,
      [
        user_id,
        full_name,
        mobile,
        address_line1,
        address_line2,
        city,
        state,
        country,
        pincode,
        landmark,
        is_default,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: result.rows[0],
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
      } else {
        await client.end?.();
      }
    }
  }
}