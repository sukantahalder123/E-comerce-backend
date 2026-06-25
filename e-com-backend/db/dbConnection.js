// db/dbConnection.js
const { Client } = require("pg");
require("dotenv").config();

async function connectToDatabase() {
    try {
        const client = new Client({
            
            host: '',
            port: '', // Your active connection pooler port
            database: '',
            user: '', // Your exact fully-qualified username
            password: '',          // Your exact database password
            ssl: { rejectUnauthorized: false }     // Required for Vercel production to Supabase connections
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