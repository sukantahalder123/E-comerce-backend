// db/dbConnection.js
const { Client } = require("pg");
require("dotenv").config();

async function connectToDatabase() {
    try {
        const client = new Client({
            
            host: 'aws-1-ap-southeast-2.pooler.supabase.com',
            port: 6543, // Your active connection pooler port
            database: 'postgres',
            user: 'postgres.fubffnaxxzsulevlcrzt', // Your exact fully-qualified username
            password: '7nJ70EGLKfjUVpe5',          // Your exact database password
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