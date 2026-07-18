const jwt =require('jsonwebtoken');
const {getDB} = require('../config/db');
require("dotenv").config();

const verifyEmail= async (req,res)=>{
    const {token} = req.params;
    try{
        const decoded = jwt.verify(token,process.env.JWT_SECRET);
        const db= getDB();
        const user = await db.collection('users').updateOne(
            {email:decoded.email},
            {
                $set:{
                    isVerified:true,
                    verifiedAt:new Date()
                }
            }
        );
        console.log("CLIENT_URL =", process.env.CLIENT_URL);
        res.redirect(`${process.env.CLIENT_URL}/login?verified=true`);
    } catch(err){
        console.error(err);
        res.redirect(`${process.env.CLIENT_URL}/login?verified=false`);
    }
};

module.exports = {
    verifyEmail
}