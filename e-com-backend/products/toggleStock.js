const { connectToDatabase } = require("../db/dbConnection");

export default async function handler(req, res) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "PUT") {
        return res.status(405).json({ error: "Only PUT allowed" });
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "Product ID required" });
    }

    let client;

    try {
        client = await connectToDatabase();

        // STEP 1: get current stock status
        const result = await client.query(
            `SELECT is_stock_out FROM public.products WHERE product_id=$1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }

        const currentStatus = result.rows[0].is_stock_out;

        //  toggle it
        const updated = await client.query(
            `UPDATE public.products 
            SET is_stock_out=$1 
            WHERE product_id=$2 
            RETURNING *`,
            [!currentStatus, id]
        );

        return res.status(200).json({
            message: "Stock status updated",
            product: updated.rows[0],
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message,
        });
    } finally {
        if (client) await client.end?.();
    }
}