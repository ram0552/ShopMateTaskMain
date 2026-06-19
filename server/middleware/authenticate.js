const jwt=require('jsonwebtoken');
const authenticate=(req,res,next)=>{
    const authHeader=req.headers.authorization;
    if(!authHeader){
        return res.status(401).json({message:'Token not provided'});
    }
    const token=authHeader.split(' ')[1];
    try{
        const decoded=jwt.verify(token,'access_secret_key');
        req.user=decoded;
        next();
    } catch(err){
        return res.status(401).json({message:'Invalid token'});
    }
}

module.exports=authenticate;

