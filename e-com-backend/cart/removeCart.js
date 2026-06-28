const { connectToDatabase } = require("../db/dbConnection");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      message: "Only DELETE method allowed",
    });
  }

  const { cart_id } = req.query;

  if (!cart_id) {
    return res.status(400).json({
      success: false,
      message: "Cart ID is required",
    });
  }

  let client;

  try {
    client = await connectToDatabase();

    // Check cart item
    const check = await client.query(
      `
      SELECT *
      FROM cart
      WHERE id = $1
      `,
      [cart_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    // Delete cart item
    const result = await client.query(
      `
      DELETE FROM cart
      WHERE id = $1
      RETURNING *
      `,
      [cart_id]
    );

    return res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart: result.rows[0],
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