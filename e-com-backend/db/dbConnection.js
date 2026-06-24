// dbconnection.js
const { Client } = require("pg");
require("dotenv").config();

async function connectToDatabase() {
	try {
		// Pull directly from your environment variables
		const client = new Client({
			host: process.env.POSTGRES_HOST || process.env.POSTGRES_HOST,
			port: process.env.PORT || 6543,                 // Supabase connection pooler port
			database: process.env.POSTGRES_DATABASE || "postgres",
			user: process.env.POSTGRES_USER || process.env.POSTGRES_USER,
			password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_PASSWORD,
			ssl: { rejectUnauthorized: false }              // Required for Supabase production connections
		});
		
		await client.connect();
		return client;
	} catch (error) {
		console.log("Database connection failed: " + error.message);
		throw error;
	}
}

module.exports = {
	connectToDatabase,
};