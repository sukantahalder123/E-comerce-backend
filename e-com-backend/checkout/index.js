const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");
const verifyToken = require("../middleware/auth");

const AddressSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required"),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Invalid mobile number"),
  address_line1: z.string().trim().min(5, "Address line 1 is required"),
  address_line2: z.string().trim().optional().default(""),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required"),
  country: z.string().trim().default("India"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Invalid pincode"),
  landmark: z.string().trim().optional().default(""),
  is_default: z.boolean().optional().default(false),
});

const PlaceOrderSchema = z.object({
  address_id: z.string().uuid("Invalid Address ID"),
  payment_method: z.enum(["COD", "UPI", "CARD"]).default("COD"),
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { action } = req.query;

  switch (action) {
    case "add-address":
      return addAddress(req, res);

    case "addresses":
      return getAddresses(req, res);

    case "summary":
      return getCheckoutSummary(req, res);

    case "place-order":
      return placeOrder(req, res);

    default:
      return res.status(404).json({
        success: false,
        message: "Invalid Action",
      });
  }
}

async function addAddress(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST method allowed",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    const validation = AddressSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const address = validation.data;

    client = await connectToDatabase();

    if (address.is_default) {
      await client.query(
        `
        UPDATE shipping_addresses
        SET is_default = FALSE
        WHERE user_id = $1
        `,
        [user.id]
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
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        user.id,
        address.full_name,
        address.mobile,
        address.address_line1,
        address.address_line2,
        address.city,
        address.state,
        address.country,
        address.pincode,
        address.landmark,
        address.is_default,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: result.rows[0],
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function getAddresses(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET method allowed",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    client = await connectToDatabase();

    const result = await client.query(
      `
      SELECT *
      FROM shipping_addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at DESC
      `,
      [user.id]
    );

    return res.status(200).json({
      success: true,
      total_addresses: result.rowCount,
      addresses: result.rows,
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function getCheckoutSummary(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET method allowed",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    client = await connectToDatabase();

    const cartResult = await getCartItems(client, user.id);

    if (cartResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Checkout summary fetched successfully",
      checkout: buildSummary(cartResult.rows),
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function placeOrder(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST method allowed",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    const validation = PlaceOrderSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { address_id, payment_method } = validation.data;

    client = await connectToDatabase();

    await client.query("BEGIN");

    const addressResult = await client.query(
      `
      SELECT *
      FROM shipping_addresses
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [address_id, user.id]
    );

    if (addressResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Shipping address not found",
      });
    }

    const cartResult = await getCartItems(client, user.id);

    if (cartResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    for (const item of cartResult.rows) {
      if (item.is_stock_out) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: `${item.product_name} is currently out of stock`,
        });
      }

      if (Number(item.stock_quantity) < Number(item.quantity)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: `Only ${item.stock_quantity} quantity available for ${item.product_name}`,
        });
      }
    }

    const summary = buildSummary(cartResult.rows);

    const orderResult = await client.query(
      `
      INSERT INTO orders
      (
        user_id,
        address_id,
        subtotal,
        delivery_charge,
        discount,
        tax,
        total_amount,
        payment_method,
        payment_status,
        order_status
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        user.id,
        address_id,
        summary.subtotal,
        summary.delivery_charge,
        summary.discount,
        summary.tax,
        summary.total_amount,
        payment_method,
        payment_method === "COD" ? "pending" : "paid",
        "placed",
      ]
    );

    const order = orderResult.rows[0];

    for (const item of summary.items) {
      await client.query(
        `
        INSERT INTO order_items
        (
          order_id,
          product_id,
          product_name,
          image_url,
          price,
          quantity,
          subtotal
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          order.id,
          item.product_id,
          item.product_name,
          item.image_url,
          item.price,
          item.quantity,
          item.subtotal,
        ]
      );

      await client.query(
        `
        UPDATE products
        SET
          stock_quantity = stock_quantity - $1,
          is_stock_out = CASE
            WHEN stock_quantity - $1 <= 0 THEN TRUE
            ELSE is_stock_out
          END,
          updated_at = NOW()
        WHERE id = $2
        `,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `
      DELETE FROM cart
      WHERE user_id = $1
      `,
      [user.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: {
        order_id: order.id,
        order_status: order.order_status,
        payment_method,
        payment_status: order.payment_status,
        shipping_address: addressResult.rows[0],
        ...summary,
        created_at: order.created_at,
      },
    });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => { });
    }

    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function getCartItems(client, userId) {
  return client.query(
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
    [userId]
  );
}

function buildSummary(cartItems) {
  const items = cartItems.map((item) => {
    const itemSubtotal = Number(item.price) * Number(item.quantity);

    return {
      cart_id: item.cart_id,
      product_id: item.product_id,
      product_name: item.product_name,
      image_url: item.image_url,
      price: Number(item.price),
      quantity: Number(item.quantity),
      subtotal: Number(itemSubtotal.toFixed(2)),
    };
  });

  const subtotal = Number(
    items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
  );

  const delivery_charge = subtotal >= 500 ? 0 : 40;

  const discount =
    subtotal >= 1000 ? Number((subtotal * 0.05).toFixed(2)) : 0;

  const tax = Number(((subtotal - discount) * 0.05).toFixed(2));

  const total_amount = Number(
    (subtotal + delivery_charge + tax - discount).toFixed(2)
  );

  return {
    total_items: items.length,
    subtotal,
    delivery_charge,
    discount,
    tax,
    total_amount,
    items,
  };
}

function handleError(err, res) {
  if (
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
}

async function closeClient(client) {
  if (!client) return;

  if (typeof client.release === "function") {
    client.release();
  } else if (typeof client.end === "function") {
    await client.end();
  }
}