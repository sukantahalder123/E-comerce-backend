const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");

export default async function handler(req, res) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // CORS
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    if (req.method !== "POST") {
        return res.status(405).json({
            error: `Method ${req.method} Not Allowed`,
        });
    }
    let client;

    try {
        // use req.body directly (Vercel auto-parses JSON)
        const {
            product_name,
            unit_type,
            price,
            stock_quantity,
            image_url,
            brand,
            category,
            Description,
        } = req.body;

        const newProduct = {
            product_name,
            unit_type: unit_type || "kg",
            price: Number(price),
            stock_quantity: Number(stock_quantity || 0),
            image_url: image_url || null,
            brand,
            category,
            Description: Description || "",
        };

        // VALIDATION
        const ProductSchema = z.object({
            product_name: z.string().min(1),
            brand: z.string().min(1),
            category: z.string().min(1),
            unit_type: z.enum(["kg", "piece", "gram"]).default("kg"),
            price: z.number().positive(),
            stock_quantity: z.number().nonnegative(),
            image_url: z.string().nullable().optional(),
            Description: z.string().optional(),
        });
        const validation = ProductSchema.safeParse(newProduct);
        if (!validation.success) {
            return res.status(400).json({
                error: validation.error.formErrors.fieldErrors,
            });
        }
        // DB CONNECT
        client = await connectToDatabase();
        // DUPLICATE CHECK
        const duplicate = await client.query(
            `SELECT COUNT(*) FROM public.products WHERE LOWER(product_name)=LOWER($1)`,
            [newProduct.product_name]
        );
        if (parseInt(duplicate.rows[0].count) > 0) {
            return res.status(400).json({
                message: "Product already exists",
            });
        }
        // STOCK FLAG
        const isStockOut = newProduct.stock_quantity <= 0;
        // INSERT
        const query = `
            INSERT INTO public.products
            (product_name, unit_type, price, stock_quantity, image_url, is_stock_out, brand, category, Description)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *;
        `;
        const values = [
            newProduct.product_name,
            newProduct.unit_type,
            newProduct.price,
            newProduct.stock_quantity,
            newProduct.image_url,
            isStockOut,
            newProduct.brand,
            newProduct.category,
            newProduct.Description,
        ];
        const result = await client.query(query, values);
        return res.status(200).json({
            message: "Product created successfully",
            product: result.rows[0],
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
        });
    } finally {
        if (client) await client.end?.();
    }
}