// require('dotenv')=config()

// const {GoogleGenAI} = require('@google/genai');

// const {
//     StateGraph,
//     Annotation,
//     START,
//     END,
//     MemorySaver,
//     Command,
//     interrupt
// } = require('@langchain/langgraph')

// const {objectId}= require('mongodb')

// const {getDB}=require('../config/db');

// const genAI= new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});

// function parseJson(text){
//     try{
//         return JSON.parse(text.replace(/```json|```/g,'').trim());
//     }
//     catch{
//         // return null;
//     }
// }

// const BlogState = Annotation.Root({
//     topic: Annotation(),
//     outline: Annotation(),
//     draft: Annotation(),
//     seoTitle: Annotation(),
//     metaDescription: Annotation(),
//     slug: Annotation(),
//     feedback: Annotation(),
//     status: Annotation(),
//     blogId: Annotation(),
//     revisionCount: Annotation(),
//     decision: Annotation(),
// });

// async function outlineNode(state) {
//     const prompt =
//     'You are a SEO content stategist for Shopmate, an e-commerce platform store .\n'+
//     `Write a structured blog outline for the topic: "${state.topic}".\n`+
//     'Use markdown with h2/h3 headings and bullet points. one line note for each heading .\n'+
//     'Return only the outline markdown , nothing else,';

//     const result= await genAI.models.generateContent({
//         model:'gemini-2.5-flash',
//         contents:prompt
//     });

//     const outline=(result.text ||"").trim();
//     if(!outline) {
//         throw new Error('Failed to generate outline');
//     }
//     return {outline};
    
// }

// async function draftNode(state) {
//     const humanFeedback=Boolean(state.feedback);
//     const prompt=
//         'You are a SEO content stategist for Shopmate, an e-commerce platform store .\n'+
//         `Topic: "${state.topic}"\n`+
//         `Outline: "${state.outline}"\n`+
//         (humanFeedback?
//             `Revise your previous draft to address the user's feedback.\n`+
//             `Previous draft:\n${state.draft}\n`+
//             `User feedback: "${state.feedback}"\n`:"")+
//             'Write a full blog post in markdown format, naturally using the target keywords.\n'+
//             'Return only a json object(no markdown fences) with :\n'+
//             '{\n'+
//             ' seoTitle: "An SEO optimized title for the blog post(<=60 chars)",\n'+
//             ' metaDescription: "A meta description for the blog post(<=160 chars)",\n'+
//             ' slug: "A URL-friendly slug for the blog post",\n'+
//             ' content: "The full blog post content in markdown format"\n'+
//             '}';
    
//     const result= await genAI.models.generateContent({
//         model:'gemini-2.5-flash',
//         contents:prompt
//     });
//     const parsed=parseJson(result.text ||"")||{};
//     const draft=parsed.content ||'';
//     const seoTitle=parsed.seoTitle|| state.topic;
//     const metaDescription = parsed.metaDescription|| '';
//     const slug=parsed.slug||state.topic.toLowerCase().replace(/\s+/g,'-');

//     return{
//         draft,
//         seoTitle,
//         metaDescription,
//         slug,
//         revisionCount:(state.revisionCount || 0) + 1,
//     }
// }

// // async function saveDraftNode(state) {
// //     const db=getDB();
// //     await db.collection('blogs').updateOne(
// //         {_id: new objectId(state.blogId)},
// //         {
            
// // }


require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const {
    StateGraph,
    Annotation,
    START,
    END,
    MemorySaver,
    Command,
    interrupt,
} = require("@langchain/langgraph");

const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// -------------------------
// Helpers
// -------------------------

function parseJson(text) {
    try {
        return JSON.parse(
            text.replace(/```json|```/g, "").trim()
        );
    } catch {
        return null;
    }
}

// -------------------------
// State
// -------------------------

const BlogState = Annotation.Root({
    topic: Annotation(),
    outline: Annotation(),
    draft: Annotation(),
    seoTitle: Annotation(),
    metaDescription: Annotation(),
    slug: Annotation(),
    feedback: Annotation(),
    status: Annotation(),
    blogId: Annotation(),
    revisionCount: Annotation(),
    decision: Annotation(),
});

// -------------------------
// Nodes
// -------------------------

async function outLineNode(state) {
    const prompt =
        `You are an SEO content strategist for SHOPMATE, an e-commerce store.\n` +
        `Write a structured blog outline for the topic "${state.topic}".\n` +
        `Use markdown with H2/H3 headings and one-line notes.\n` +
        `Return ONLY the outline markdown.`;

    const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });

    const outline = (result.text || "").trim();

    if (!outline) {
        throw new Error("Outline generation failed.");
    }

    return {
        outline,
    };
}

async function draftNode(state) {
    const prompt =
        `You are an expert SEO content writer for SHOPMATE.\n\n` +
        `Topic:\n${state.topic}\n\n` +
        `Outline:\n${state.outline}\n\n` +
        (state.feedback
            ? `Revise the previous draft.\n\n` +
              `Previous Draft:\n${state.draft}\n\n` +
              `User Feedback:\n${state.feedback}\n\n`
            : "") +
        `Return ONLY valid JSON with this schema:

{
  "seoTitle": "",
  "metaDescription": "",
  "slug": "",
  "content": ""
}`;

    const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    console.log(result.text);

    const parsed = parseJson(result.text || "") || {};

    return {
        draft: parsed.content || "",
        seoTitle: parsed.seoTitle || state.topic,
        metaDescription: parsed.metaDescription || "",
        slug:
            parsed.slug ||
            state.topic.toLowerCase().replace(/\s+/g, "-"),
        revisionCount: (state.revisionCount || 0) + 1,
    };
}

async function saveDraftNode(state) {
    const db = getDB();

    await db.collection("blogs").updateOne(
        {
            _id: new ObjectId(state.blogId),
        },
        {
            $set: {
                outline: state.outline,
                draft: state.draft,
                seoTitle: state.seoTitle,
                metaDescription: state.metaDescription,
                slug: state.slug,
                status: "in_review",
                revisionCount: state.revisionCount,
                updatedAt: new Date(),
            },
        }
    );

    return {
        status: "in_review",
    };
}

// async function reviewNode(state) {
//     const decision = interrupt({
//         type: "review",
//         blogId: state.blogId,
//         outline: state.outline,
//         draft: state.draft,
//         revisionCount: state.revisionCount,
//     });

//     if (decision?.action === "approve") {
//         return {
//             decision: "approve",
//             status: "approved",
//         };
//     }

//     return {
//         decision: "reject",
//         feedback: decision?.feedback || "",
//         status: "draft",
//     };
// }
async function reviewNode(state) {

    console.log("Reached Review Node");
    console.log("=== REVIEW NODE ===");

    const decision = interrupt({
        type: "review",
        blogId: state.blogId,
        outline: state.outline,
        draft: state.draft,
        revisionCount: state.revisionCount,
    });
    console.log("Decision after interrupt:", decision);

    console.log("Decision:", decision);

    if (decision?.action === "approve") {

        console.log("APPROVED");

        return {
            decision: "approve",
            status: "approved",
        };
    }

    console.log("REJECTED");

    return {
        decision: "reject",
        feedback: decision?.feedback || "",
        status: "draft",
    };
}

async function publishNodes(state) {
    const now = new Date();
    console.log("Publishing:", state.blogId);

    await getDB()
        .collection("blogs")
        .updateOne(
            {
                _id: new ObjectId(state.blogId),
            },
            {
                $set: {
                    status: "published",
                    publishedAt: now,
                    updatedAt: now,
                },
            }
        );

    return {
        status: "published",
    };
}

// -------------------------
// Routing
// -------------------------

function routeAfterReview(state) {
    return state.decision === "approve"
        ? "approve"
        : "reject";
}

// -------------------------
// Graph
// -------------------------

const graph = new StateGraph(BlogState)
    .addNode("generateOutline", outLineNode)
    .addNode("generateDraft", draftNode)
    .addNode("saveDraftNode", saveDraftNode)
    .addNode("reviewDraft", reviewNode)
    .addNode("publishBlog", publishNodes)

    .addEdge(START, "generateOutline")
    .addEdge("generateOutline", "generateDraft")
    .addEdge("generateDraft", "saveDraftNode")
    .addEdge("saveDraftNode", "reviewDraft")

    .addConditionalEdges("reviewDraft", routeAfterReview, {
        approve: "publishBlog",
        reject: "generateDraft",
    })

    .addEdge("publishBlog", END)

    .compile({
        checkpointer: new MemorySaver(),
    });

// -------------------------
// Public API
// -------------------------

// async function startRun(threadId, input) {
//     return graph.invoke(input, {
//         configurable: {
//             thread_id: threadId,
//         },
//     });
// }
async function startRun(threadId, input) {
    console.log("Starting:", threadId);

    const result = await graph.invoke(input, {
        configurable: {
            thread_id: threadId,
        },
    });

    console.log("Start Result:", result);

    return result;
}

// async function resumeRun(threadId, resumeValue) {
//     return graph.invoke(
//         new Command({
//             resume: resumeValue,
//         }),
//         {
//             configurable: {
//                 thread_id: threadId,
//             },
//         }
//     );
// }
async function resumeRun(threadId, resumeValue) {

    console.log("Resume Thread:", threadId);
    console.log("Resume Value:", resumeValue);

    const result = await graph.invoke(
        new Command({
            resume: resumeValue,
        }),
        {
            configurable: {
                thread_id: threadId,
            },
        }
    );

    console.log(result);

    return result;
}

module.exports = {
    startRun,
    resumeRun,
}; 