/**
 * Automated test suite for ShopMate registration fixes.
 */

const assert = require('assert');

// Mock response helper
const createMockRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
    return res;
};

// Mock MongoDB
const createMockDb = (initialUsers = [], options = {}) => {
    const users = [...initialUsers];
    return {
        collection(name) {
            if (name !== 'users') throw new Error(`Unknown collection ${name}`);
            return {
                async findOne(query) {
                    return users.find(u => u.email === query.email) || null;
                },
                async insertOne(doc) {
                    if (options.simulateE11000) {
                        const err = new Error('E11000 duplicate key error');
                        err.code = 11000;
                        throw err;
                    }
                    const insertedId = 'mock_id_' + (users.length + 1);
                    const userWithId = { ...doc, _id: insertedId };
                    users.push(userWithId);
                    return { insertedId };
                },
                async updateOne(query, update) {
                    const user = users.find(u => u.email === query.email || u._id === query._id);
                    if (!user) return { matchedCount: 0, modifiedCount: 0 };
                    Object.assign(user, update.$set || {});
                    return { matchedCount: 1, modifiedCount: 1 };
                }
            };
        },
        _users: users
    };
};

async function runTests() {
    console.log('--- Starting ShopMate Registration Test Suite ---');
    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`[FAIL] ${name}: ${err.message}`);
            failed++;
        }
    };

    let currentMockDb = createMockDb([]);
    const dbPath = require.resolve('./config/db');
    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: {
            connectDB: async () => currentMockDb,
            getDB: () => currentMockDb,
            getClient: () => ({}),
            closeDB: async () => {}
        }
    };

    // Require userController and sendermail after db mock is installed
    const sendermailModule = require('./services/sendermail');
    const userController = require('./controllers/userController');

    // 1. Missing username
    await test('1. Missing username returns 400', async () => {
        const req = { body: { email: 'test@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Username is required'));
    });

    // 2. Missing email
    await test('2. Missing email returns 400', async () => {
        const req = { body: { username: 'John', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Email is required'));
    });

    // 3. Invalid email format
    await test('3. Invalid email format returns 400', async () => {
        const req = { body: { username: 'John', email: 'notanemail', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('valid email'));
    });

    // 4. Missing password
    await test('4. Missing password returns 400', async () => {
        const req = { body: { username: 'John', email: 'john@example.com' } };
        const res = createMockRes();
        await userController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Password is required'));
    });

    // 5. Short password
    await test('5. Short password (< 6 chars) returns 400', async () => {
        const req = { body: { username: 'John', email: 'john@example.com', password: '123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('at least 6 characters'));
    });

    // 6. Existing verified user
    await test('6. Existing verified user returns 400 with "Email already in use"', async () => {
        currentMockDb = createMockDb([
            { email: 'existing@example.com', isVerified: true, username: 'Existing' }
        ]);

        const req = { body: { username: 'Alice', email: 'existing@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.message, 'Email already in use');
        assert.strictEqual(res.body.isVerified, true);
    });

    // 7. Existing unverified user
    await test('7. Existing unverified user returns 400 with canResend: true', async () => {
        currentMockDb = createMockDb([
            { email: 'unverified@example.com', isVerified: false, username: 'Unverified' }
        ]);

        const req = { body: { username: 'Bob', email: 'unverified@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.canResend, true);
        assert.strictEqual(res.body.isVerified, false);
        assert(res.body.message.includes('not verified'));
    });

    // 8. Successful registration with working SMTP
    await test('8. Successful registration with working email returns 201 and emailSent: true', async () => {
        currentMockDb = createMockDb([]);

        let emailDispatched = false;
        sendermailModule.sendVerificationEmail = async (email, name, token) => {
            emailDispatched = true;
            return { messageId: 'mock_msg_123' };
        };

        const req = { body: { username: 'Charlie', email: 'charlie@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.emailSent, true);
        assert(emailDispatched);
        assert.strictEqual(currentMockDb._users.length, 1);
        assert.strictEqual(currentMockDb._users[0].isVerified, false);
    });

    // 9. Registration with failing SMTP: User created, returns 201 with emailSent: false (NOT 500!)
    await test('9. Registration with failing SMTP: User created, returns 201 and emailSent: false (No 500 error!)', async () => {
        currentMockDb = createMockDb([]);

        sendermailModule.sendVerificationEmail = async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:587');
        };

        const req = { body: { username: 'David', email: 'david@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);

        assert.strictEqual(res.statusCode, 201, 'Must return 201 because user document was created in MongoDB');
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.emailSent, false, 'Must accurately reflect emailSent: false');
        assert.strictEqual(res.body.canResend, true, 'Must allow resending verification email');
        assert.strictEqual(currentMockDb._users.length, 1, 'User must exist in MongoDB');
        assert.strictEqual(currentMockDb._users[0].email, 'david@example.com');
        assert.strictEqual(currentMockDb._users[0].isVerified, false);
    });

    // 10. E11000 duplicate key error handling
    await test('10. MongoDB duplicate key collision (E11000) returns 400', async () => {
        currentMockDb = createMockDb([], { simulateE11000: true });

        const req = { body: { username: 'Eve', email: 'eve@example.com', password: 'password123' } };
        const res = createMockRes();
        await userController.registerUser(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.message, 'Email already in use');
    });

    // 11. Resend verification email for unverified user
    await test('11. Resend verification email for unverified user returns 200', async () => {
        currentMockDb = createMockDb([
            { email: 'unverified2@example.com', isVerified: false, username: 'Frank', _id: 'frank_id' }
        ]);

        let resendEmailSent = false;
        sendermailModule.sendVerificationEmail = async (email, name, token) => {
            resendEmailSent = true;
            return { messageId: 'resend_123' };
        };

        const req = { body: { email: 'unverified2@example.com' } };
        const res = createMockRes();
        await userController.resendVerificationEmail(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert(resendEmailSent);
    });

    // 12. Resend verification email for verified user
    await test('12. Resend verification email for verified user returns 400', async () => {
        currentMockDb = createMockDb([
            { email: 'verified@example.com', isVerified: true, username: 'Grace' }
        ]);

        const req = { body: { email: 'verified@example.com' } };
        const res = createMockRes();
        await userController.resendVerificationEmail(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert(res.body.message.includes('already verified'));
    });

    // 13. Resend verification email for nonexistent email
    await test('13. Resend verification email for nonexistent user returns 404', async () => {
        currentMockDb = createMockDb([]);

        const req = { body: { email: 'nobody@example.com' } };
        const res = createMockRes();
        await userController.resendVerificationEmail(req, res);

        assert.strictEqual(res.statusCode, 404);
        assert(res.body.message.includes('No account found'));
    });

    console.log(`\nTest Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests.`);
    if (failed > 0) process.exit(1);
}

runTests();
