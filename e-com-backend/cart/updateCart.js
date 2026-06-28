const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");

const UpdateCartSchema = z.object({
  cart_id: z.string().uuid("Invalid Cart ID"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "PUT") {
    return res.status(405).json({
      success: false,
      message: "Only PUT method allowed",
    });
  }

  let client;

  try {
    const validation = UpdateCartSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.flatten().fieldErrors,
      });
    }

    const { cart_id, quantity } = validation.data;

    client = await connectToDatabase();

    // Get cart + product
    const cartResult = await client.query(
      `
      SELECT
        c.id,
        c.product_id,
        p.stock_quantity,
        p.is_stock_out,
        p.price
      FROM cart c
      INNER JOIN products p
      ON c.product_id = p.id
      WHERE c.id = $1
      `,
      [cart_id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    const cart = cartResult.rows[0];

    if (cart.is_stock_out) {
      return res.status(400).json({
        success: false,
        message: "Product is Out of Stock",
      });
    }

    if (quantity > cart.stock_quantity) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity exceeds available stock",
      });
    }

    const update = await client.query(
      `
      UPDATE cart
      SET
        quantity = $1
      WHERE id = $2
      RETURNING *
      `,
      [quantity, cart_id]
    );

    return res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart: {
        ...update.rows[0],
        subtotal: Number(cart.price) * quantity,
      },
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