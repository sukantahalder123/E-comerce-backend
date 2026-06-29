const { connectToDatabase } = require("../db/dbConnection");
const { z } = require("zod");
const verifyAdmin = require("../middleware/admin");

const ProductSchema = z.object({
  product_name: z.string().trim().min(2, "Product name is required"),
  brand: z.string().trim().optional().default(""),
  category: z.string().trim().min(1, "Category is required"),
  unit_type: z
    .enum(["kg", "piece", "gram", "dozen", "ml"])
    .default("piece"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  stock_quantity: z.coerce.number().min(0).default(0),
  image_url: z.string().url().optional().or(z.literal("")),
  description: z.string().optional().default(""),
});

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
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
      return addProduct(req, res);

    case "list":
      return getAllProducts(req, res);

    case "view":
      return getProduct(req, res);

    case "update":
      return updateProduct(req, res);

    case "delete":
      return deleteProduct(req, res);

    case "stock":
      return toggleStock(req, res);

    default:
      return res.status(404).json({
        success: false,
        message: "Invalid Action",
      });

  }

}

async function addProduct(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  let client;
  let admin;

  try {

    // Verify Admin
    admin = await verifyAdmin(req);

    // Validate Request
    const validation = ProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const product = validation.data;

    client = await connectToDatabase();

    // Check Duplicate
    const duplicate = await client.query(
      `
      SELECT id
      FROM products
      WHERE LOWER(product_name)=LOWER($1)
      LIMIT 1
      `,
      [product.product_name]
    );

    if (duplicate.rowCount > 0) {
      return res.status(409).json({
        success: false,
        message: "Product already exists",
      });
    }

    const query = `
      INSERT INTO products
      (
        product_name,
        unit_type,
        price,
        stock_quantity,
        image_url,
        brand,
        category,
        description
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8
      )
      RETURNING *;
    `;

    const values = [
      product.product_name,
      product.unit_type,
      product.price,
      product.stock_quantity,
      product.image_url || null,
      product.brand,
      product.category,
      product.description,
    ];

    const result = await client.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: result.rows[0],
    });

  } catch (err) {

    if (
      err.message === "Access denied" ||
      err.message === "User not found" ||
      err.message === "Account not verified" ||
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
      } else if (typeof client.end === "function") {
        await client.end();
      }
    }

  }

}

//get all product

async function getAllProducts(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
    });
  }

  let client;

  try {

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

//getproductview

async function getProduct(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
    });
  }

  let client;

  try {

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    client = await connectToDatabase();

    const result = await client.query(
      `
      SELECT
        id,
        product_name,
        brand,
        category,
        unit_type,
        price,
        stock_quantity,
        image_url,
        description,
        created_at
      FROM products
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product: result.rows[0],
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

// updateproduct

async function updateProduct(req, res) {

  if (req.method !== "PUT") {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
    });
  }

  let client;
  let admin;

  try {

    // Verify Admin
    admin = await verifyAdmin(req);

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Validate Request
    const validation = ProductSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      product_name,
      brand,
      category,
      unit_type,
      price,
      stock_quantity,
      image_url,
      description,
    } = validation.data;

    client = await connectToDatabase();

    const query = `
      UPDATE public.products
      SET
        product_name = $1,
        brand = $2,
        category = $3,
        unit_type = $4,
        price = $5,
        stock_quantity = $6,
        image_url = $7,
        description = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *;
    `;

    const values = [
      product_name,
      brand,
      category,
      unit_type,
      price,
      stock_quantity,
      image_url || "",
      description || "",
      id,
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: result.rows[0],
    });

  } catch (err) {

    if (
      err.message === "Access denied" ||
      err.message === "User not found" ||
      err.message === "Account not verified" ||
      err.message === "Authorization header missing" ||
      err.message === "Invalid authorization format" ||
      err.message === "Invalid or expired token"
    ) {
      return res.status(401).json({
        success: false,
        message: err.message,
      });
    }

    console.error("Update Product Error:", err);

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

//deleteproduct

async function deleteProduct(req, res) {

  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} Not Allowed`,
    });
  }

  let client;
  let admin;

  try {

    // Verify Admin
    admin = await verifyAdmin(req);

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    client = await connectToDatabase();

    // Check Product Exists
    const check = await client.query(
      `
      SELECT *
      FROM products
      WHERE id = $1
      `,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete Product
    const result = await client.query(
      `
      DELETE FROM products
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: result.rows[0],
    });

  } catch (err) {

    if (
      err.message === "Access denied" ||
      err.message === "User not found" ||
      err.message === "Account not verified" ||
      err.message === "Authorization header missing" ||
      err.message === "Invalid authorization format" ||
      err.message === "Invalid or expired token"
    ) {
      return res.status(401).json({
        success: false,
        message: err.message,
      });
    }

    console.error("Delete Product Error:", err);

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

//toggle product
async function toggleStock(req, res) {

  if (req.method !== "PATCH") {
    return res.status(405).json({
      success: false,
      message: "Only PATCH method is allowed",
    });
  }

  let client;
  let admin;

  try {

    // Verify Admin
    admin = await verifyAdmin(req);

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    client = await connectToDatabase();

    const result = await client.query(
      `
      UPDATE public.products
      SET
        is_stock_out = NOT is_stock_out,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.rows[0].is_stock_out
        ? "Product marked as Out of Stock"
        : "Product marked as In Stock",
      product: result.rows[0],
    });

  } catch (err) {

    if (
      err.message === "Access denied" ||
      err.message === "User not found" ||
      err.message === "Account not verified" ||
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
      } else if (typeof client.end === "function") {
        await client.end();
      }
    }

  }

}