import { connectToDatabase } from "../db/dbConnection";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  let client;

  try {
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        message: `Method ${req.method} Not Allowed`,
      });
    }

    client = await connectToDatabase();

    const result = await client.query(`
      SELECT
        id,
        category_id,
        product_name,
        brand,
        description,
        image_url,
        category,
        unit_type,
        price,
        stock_quantity,
        is_stock_out,
        sku,
        status,
        created_at,
        updated_at
      FROM public.products
      ORDER BY created_at DESC;
    `);

    return res.status(200).json({
      success: true,
      totalProducts: result.rowCount,
      products: result.rows,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
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