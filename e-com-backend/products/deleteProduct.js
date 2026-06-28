const { connectToDatabase } = require("../db/dbConnection");
const verifyAdmin = require("../middleware/admin");

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
    });
  }

  let client;
  let admin;

  try {

    // Verify Admin
    admin = await verifyAdmin(req);

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    client = await connectToDatabase();

    // Check Product Exists
    const check = await client.query(
      `
      SELECT *
      FROM products
      WHERE id = $1
      `,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    // Delete Product
    const result = await client.query(
      `
      DELETE FROM products
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: result.rows[0],
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

    console.error("Delete Product Error:", err);

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