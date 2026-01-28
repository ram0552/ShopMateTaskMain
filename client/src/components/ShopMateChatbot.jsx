import React from 'react';
import ChatBot from 'react-chatbotify';
import axios from 'axios';

const ShopMateChatbot = () => {
    const historyRef = React.useRef([]);

    const API = import.meta.env.VITE_API_URL;

    const fetchPolicyAnswer = async (params) => {
        try {
            const userQuestion = params.userInput;

            historyRef.current.push({ role: 'user', content: userQuestion });

            const response = await axios.post(
                `${API}/api/ai/ask-policy`,
                {
                    question: userQuestion,
                    history: historyRef.current
                }
            );

            const botAnswer = response.data.answer;

            historyRef.current.push({ role: 'model', content: botAnswer });

            return botAnswer;
        } catch (error) {
            console.error("Chatbot API Error:", error);
            return "I apologize, but I'm having trouble accessing the policy right now. Please try again later.";
        }
    };

    const flow = {
        start: {
            message: "Hi! I'm your ShopMATE policy assistant. How can I help you with returns or refunds today?",
            path: "loop"
        },
        loop: {
            message: fetchPolicyAnswer,
            path: "loop"
        }
    };

    return <ChatBot flow={flow} />;
};

export default ShopMateChatbot;
