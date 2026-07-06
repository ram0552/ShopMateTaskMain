// const { tool } = require('@langchain/core/tools');
// const { z } = require('zod');
// const { getDB } = require('../config/db');


// const checkOrderStatusTool = tool(
//   async ({ orderId }) => {
//     return await checkOrderStatusFunction({ orderId });
//   },
//   {
//     name: "check_order_status",
//     description: "Check the status of an order using its order ID",
//     schema: z.object({
//       orderId: z.string().describe("The order ID to look up"),
//     }),
//   }
// );
// module.exports = {checkOrderStatusTool };

const {tool}= require('@langchain/core/tools');
 const { z } = require('zod');
const {getDB}=require('../config/db');
const {Pinecone} = require('@pinecone-database/pinecone');
const {generateEmbedding}=require('../services/aiService');
const dotenv=require('dotenv');
dotenv.config();



const pinecone = new Pinecone({apiKey:process.env.PINECONE_API_KEY});
const index = pinecone.index(process.env.PINECONE_INDEX);

// async function checkOrderStatusFunction(orderId) {
//     try{
//         const db=getDB();
//         const order=await db.collection('orders').findOne({orderId:orderId});
//         console.log("Mongo result:", order);
//         if(!order){
//             return `No order found with id ${orderId}.`;
//         }
//         const itemList=order.items.map((item)=>`${item.quatity}x${item.name}`).join(', ');
//         return( `Order ${order.orderId} contains: ${itemList}. Current status: ${order.status}.`);
//     }
//     catch(err){
//         return `Could not look up order ${orderId}:${err.message}`;
//     }
// }

async function checkOrderStatusFunction({ orderId }) {
    try {
        const db = getDB();
        const order = await db.collection('orders').findOne({ orderId });
        if (!order) {
            return `No Order found  with ID ${orderId}.`;
        }
        const itemList = order.items.map((item) => `${item.quantity}x${item.name}`).join(', ');
        return (
            `Order ${order.orderId} contains : ${itemList}. ` + `Current status: ${order.status}.`
        );
    }catch (err) {
        return `Could not look up order ${orderId}. Error: ${err.message}`;
    }
}

const checkOrderStatusTool=tool(checkOrderStatusFunction,{
    name:'check_order_status',
    description:
    'Look up the status of a customer order by order id.'+'Use this when the customer asks where their order is.',
    schema: z.object({
        orderId:z
        .string()
        .describe('The order id to look up, for exampple ORD-1001.'),
    }),
});


async function searchProductsFunction({query}){
    try{
        const vector=await generateEmbedding(query);
        const response=await index.query({
            vector,
            topK:3,
            includeMetadata:true,
        });

        const matches=response.matches || [];
        if(matches.length===0){
            return 'No products found matching your query.';
        }
        const results=matches.map((match,i)=>{
            const metadata=match.metadata || {};
            return `${i+1}. ${metadata.name} - $${metadata.price}`;
        }).join('\n');
        return `Found the following products:\n${results}`;
    }
    catch(err){
        return `Error searching products: ${err.message}`;
    }
}

const searchProductsTool=tool(searchProductsFunction,{
    name:'search_products',
    description:
    'Search for Shopmate product catalog using a natural language description .'+
    'Use this when the customer asks whether a product is available ' +
    'or wants prouct recommendations .',
    schema:z.object({
        query:z.
        string().
        describe('A natural language description of the what the customer is looking for,' +
        'for example "wireless headphones" or "running shoes".'),
    }),
});


async function getRefundPolicyFunction({question}){
    try{
        const vector=await generateEmbedding(question);
        const response=await index.query({
            vector,
            topK:2,
            includeMetadata:true,
            filter:{type:'policy'},
        });
        const matches=response.matches || [];
        if(matches.length===0){
            return 'No relevant policy information found.';
        }
        const policyText=matches.map((match)=>match.metadata.text).join('\n');
        return `Here is the relevant policy information:\n${policyText}`;
    }
    catch(err){
        return `Error retrieving policy information: ${err.message}`;
    }
}


const getRefundPolicyTool=tool(getRefundPolicyFunction,{
    name:'get_refund_policy',
    description:
    'Retrieve relevant section of the ShopMATE refund and return policy.'+
    'Use this when the customer asks about refund or return policies.'+
    'exchanges , or damaged items .',
    schema:z.object({
        question:z.
        string().
        describe('A natural language question about refund or return policies,'+
            'for example "Can I return a damaged item?"'+
            'or "How many days do I have to return ?"'
        ),
    }),
});


module.exports={checkOrderStatusTool, searchProductsTool, getRefundPolicyTool};