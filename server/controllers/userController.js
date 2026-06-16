const bcrypt = require('bcrypt');

const {getDB} = require('../config//db');
const jwt = require('jsonwebtoken');

const registerUser = async (req, res) => {
    try {
        const {username, email, password, role} = req.body;
        const db = getDB();

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({email});
        if (existingUser) {
            return res.status(400).json({message: 'Email already in use'});
        }
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Create new user
        const newUser = {
            username,
            email,
            password: hashedPassword,
            role: role || 'user', // Default role is 'user'
            createdAt: new Date()
        };
        const result = await db.collection('users').insertOne(newUser);
        res.status(201).json({message: 'User registered successfully', userId: result.insertedId});
    }
    catch (error) {
        res.status(500).json({
            message:"server error",
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
        {expiresIn: "15m"}
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
        {expiresIn: "7d"}
    );
};

const loginUser = async (req, res) => {
    try {
        const {email, password} = req.body;
        const db = getDB();

        const user = await db.collection('users').findOne({
            email: email.toLowerCase()
        });

        if (!user) {
            return res.status(401).json({message: "Invalid email"});
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch) {
            return res.status(401).json({message: "Invalid Password"});
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: {refresh_token: refreshToken}}
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
    }catch (error) {
        res.status(500).json({
            message: "Login failed",
            error: error.message
        });
    }
};
   

module.exports = {
    registerUser,
    generateAccessToken,
    generateRefreshToken,
    loginUser
}

