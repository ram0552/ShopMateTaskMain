
const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');

// POST /api/ai/ask-policy
router.post('/ask-policy', async (req, res) => {
    try {
        const { question, history } = req.body;
        if (!question) {
            return res.status(400).json({ error: "Question is required" });
        }

        console.log("Question:", question);
        console.log("History:", history);
        const answer = await aiService.answerCustomerQuestion(question, history);
        res.json({ answer });
    } catch (error) {
        console.error("Error in /ask-policy:", error);
        res.status(500).json({ error: "Failed to process question" });
    }
});

module.exports = router;