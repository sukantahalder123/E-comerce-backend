import formidable from "formidable";
import fs from "fs";
import { supabase } from "../db/supabase";
import verifyAdmin from "../middleware/admin";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    // Verify Admin
    await verifyAdmin(req);
    const form = formidable({
      multiples: false,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const image = Array.isArray(files.image)
      ? files.image[0]
      : files.image;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Please select an image",
      });
    }

    const buffer = fs.readFileSync(image.filepath);

    const extension =
      image.originalFilename?.split(".").pop() || "jpg";

    const fileName = `products/${Date.now()}.${extension}`;

    const { data, error } = await supabase.storage
      .from("products")
      .upload(fileName, buffer, {
        contentType: image.mimetype,
        upsert: false,
      });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    const { data: publicData } = supabase.storage
      .from("products")
      .getPublicUrl(data.path);

    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      image_url: publicData.publicUrl,
      path: data.path,
    });

  } catch (error) {
    console.error("Upload Error:", error);

    if (
      error.message === "Access denied" ||
      error.message === "User not found" ||
      error.message === "Account not verified" ||
      error.message === "Authorization header missing" ||
      error.message === "Invalid authorization format" ||
      error.message === "Invalid or expired token"
    ) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}