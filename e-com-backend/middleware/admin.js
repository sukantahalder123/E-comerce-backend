const verifyToken = require("./auth");
const { connectToDatabase } = require("../db/dbConnection");

async function verifyAdmin(req) {
  // Verify Supabase Access Token
  const authUser = await verifyToken(req);
  let client;
  try {
    client = await connectToDatabase();
    const result = await client.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        role,
        is_verified
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [authUser.id]
    );

    if (result.rows.length === 0) {
      throw new Error("User not found");
    }
    const user = result.rows[0];
    if (!user.is_verified) {
      throw new Error("Account not verified");
    }
    if (user.role !== "admin") {
      throw new Error("Access denied");
    }
    return user;
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

module.exports = verifyAdmin;