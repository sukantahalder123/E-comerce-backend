const { connectToDatabase } = require("../db/dbConnection");
const verifyToken = require("../middleware/auth");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { action } = req.query;

  switch (action) {
    case "list":
      return getOrders(req, res);

    case "details":
      return getOrderDetails(req, res);

    case "track":
      return trackOrder(req, res);

    default:
      return res.status(404).json({
        success: false,
        message: "Invalid Action",
      });
  }
}

async function getOrders(req, res) {
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
      SELECT
        o.id AS order_id,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.created_at,

        sa.full_name,
        sa.mobile,
        sa.city,
        sa.state,
        sa.pincode,

        COUNT(oi.id) AS total_items

      FROM orders o

      LEFT JOIN shipping_addresses sa
      ON o.address_id = sa.id

      LEFT JOIN order_items oi
      ON o.id = oi.order_id

      WHERE o.user_id = $1

      GROUP BY
        o.id,
        sa.full_name,
        sa.mobile,
        sa.city,
        sa.state,
        sa.pincode

      ORDER BY o.created_at DESC
      `,
      [user.id]
    );

    return res.status(200).json({
      success: true,
      total_orders: result.rowCount,
      orders: result.rows,
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function getOrderDetails(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET method allowed",
    });
  }

  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: "Order ID is required",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    client = await connectToDatabase();

    const orderResult = await client.query(
      `
      SELECT
        o.id AS order_id,
        o.user_id,
        o.address_id,
        o.subtotal,
        o.delivery_charge,
        o.discount,
        o.tax,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.created_at,

        sa.full_name,
        sa.mobile,
        sa.address_line1,
        sa.address_line2,
        sa.city,
        sa.state,
        sa.country,
        sa.pincode,
        sa.landmark

      FROM orders o

      LEFT JOIN shipping_addresses sa
      ON o.address_id = sa.id

      WHERE o.id = $1
      AND o.user_id = $2

      LIMIT 1
      `,
      [order_id, user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const itemsResult = await client.query(
      `
      SELECT
        id AS order_item_id,
        product_id,
        product_name,
        image_url,
        price,
        quantity,
        subtotal
      FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
      `,
      [order_id]
    );

    const order = orderResult.rows[0];

    return res.status(200).json({
      success: true,
      order: {
        order_id: order.order_id,
        user_id: order.user_id,
        subtotal: Number(order.subtotal),
        delivery_charge: Number(order.delivery_charge),
        discount: Number(order.discount),
        tax: Number(order.tax),
        total_amount: Number(order.total_amount),
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        order_status: order.order_status,
        created_at: order.created_at,
        shipping_address: {
          address_id: order.address_id,
          full_name: order.full_name,
          mobile: order.mobile,
          address_line1: order.address_line1,
          address_line2: order.address_line2,
          city: order.city,
          state: order.state,
          country: order.country,
          pincode: order.pincode,
          landmark: order.landmark,
        },
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
}

async function trackOrder(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET method allowed",
    });
  }

  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: "Order ID is required",
    });
  }

  let client;

  try {
    const user = await verifyToken(req);

    client = await connectToDatabase();

    const result = await client.query(
      `
      SELECT
        id AS order_id,
        order_status,
        payment_status,
        created_at,
        updated_at
      FROM orders
      WHERE id = $1
      AND user_id = $2
      LIMIT 1
      `,
      [order_id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = result.rows[0];

    const steps = [
      {
        key: "placed",
        label: "Order Placed",
        completed: true,
      },
      {
        key: "confirmed",
        label: "Order Confirmed",
        completed: ["confirmed", "packed", "shipped", "delivered"].includes(
          order.order_status
        ),
      },
      {
        key: "packed",
        label: "Packed",
        completed: ["packed", "shipped", "delivered"].includes(
          order.order_status
        ),
      },
      {
        key: "shipped",
        label: "Shipped",
        completed: ["shipped", "delivered"].includes(order.order_status),
      },
      {
        key: "delivered",
        label: "Delivered",
        completed: order.order_status === "delivered",
      },
    ];

    return res.status(200).json({
      success: true,
      tracking: {
        order_id: order.order_id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        steps,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await closeClient(client);
  }
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