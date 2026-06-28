const { connectToDatabase } = require("../db/dbConnection");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
      } else {
        await client.end?.();
      }
    }
  }
}