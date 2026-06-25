const { connectToDatabase } = require("../db/dbConnection");

export default async function handler(req, res) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // CORS PRE-FLIGHT
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    // ONLY GET ALLOWED
    if (req.method !== "GET") {
        return res.status(405).json({
            error: `Method ${req.method} Not Allowed`,
        });
    }
    let client;

    try {
        // VERCEL QUERY PARAM
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({
                error: "Product ID is required",
            });
        }
        // DB CONNECT
        client = await connectToDatabase();
        const result = await client.query(
            `SELECT * FROM public.products WHERE product_id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Product not found",
            });
        }
        return res.status(200).json({
            success: true,
            product: result.rows[0],
        });

    } catch (error) {
        console.error("ERROR:", error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
        });

    } finally {
       if (client) await client.end?.();
    }
}