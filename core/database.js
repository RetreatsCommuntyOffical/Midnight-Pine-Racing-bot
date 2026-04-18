const mongoose = require('mongoose');

async function connect() {
    const uri = process.env.MONGO_URI;

    if (!uri || uri.includes('USER:PASS') || uri.includes('REPLACE_')) {
        if (process.env.ALLOW_STARTUP_WITHOUT_DB === 'true') {
            console.warn('⚠️  MONGO_URI not configured — DB-backed commands will fail until connected.');
            return;
        }
        throw new Error('MONGO_URI is not set. Configure it in .env');
    }

    try {
        await mongoose.connect(uri);
        console.log('✅ MongoDB connected');
    } catch (err) {
        if (process.env.ALLOW_STARTUP_WITHOUT_DB === 'true') {
            console.warn('⚠️  MongoDB connection failed:', err.message);
        } else {
            throw err;
        }
    }
}

module.exports = { connect };
