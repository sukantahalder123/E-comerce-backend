const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");

const CheckoutSchema = z.object({
  user_id: z.string().uuid("Invalid User ID"),
  address_id: z.string().uuid("Invalid Address ID"),
  payment_method: z.enum(["COD", "UPI", "CARD"]),
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
    // Validate Request
    const validation = CheckoutSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      user_id,
      address_id,
      payment_method,
    } = validation.data;

    client = await connectToDatabase();

    // Check User
    const user = await client.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email
      FROM users
      WHERE id = $1
      `,
      [user_id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check Shipping Address
    const address = await client.query(
      `
      SELECT *
      FROM shipping_addresses
      WHERE id = $1
      AND user_id = $2
      `,
      [address_id, user_id]
    );

    if (address.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shipping address not found",
      });
    }
        // ===============================
    // GET CART ITEMS
    // ===============================

    const cartResult = await client.query(
      `
      SELECT
        c.id AS cart_id,
        c.product_id,
        c.quantity,

        p.product_name,
        p.image_url,
        p.price,
        p.stock_quantity,
        p.is_stock_out

      FROM cart c

      INNER JOIN products p
      ON c.product_id = p.id

      WHERE c.user_id = $1

      ORDER BY c.created_at ASC
      `,
      [user_id]
    );

    // Cart Empty Check
    if (cartResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // ===============================
    // VALIDATE PRODUCTS
    // ===============================

    let subtotal = 0;

    const checkoutItems = [];

    for (const item of cartResult.rows) {

      // Product marked as Stock Out
      if (item.is_stock_out === true) {
        return res.status(400).json({
          success: false,
          message: `${item.product_name} is currently out of stock`,
        });
      }

      // Quantity Validation
      if (item.stock_quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${item.stock_quantity} quantity available for ${item.product_name}`,
        });
      }

      const itemSubtotal =
        Number(item.price) * Number(item.quantity);

      subtotal += itemSubtotal;

      checkoutItems.push({
        cart_id: item.cart_id,
        product_id: item.product_id,
        product_name: item.product_name,
        image_url: item.image_url,
        price: Number(item.price),
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });

    }
        // ===============================
    // CALCULATE TOTALS
    // ===============================

    let delivery_charge = 40;

    // Free Delivery above ₹500
    if (subtotal >= 500) {
      delivery_charge = 0;
    }

    // Discount
    let discount = 0;

    // Example:
    // 5% Discount above ₹1000

    if (subtotal >= 1000) {
      discount = Number((subtotal * 0.05).toFixed(2));
    }

    // GST 5%
    const tax = Number(((subtotal - discount) * 0.05).toFixed(2));

    const total_amount = Number(
      (
        subtotal +
        delivery_charge +
        tax -
        discount
      ).toFixed(2)
    );

    // ===============================
    // SAVE CHECKOUT
    // ===============================

    const checkoutResult = await client.query(
      `
      INSERT INTO checkout
      (
        user_id,
        address_id,
        subtotal,
        delivery_charge,
        discount,
        tax,
        total_amount,
        payment_method,
        status
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9
      )
      RETURNING *
      `,
      [
        user_id,
        address_id,
        subtotal,
        delivery_charge,
        discount,
        tax,
        total_amount,
        payment_method,
        "pending",
      ]
    );

    const checkout = checkoutResult.rows[0];

        // ===============================
    // SUCCESS RESPONSE
    // ===============================

    return res.status(200).json({
      success: true,
      message: "Checkout completed successfully",

      checkout: {
        checkout_id: checkout.id,

        user: {
          id: user.rows[0].id,
          name: `${user.rows[0].first_name} ${user.rows[0].last_name || ""}`.trim(),
          email: user.rows[0].email,
        },

        shipping_address: address.rows[0],

        payment_method,

        total_items: checkoutItems.length,

        subtotal,

        delivery_charge,

        discount,

        tax,

        total_amount,

        items: checkoutItems,

        created_at: checkout.created_at,
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
      } else if (typeof client.end === "function") {
        await client.end();
      }
    }

  }
}
