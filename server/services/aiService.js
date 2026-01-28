require("dotenv").config();
const { Pinecone } = require("@pinecone-database/pinecone");
const { GoogleGenAI } = require("@google/genai");

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    console.error("CRITICAL ERROR: GEMINI_API_KEY is not defined in environment variables.");
}
const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

const pineconeApiKey = process.env.PINECONE_API_KEY;
const pineconeIndexName = process.env.PINECONE_INDEX;

if (!pineconeApiKey || !pineconeIndexName) {
    console.error("CRITICAL ERROR: PINECONE_API_KEY or PINECONE_INDEX is not defined.");
}

const pinecone = new Pinecone({ apiKey: pineconeApiKey });
const index = pinecone.index(pineconeIndexName);

/*
 * Feature 1: Product Description Generation using AI
 * Uses simple text generation.
 */
async function generateProductDescription(productName, category) {
    const prompt = "You are an expert e-commerce copywriter.\n" +
        "Write a catchy, SEO-friendly product description (max " +
        "100 words) for: " + productName + "\n" +
        "Under the category: " + category + "\n" +
        "Tone: Professional yet exciting.";
    try {
        const result = await genAI.models.generateContent(
            {
                model: "gemini-2.5-flash",
                contents: prompt
            });
        return result.text;
    } catch (error) {
        console.error("Error generating product description:", error);
        return "Description unavailable";
    }
}

/*
 * Feature 2: Snap & Sell using AI (Multi-modal)
 * Admin uploads product image, AI generates product description, category and filters.
 */
async function generateProductDetailsFromImage(imageBuffer, mimeType) {
    // 1. Define thse schema for strict JSON output
    // 2. Initialize the model (using standard flash model without strict schema for stability)

    console.log("In generateProductDetailsFromImage", imageBuffer, mimeType);
    // 3. Convert Buffer to Generative Part
    const imagePart = {
        inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: mimeType,
        },
    };

    const prompt = `
        Analyze this product image and extract the details for an e-commerce listing.
        Return ONLY a JSON object with the following properties:
        {
            "name": "A short, catchy product title",
            "description": "A catchy, SEO-friendly product description (max 100 words)",
            "category": "The most appropriate category"
        }
        Do not include markdown formatting like \`\`\`json.
    `;

    try {
        console.log(`Generating details for image. Size: ${imageBuffer.length}, Type: ${mimeType}`);
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        imagePart
                    ]
                }
            ]
        });
        const text = result.text.replace(/```json|```/g, '').trim(); // Clean up markdown if present
        console.log("Gemini Response:", text);
        return JSON.parse(text);
    } catch (error) {
        console.error("Vision Error Full:", error);
        if (error.response) {
            console.error("Vision Error Response:", JSON.stringify(error.response, null, 2));
        }
        throw new Error("Failed to analyze image");
    }
}

/*
 * Feature 3: Semantic Search Embedding Generation
 */
async function generateEmbedding(text) {
    try {
        const result = await genAI.models.embedContent({
            model: 'gemini-embedding-001',
            contents: text
        });
        return result.embeddings[0].values;
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error;
    }
}

/*
 * Feature 4: RAG - Answer Customer Questions about Policy
 */
async function answerCustomerQuestion(question, history = []) {
    try {
        console.log("Answering question:", question);
        console.log("History depth:", history.length);

        // 1. Convert question to vector
        const embeddingResult = await genAI.models.embedContent({
            model: 'gemini-embedding-001',
            contents: question
        });
        const queryVector = embeddingResult.embeddings[0].values;

        // 2. Search Pinecone for context
        const queryResponse = await index.query({
            vector: queryVector,
            topK: 3,
            includeMetadata: true,
            filter: { type: 'policy' } // Only search policy chunks
        });

        const matches = queryResponse.matches || [];
        if (matches.length === 0) {
            return "I couldn't find any specific information about that in our policy.";
        }

        // 3. Construct Context
        const contextText = matches.map(match => match.metadata.text).join("\n\n---\n\n");

        // Format history
        const historyText = history.map(msg => {
            const role = msg.role === 'user' ? 'Customer' : 'Agent';
            return `${role}: ${msg.content}`;
        }).join("\n");

        // 4. Prompt LLM
        const prompt = `
            You are a helpful customer support agent for ShopMATE.
            Use the following context from our Refund & Returns Policy to answer the customer's question.
            If the answer is not in the context, say "I don't have that information in the policy."
            
            Context:
            ${contextText}

            Conversation History:
            ${historyText}
            
            Customer Question: ${question}
            
            Answer:
        `;

        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return result.text;

    } catch (error) {
        console.error("Error answering customer question:", error);
        throw new Error("Failed to generate answer");
    }
}

module.exports = {
    generateProductDescription,
    generateProductDetailsFromImage,
    generateEmbedding,
    answerCustomerQuestion
};