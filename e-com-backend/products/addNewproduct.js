const { connectToDatabase } = require("../db/dbConnection"); // Adjusted to match your directory layout
const { z } = require("zod");

exports.handler = async (event) => {
	// 1. Destructure fields sent from your Admin UI payload
	const { product_name, unit_type, price, stock_quantity, image_url, role } = JSON.parse(event.body);

	const newProduct = {
		product_name,
		unit_type,
		price: price ? Number(price) : undefined, // Convert to number for Zod verification
		stock_quantity: stock_quantity ? Number(stock_quantity) : 0,
		image_url,
		role,
	};

	// 2. Validate input constraints using Zod Schema
	const ProductSchema = z.object({
		product_name: z.string().min(3, {
			message: "Product name must be at least 3 characters long",
		}),
		unit_type: z.enum(["kg", "piece", "gram"], {
			errorMap: () => ({ message: "Unit type must be 'kg', 'piece', or 'gram'" }),
		}),
		price: z.number().positive({ message: "Price must be a positive number" }),
		stock_quantity: z.number().nonnegative({ message: "Stock quantity cannot be negative" }),
		image_url: z.string().url({ message: "Invalid URL format for product image" }).nullable().optional(),
		role: z.literal("admin", {
			errorMap: () => ({ message: "Unauthorized access. Only admins can add products." }),
		}),
	});

	// 3. Evaluate Schema validation criteria
	const validationResult = ProductSchema.safeParse(newProduct);
	if (!validationResult.success) {
		return {
			statusCode: 400,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "Content-Type",
				// "Access-Control-Allow-Methods": "POST, OPTIONS"
			},
			body: JSON.stringify({
				error: validationResult.error.formErrors.fieldErrors,
			}),
		};
	}

	const client = await connectToDatabase();

	try {
		// 4. Duplicate Check: Ensure an item with the same name doesn't exist
		const isDuplicate = await client.query(
			`SELECT COUNT(*) FROM public.products WHERE LOWER(product_name) = LOWER($1)`,
			[newProduct.product_name]
		);

		if (parseInt(isDuplicate.rows[0].count) > 0) {
			return {
				statusCode: 400,
				headers: { "Access-Control-Allow-Origin": "*" },
				body: JSON.stringify({
					message: "A product with this identical name already exists in inventory.",
				}),
			};
		}

		// 5. Determine default stock availability flag status
		const isStockOut = newProduct.stock_quantity > 0 ? false : true;

		// 6. SQL Query execution targeting your specific table schema structure
		const queryText = `
			INSERT INTO public.products (product_name, unit_type, price, stock_quantity, image_url, is_stock_out)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING *;
		`;
		
		const values = [
			newProduct.product_name,
			newProduct.unit_type,
			newProduct.price,
			newProduct.stock_quantity,
			newProduct.image_url || null,
			isStockOut
		];

		const result = await client.query(queryText, values);
		const insertedProduct = result.rows[0];

		// 7. Success output response matching your structure wrapper 
		return {
			statusCode: 200,
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
			body: JSON.stringify({
				message: "Product created successfully in PostgreSQL!",
				product: insertedProduct
			}),
		};

	} catch (error) {
		return {
			statusCode: 500,
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
			body: JSON.stringify({
				message: error.message,
				error: error,
			}),
		};
	} finally {
		// 8. Safely release client back to the connection pool/terminate cleanly 
		await client.end();
	}
};