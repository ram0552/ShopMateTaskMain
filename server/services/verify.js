const jwt = require('jsonwebtoken');
const { getDB } = require('../config/db');
require("dotenv").config();

const verifyEmail = async (req, res) => {
    const { token } = req.params;
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');

    try {
        if (!token) {
            return res.redirect(`${clientUrl}/login?verified=false&error=Missing+verification+token`);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
        if (!decoded?.email) {
            return res.redirect(`${clientUrl}/login?verified=false&error=Invalid+token+payload`);
        }

        const db = getDB();
        const result = await db.collection('users').updateOne(
            { email: decoded.email.toLowerCase() },
            {
                $set: {
                    isVerified: true,
                    verifiedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.redirect(`${clientUrl}/login?verified=false&error=Account+not+found`);
        }

        console.log(`[AUTH] Successfully verified email: ${decoded.email}`);
        return res.redirect(`${clientUrl}/login?verified=true`);
    } catch (err) {
        console.error(`[AUTH] Email verification failed: ${err.message}`);
        return res.redirect(`${clientUrl}/login?verified=false&error=Invalid+or+expired+token`);
    }
};

module.exports = {
    verifyEmail
};
