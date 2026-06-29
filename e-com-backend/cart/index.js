const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");
const verifyToken = require("../middleware/auth");

const CartSchema = z.object({
  user_id: z.string().uuid("Invalid User ID"),
  product_id: z.string().uuid("Invalid Product ID"),
  quantity: z.coerce.number().int().positive().default(1),
});

const UpdateCartSchema = z.object({
  cart_id: z.string().uuid("Invalid Cart ID"),
  quantity: z.coerce.number().int().positive(),
});

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
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

    case "add":
      return addToCart(req, res);

    case "list":
      return getCart(req, res);

    case "update":
      return updateCart(req, res);

    case "remove":
      return removeCart(req, res);

    default:
      return res.status(404).json({
        success: false,
        message: "Invalid Action",
      });

  }

}

async function addToCart(req, res) {

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

    const {
      user_id,
      product_id,
      quantity,
    } = validation.data;

    client = await connectToDatabase();

    // Product Exists?
    const product = await client.query(
      `
      SELECT
        id,
        product_name,
        stock_quantity,
        is_stock_out
      FROM products
      WHERE id = $1
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

    // Already Exists?
    const existing = await client.query(
      `
      SELECT *
      FROM cart
      WHERE user_id = $1
      AND product_id = $2
      `,
      [user_id, product_id]
    );

    if (existing.rows.length > 0) {

      const updated = await client.query(
        `
        UPDATE cart
        SET
          quantity = quantity + $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [
          quantity,
          existing.rows[0].id,
        ]
      );

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully",
        cart: updated.rows[0],
      });

    }

    const insert = await client.query(
      `
      INSERT INTO cart
      (
        user_id,
        product_id,
        quantity
      )
      VALUES
      ($1,$2,$3)
      RETURNING *
      `,
      [
        user_id,
        product_id,
        quantity,
      ]
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

async function getCart(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET method allowed",
    });
  }

  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  let client;

  try {

    client = await connectToDatabase();

    const result = await client.query(
      `
      SELECT
        c.id AS cart_id,
        c.quantity,

        p.id AS product_id,
        p.product_name,
        p.brand,
        p.category,
        p.image_url,
        p.unit_type,
        p.price,
        p.stock_quantity,
        p.is_stock_out,

        (p.price * c.quantity) AS subtotal

      FROM cart c

      INNER JOIN products p
      ON c.product_id = p.id

      WHERE c.user_id = $1

      ORDER BY c.created_at DESC
      `,
      [user_id]
    );

    const grandTotal = result.rows.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0
    );

    return res.status(200).json({
      success: true,
      total_items: result.rowCount,
      grand_total: grandTotal,
      cart: result.rows,
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

async function updateCart(req, res) {

  if (req.method !== "PUT") {
    return res.status(405).json({
      success: false,
      message: "Only PUT method allowed",
    });
  }

  let client;

  try {

    // Verify Customer
    const user = await verifyToken(req);

    const validation = UpdateCartSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.flatten().fieldErrors,
      });
    }

    const { cart_id, quantity } = validation.data;

    client = await connectToDatabase();

    // Check cart belongs to logged-in user
    const cartResult = await client.query(
      `
      SELECT
        c.id,
        c.user_id,
        c.product_id,
        p.stock_quantity,
        p.is_stock_out,
        p.price
      FROM cart c
      INNER JOIN products p
      ON c.product_id = p.id
      WHERE c.id = $1
      AND c.user_id = $2
      `,
      [cart_id, user.id]
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
        quantity = $1,
        updated_at = NOW()
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

  } finally {

    if (client) {
      if (typeof client.release === "function") {
        client.release();
      } else {
        await client.end();
      }
    }

  }

}

async function removeCart(req, res) {

  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      message: "Only DELETE method allowed",
    });
  }

  let client;

  try {

    // Verify Customer
    const user = await verifyToken(req);

    const { cart_id } = req.query;

    if (!cart_id) {
      return res.status(400).json({
        success: false,
        message: "Cart ID is required",
      });
    }

    client = await connectToDatabase();

    // Check Cart Item belongs to Logged-in User
    const check = await client.query(
      `
      SELECT *
      FROM cart
      WHERE id = $1
      AND user_id = $2
      `,
      [cart_id, user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    // Delete Cart Item
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

  } finally {

    if (client) {
      if (typeof client.release === "function") {
        client.release();
      } else {
        await client.end();
      }
    }

  }

}