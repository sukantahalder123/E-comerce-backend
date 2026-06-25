import { connectToDatabase } from "../db/dbConnection";

export default async function handler(req, res) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    let client;

    try {
        const method = req.method;
        // Preflight
        if (method === "OPTIONS") {
            return res.status(200).end();
        }
        // Only GET
        if (method !== "GET") {
            return res.status(405).json({
                error: `Method ${method} Not Allowed`,
            });
        }

        client = await connectToDatabase();
        const result = await client.query(`
            SELECT 
            product_id,
            product_name,
            brand,
            category,
            price,
            image_url,
            stock_quantity,
            is_stock_out
            FROM public.products
            ORDER BY product_id DESC;
        `);
        return res.status(200).json({
            success: true,
            count: result.rows.length,
            products: result.rows,
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