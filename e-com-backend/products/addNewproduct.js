const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");
const verifyAdmin = require("../middleware/admin");

const ProductSchema = z.object({
  product_name: z.string().trim().min(2, "Product name is required"),
  brand: z.string().trim().optional().default(""),
  category: z.string().trim().min(1, "Category is required"),
  unit_type: z
    .enum(["kg", "piece", "gram", "dozen", "ml"])
    .default("piece"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  stock_quantity: z.coerce.number().min(0).default(0),
  image_url: z.string().url().optional().or(z.literal("")),
  description: z.string().optional().default(""),
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  let client;
  let admin;

  try {
    // Verify Admin Login
    admin = await verifyAdmin(req);

    // Validate Request
    const validation = ProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const product = validation.data;

    client = await connectToDatabase();

    // Check Duplicate Product
    const duplicate = await client.query(
      `
      SELECT id
      FROM products
      WHERE LOWER(product_name)=LOWER($1)
      LIMIT 1
      `,
      [product.product_name]
    );

    if (duplicate.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "Product already exists",
      });
    }

        const query = `
      INSERT INTO products
      (
        product_name,
        unit_type,
        price,
        stock_quantity,
        image_url,
        brand,
        category,
        description
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8
      )
      RETURNING *;
    `;

    const values = [
      product.product_name,
      product.unit_type,
      product.price,
      product.stock_quantity,
      product.image_url || null,
      product.brand,
      product.category,
      product.description,
    ];

    const result = await client.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: result.rows[0],
    });

  } catch (err) {

    if (
      err.message === "Access denied" ||
      err.message === "User not found" ||
      err.message === "Account not verified" ||
      err.message === "Authorization header missing" ||
      err.message === "Invalid authorization format" ||
      err.message === "Invalid or expired token"
    ) {
      return res.status(401).json({
        success: false,
        message: err.message,
      });
    }

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