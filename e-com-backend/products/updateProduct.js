const { connectToDatabase } = require("../db/dbConnection");

export default async function handler(req, res) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
    let client;

    try {
        // CORS preflight
        if (req.method === "OPTIONS") {
            return res.status(200).end();
        }
        // only PUT allowed
        if (req.method !== "PUT") {
            return res.status(405).json({
                error: `Method ${req.method} Not Allowed`,
            });
        }
        // get id from query
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({
                error: "Product ID is required",
            });
        }
        client = await connectToDatabase();
        // get current value
        const productRes = await client.query(
            `SELECT is_stock_out FROM public.products WHERE product_id = $1`,
            [id]
        );
        if (productRes.rows.length === 0) {
            return res.status(404).json({
                message: "Product not found",
            });
        }
        const current = productRes.rows[0].is_stock_out;
        // toggle
        const updated = await client.query(
            `
            UPDATE public.products
            SET is_stock_out = $1
            WHERE product_id = $2
            RETURNING *;
            `,
            [!current, id]
        );
        return res.status(200).json({
            success: true,
            message: "Stock status updated",
            product: updated.rows[0],
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
        });
    } finally {
       if (client) await client.end?.();
    }
}

// if (client) {
//             if (typeof client.release === "function") await client.release();
//             else if (typeof client.end === "function") await client.end();
//         }