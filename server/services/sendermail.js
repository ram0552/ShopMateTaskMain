const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Creates and returns a Nodemailer transporter configured from environment variables.
 * Handles port parsing, TLS settings, connection timeouts, and authentication safely.
 */
const getTransporter = () => {
    const host = process.env.MAIL_SERVER?.trim();
    const port = Number.parseInt(process.env.MAIL_PORT || '587', 10);
    const user = process.env.MAIL_USERNAME?.trim();
    const pass = process.env.MAIL_PASSWORD?.trim();

    if (!host || !user || !pass) {
        throw new Error(
            `SMTP is not configured properly. Missing required environment variables: ${
                [!host && 'MAIL_SERVER', !user && 'MAIL_USERNAME', !pass && 'MAIL_PASSWORD']
                    .filter(Boolean)
                    .join(', ')
            }`
        );
    }

    const isGmail = host === 'smtp.gmail.com' || host.toLowerCase().includes('gmail');

    // For Gmail, Nodemailer's built-in 'gmail' service is the most reliable configuration
    // as it manages ports, STARTTLS, and SSL/TLS handshakes without cipher mismatches.
    if (isGmail) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user,
                pass
            },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    const isSecure = port === 465 || (process.env.MAIL_USE_TLS === 'true' && port !== 587);

    return nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: {
            user,
            pass
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: {
            rejectUnauthorized: false
        }
    });
};

/**
 * Sends an email verification link to a registered user.
 *
 * @param {string} email - Destination email address
 * @param {string} name - User's display name
 * @param {string} token - Signed JWT verification token
 * @returns {Promise<object>} Nodemailer sendMail info
 */
const sendVerificationEmail = async (email, name, token) => {
    const serverUrl = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const verificationLink = `${serverUrl}/api/users/verify-email/${token}`;
    const fromAddress = process.env.MAIL_USERNAME
        ? `"ShopMate" <${process.env.MAIL_USERNAME.trim()}>`
        : 'no-reply@shopmate.com';

    const transporter = getTransporter();

    return await transporter.sendMail({
        from: fromAddress,
        to: email.trim(),
        subject: 'Verify your ShopMate Account',
        text: `Hello ${name},\n\nPlease verify your email address by visiting this link:\n${verificationLink}\n\nIf you did not create an account on ShopMate, you can safely ignore this email.`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
                <h1 style="color: #111827; font-size: 22px; font-weight: 700; margin-bottom: 8px;">ShopMATE</h1>
                <h2 style="color: #374151; font-size: 18px; font-weight: 600; margin-top: 0;">Verify your email address</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">Hello <strong>${name}</strong>,</p>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">Thank you for signing up for ShopMate! Please verify your email address to activate your account and start shopping.</p>
                <div style="margin: 28px 0; text-align: center;">
                    <a href="${verificationLink}" style="background-color: #111827; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">Verify Email</a>
                </div>
                <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">If the button above does not work, copy and paste this link into your browser:</p>
                <p style="color: #2563eb; font-size: 13px; word-break: break-all;"><a href="${verificationLink}" style="color: #2563eb;">${verificationLink}</a></p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">If you did not register for a ShopMate account, please disregard this email.</p>
            </div>
        `
    });
};

/**
 * Sends a generic transactional email (e.g. Password Reset OTP).
 */
const sendEmail = async ({ to, subject, text, html }) => {
    const transporter = getTransporter();
    const fromAddress = process.env.MAIL_USERNAME
        ? `"ShopMate" <${process.env.MAIL_USERNAME.trim()}>`
        : 'no-reply@shopmate.com';

    return await transporter.sendMail({
        from: fromAddress,
        to: typeof to === 'string' ? to.trim() : to,
        subject,
        text,
        html
    });
};

module.exports = {
    sendVerificationEmail,
    sendEmail
};
