const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { getDB } = require('../config/db');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require("google-auth-library");
const sendermail = require('../services/sendermail');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Register a new user in ShopMate.
 * Safely creates user in MongoDB, catches email delivery failures gracefully,
 * and returns structured status without failing account creation if SMTP is unreachable.
 */
const registerUser = async (req, res) => {
    const correlationId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
    const { username, email, password, role, phone_number } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';

    console.log(`[REGISTRATION] [${correlationId}] Registration request received for email: ${normalizedEmail || 'undefined'}`);

    try {
        if (!username?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        if (!normalizedEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }

        if (!password?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Password is required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        console.log(`[REGISTRATION] [${correlationId}] Request validation completed successfully`);

        const db = getDB();

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
        if (existingUser) {
            console.log(`[REGISTRATION] [${correlationId}] Duplicate email detected: ${normalizedEmail} (isVerified: ${existingUser.isVerified})`);
            if (!existingUser.isVerified) {
                return res.status(400).json({
                    success: false,
                    message: "Email already registered but not verified. Please check your inbox or request a new verification email.",
                    isVerified: false,
                    canResend: true,
                    email: normalizedEmail
                });
            }
            return res.status(400).json({
                success: false,
                message: "Email already in use",
                isVerified: true
            });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log(`[REGISTRATION] [${correlationId}] Password hashing completed`);

        // Create new user
        const newUser = {
            username: username.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            phone_number: phone_number?.trim() || null, // Optional field
            role: role || 'user', // Default role is 'user'
            isVerified: false, // Email verification status
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('users').insertOne(newUser);
        console.log(`[REGISTRATION] [${correlationId}] MongoDB user inserted with ID: ${result.insertedId}`);

        // Generate verification token
        const token = jwt.sign(
            {
                userId: result.insertedId,
                email: normalizedEmail
            },
            process.env.JWT_SECRET || 'default_jwt_secret',
            { expiresIn: '1d' }
        );
        console.log(`[REGISTRATION] [${correlationId}] Verification token generated`);

        // Attempt email delivery with isolated error handling
        let emailSent = false;
        console.log(`[REGISTRATION] [${correlationId}] Attempting verification email delivery via Nodemailer`);
        try {
            await sendermail.sendVerificationEmail(normalizedEmail, username.trim(), token);
            emailSent = true;
            console.log(`[REGISTRATION] [${correlationId}] Verification email delivery succeeded for ${normalizedEmail}`);
        } catch (mailErr) {
            emailSent = false;
            console.error(`[REGISTRATION] [${correlationId}] Verification email delivery failed for ${normalizedEmail}: ${mailErr.message}`);
        }

        console.log(`[REGISTRATION] [${correlationId}] Registration response sent (status: 201, emailSent: ${emailSent})`);

        if (emailSent) {
            return res.status(201).json({
                success: true,
                message: "User registered successfully. Please check your email to verify your account.",
                userId: result.insertedId,
                emailSent: true
            });
        } else {
            return res.status(201).json({
                success: true,
                message: "Account created successfully, but we were unable to send the verification email. Please click 'Resend Verification Email' to try again.",
                userId: result.insertedId,
                emailSent: false,
                canResend: true,
                email: normalizedEmail
            });
        }
    } catch (error) {
        if (error.code === 11000) {
            console.warn(`[REGISTRATION] [${correlationId}] MongoDB unique constraint collision (E11000) for email: ${normalizedEmail}`);
            return res.status(400).json({
                success: false,
                message: "Email already in use"
            });
        }

        console.error(`[REGISTRATION] [${correlationId}] Server error during registration: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: "An unexpected server error occurred during registration. Please try again later."
        });
    }
};

/**
 * Resend verification email to an unverified user.
 */
const resendVerificationEmail = async (req, res) => {
    const correlationId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
    try {
        const { email } = req.body;
        if (!email?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        console.log(`[RESEND-VERIFICATION] [${correlationId}] Request received for: ${normalizedEmail}`);

        const db = getDB();
        const user = await db.collection('users').findOne({ email: normalizedEmail });

        if (!user) {
            console.log(`[RESEND-VERIFICATION] [${correlationId}] No account found for: ${normalizedEmail}`);
            return res.status(404).json({
                success: false,
                message: "No account found with this email"
            });
        }

        if (user.isVerified) {
            console.log(`[RESEND-VERIFICATION] [${correlationId}] Account already verified: ${normalizedEmail}`);
            return res.status(400).json({
                success: false,
                message: "This account is already verified. Please sign in."
            });
        }

        const token = jwt.sign(
            {
                userId: user._id,
                email: normalizedEmail
            },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        console.log(`[RESEND-VERIFICATION] [${correlationId}] Attempting to dispatch verification email`);
        await sendermail.sendVerificationEmail(normalizedEmail, user.username || 'User', token);
        console.log(`[RESEND-VERIFICATION] [${correlationId}] Verification email sent successfully to: ${normalizedEmail}`);

        return res.status(200).json({
            success: true,
            message: "Verification email sent successfully. Please check your inbox."
        });
    } catch (error) {
        console.error(`[RESEND-VERIFICATION] [${correlationId}] Error resending verification email: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: "Failed to send verification email. Please verify your email configuration or try again later."
        });
    }
};

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role
        },
        process.env.JWT_SECRET,
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
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
    );
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const db = getDB();
        const user = await db.collection('users').findOne({
            email: email.toLowerCase()
        });

        if (!user) {
            return res.status(401).json({ message: "Invalid email" });
        }
        if (!user.isVerified) {
            return res.status(401).json({
                message: "Email not verified. Please verify your email before logging in.",
                isVerified: false,
                canResend: true,
                email: user.email
            });
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
                name: user.username,
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

const googleLogin = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                message: "Google token is required"
            });
        }

        // Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();

        const {
            sub,
            email,
            name,
            picture,
            email_verified
        } = payload;

        const db = getDB();

        let user = await db.collection("users").findOne({
            email: email.toLowerCase()
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Account not found. Please register first.",
            });
        }

        // Existing Email but Local Account
        else if (!user.googleId) {
            await db.collection("users").updateOne(
                { _id: user._id },
                {
                    $set: {
                        googleId: sub,
                        provider: "google",
                        avatar: picture,
                        isVerified: true // Google accounts have verified email
                    }
                }
            );

            user.googleId = sub;
            user.provider = "google";
            user.avatar = picture;
            user.isVerified = true;
        }

        // Generate ShopMate Tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await db.collection("users").updateOne(
            { _id: user._id },
            {
                $set: {
                    refresh_token: refreshToken
                }
            }
        );

        res.status(200).json({
            message: "Google Login Successful",
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Google Login Failed",
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
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "refresh_secret_key");
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
};

const sendPasswordResetOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const db = getDB();
        const userCollections = db.collection('users');
        const normalizedEmail = email.toLowerCase().trim();
        const user = await userCollections.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ message: "No account found with this email" });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

        console.log(`[PASSWORD_RESET] Generated OTP for ${normalizedEmail} (expires in 15 minutes)`);

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
        await sendermail.sendEmail(
            {
                to: normalizedEmail,
                subject: "ShopMate Password Reset OTP",
                text: `Your OTP for password reset is: ${otp}. It will expire in 15 minutes.`,
                html: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It will expire in 15 minutes.</p>`
            }
        );
        res.status(200).json({ message: "Password reset OTP sent to your email" });

    }
    catch (error) {
        res.status(500).json({
            message: "Failed to send password reset OTP",
            error: error.message
        });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;
        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "Email, OTP, new password and confirm password are required" });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "New password and confirm password do not match" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }

        const db = getDB();
        const userCollections = db.collection('users');
        const normalizedEmail = email.toLowerCase().trim();
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
                    refresh_token: null, // Invalidate active refresh token
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
};

module.exports = {
    registerUser,
    resendVerificationEmail,
    generateAccessToken,
    generateRefreshToken,
    loginUser,
    refreshUserToken,
    sendPasswordResetOTP,
    resetPassword,
    googleLogin
};
