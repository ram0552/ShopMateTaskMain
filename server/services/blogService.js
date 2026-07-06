const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const collection = () => getDB().collection("blogs");

// Create Blog
async function createBlog({ topic, createdBy }) {
    const now = new Date();

    const doc = {
        topic,
        seoTitle: "",
        metaDescription: "",
        slug: "",
        outline: "",
        draft: "",
        status: "draft",
        revisionCount: 0,
        createdBy: createdBy || null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
    };

    const { insertedId } = await collection().insertOne(doc);

    // Use the inserted id as threadId
    const threadId = insertedId.toString();

    await collection().updateOne(
        { _id: insertedId },
        {
            $set: {
                threadId,
            },
        }
    );

    return {
        blogId: insertedId.toString(),
        threadId,
    };
}

// Update Status
async function setStatus(blogId, status) {
    await collection().updateOne(
        { _id: new ObjectId(blogId) },
        {
            $set: {
                status,
                updatedAt: new Date(),
            },
        }
    );
}

// Get Blog by ID
async function getById(blogId) {
    return collection().findOne({
        _id: new ObjectId(blogId),
    });
}

// List Blogs
async function listByStatus(status) {
    const filter = status ? { status } : {};

    return collection()
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();
}

async function deleteBlog(blogId) {
    const result = await collection().deleteOne({
        _id: new ObjectId(blogId)
    });

    return result.deletedCount;
}

module.exports = {
    createBlog,
    setStatus,
    getById,
    listByStatus,
    deleteBlog,
};