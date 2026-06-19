const nodeMailer = require('nodemailer');
require('dotenv').config();
const transporter = nodeMailer.createTransport({
    host: process.env.MAIL_SERVER,
    port: process.env.MAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
    }
});

const sendVerificationEmail = async (email ,name,token) => {
    const verificationLink = `http://localhost:3001/api/users/verify-email/${token}`;
    await transporter.sendMail({
        from:`"ShopMate" <${process.env.MAIL_USERNAME}>`,
        to: email,
        subject: 'Email Verification',
        html: `<p>Hello ${name},</p>
               <p>Please verify your email by clicking the link below:</p>
               <a href="${verificationLink}">Verify Email</a>`
    });
}

const sendEmail= async({to,subject,text,html})=>{
    await transporter.sendMail({
        from:`"ShopMate" <${process.env.MAIL_USERNAME}>`,
        to,
        subject,
        text,
        html
    });
}

module.exports = {
    sendVerificationEmail,
    sendEmail
}