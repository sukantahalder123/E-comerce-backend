const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");

const CartSchema = z.object({
  user_id: z.string().uuid("Invalid User ID"),
  product_id: z.string().uuid("Invalid Product ID"),
  quantity: z.coerce.number().int().positive().default(1),
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
    const validation = CartSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.flatten().fieldErrors,
      });
    }

    const { user_id, product_id, quantity } = validation.data;

    client = await connectToDatabase();

    // Product exists?
    const product = await client.query(
      `
      SELECT id,
             product_name,
             stock_quantity,
             is_stock_out
      FROM products
      WHERE id=$1
      `,
      [product_id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.rows[0].is_stock_out) {
      return res.status(400).json({
        success: false,
        message: "Product is Out of Stock",
      });
    }

    if (product.rows[0].stock_quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
      });
    }

    // Already in cart?
    const existing = await client.query(
      `
      SELECT *
      FROM cart
      WHERE user_id=$1
      AND product_id=$2
      `,
      [user_id, product_id]
    );

    if (existing.rows.length > 0) {

      const updated = await client.query(
        `
        UPDATE cart
        SET quantity = quantity + $1,
            updated_at = NOW()
        WHERE id=$2
        RETURNING *
        `,
        [quantity, existing.rows[0].id]
      );

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully",
        cart: updated.rows[0],
      });
    }

    const insert = await client.query(
      `
      INSERT INTO cart(
        user_id,
        product_id,
        quantity
      )
      VALUES($1,$2,$3)
      RETURNING *
      `,
      [user_id, product_id, quantity]
    );

    return res.status(201).json({
      success: true,
      message: "Product added to cart",
      cart: insert.rows[0],
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