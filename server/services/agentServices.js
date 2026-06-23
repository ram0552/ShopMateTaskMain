const dotenv = require("dotenv");
dotenv.config();

const { createAgent } = require("langchain");
const { checkOrderStatusTool } = require("../tools/shopTools");



process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;

const agent = createAgent({
  model: "google-genai:gemini-2.5-flash",
  tools: [checkOrderStatusTool],
  systemPrompt:
    "You are a helpful customer support assistant for ShopMate. " +
    "ShopMate is an online store. " +
    "Use the available tools to answer questions about orders. " +
    "Always be polite and concise. " +
    "If you cannot find the information, say so clearly.",
});

async function runShopAgent(userMessage) {
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  return String(result.messages.at(-1).content);
}

module.exports = { runShopAgent };