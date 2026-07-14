const bcrypt = require('bcrypt');

const { getDB } = require('../config//db');
const jwt = require('jsonwebtoken');

const { sendVerificationEmail, sendEmail } = require('../services/sendermail');

const registerUser = async (req, res) => {
    try {
        const { username, email, password, role, phone_number } = req.body;
        if (!username?.trim()) {
            return res.status(400).json({
                message: "Username is required"
            });
        }

        if (!email?.trim()) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        if (!password?.trim()) {
            return res.status(400).json({
                message: "Password is required"
            });
        }
        const db = getDB();

        const normalizedEmail = email.toLowerCase();

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Create new user
        const newUser = {
            username,
            email: normalizedEmail,
            password: hashedPassword,
            phone_number: phone_number || null, // Optional field
            role: role || 'user', // Default role is 'user'
            isVerified: false, // Email verification status
            createdAt: new Date()
        };
        const result = await db.collection('users').insertOne(newUser);
        const token = jwt.sign({
            userId: result.insertedId,
            email: normalizedEmail
        },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );
        await sendVerificationEmail(normalizedEmail, username, token);

        res.status(201).json({ message: 'User registered successfully. please check your email and verify your account ', userId: result.insertedId });
    }
    catch (error) {
        res.status(500).json({
            message: "server error",
            error: error.message
        })

    }

}

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role
        },
        "access_secret_key",
        { expiresIn: "15m" }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role
        },
        "refresh_secret_key",
        { expiresIn: "7d" }
    );
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDB();

        const user = await db.collection('users').findOne({
            email: email.toLowerCase()
        });

        if (!user) {
            return res.status(401).json({ message: "Invalid email" });
        }
        if (!user.isVerified) {
            return res.status(401).json({ message: "Email not verified. Please verify your email before logging in." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Password" });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { refresh_token: refreshToken } }
        );

        res.status(200).json({
            message: "Login succesful",
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            message: "Login failed",
            error: error.message
        });
    }
};

const refreshUserToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ message: "Refresh token is required" });
        }
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, "refresh_secret_key");
        } catch (err) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }
        const db = getDB();
        const user = await db.collection('users').findOne({ email: decoded.email, refresh_token: refreshToken });
        if (!user) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { refresh_token: newRefreshToken } }
        );
        res.status(200).json({
            message: "Token refreshed successfully",
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Token refresh failed",
            error: error.message
        });
    }
}

const sendPasswordResetOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const db = getDB();
        const userCollections = db.collection('users');
        const normalizedEmail = email.toLowerCase();
        const user = await userCollections.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ message: "No account found with this email" });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

        console.log(`Generated OTP for ${normalizedEmail}: ${otp} (expires at ${otpExpiry})`);

        await userCollections.updateOne(
            { _id: user._id },
            {
                $set: {
                    reset_password_otp_hash: otpHash,
                    reset_password_otp_expires_at: otpExpiry,
                    updated_at: new Date()
                }
            }
        );
        const emailResult = await sendEmail(
            {
                to: normalizedEmail,
                subject: "ShopMate Password Reset OTP",
                text: `Your OTP for password reset is: ${otp}. It will expire in 15 minutes.`,
                html: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It will expire in 15 minutes.</p>`
            }
        )
        console.log(`Email sent to ${normalizedEmail}: ${emailResult}`);
        res.status(200).json({ message: "Password reset OTP sent to your email" });

    }
    catch (error) {
        res.status(500).json({
            message: "Failed to send password reset OTP",
            error: error.message
        });
    }
}

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;
        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "Email, OTP, new password and confirm password are required" });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "New password and confirm password do not match" });
        }
        const db = getDB();
        const userCollections = db.collection('users');
        const normalizedEmail = email.toLowerCase();
        const user = await userCollections.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ message: "No account found with this email" });
        }
        if (!user.reset_password_otp_hash || !user.reset_password_otp_expires_at) {
            return res.status(400).json({ message: "No OTP request found for this email" });
        }

        const otpExpired = new Date() > user.reset_password_otp_expires_at;
        if (otpExpired) {
            return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }


        const validotp = await bcrypt.compare(otp, user.reset_password_otp_hash);
        if (!validotp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await userCollections.updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    refreshToken: null,
                    reset_password_otp_hash: null,
                    reset_password_otp_expires_at: null,
                    updated_at: new Date()
                }
            }
        );
        res.status(200).json({ message: "Password Updated successfully. Please login with your new password" });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to reset password",
            error: error.message
        });
    }
}

module.exports = {
    registerUser,
    generateAccessToken,
    generateRefreshToken,
    loginUser,
    refreshUserToken,
    sendPasswordResetOTP,
    resetPassword
}

