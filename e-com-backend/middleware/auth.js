const { supabase } = require("../db/supabase");

async function verifyToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new Error("Authorization header missing");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Invalid authorization format");
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid or expired token");
  }

  return data.user;
}

module.exports = verifyToken;