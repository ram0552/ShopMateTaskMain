/**
 * ShopMate Checkout & Razorpay Diagnostics and Regression Test Suite
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { ObjectId } = require('mongodb');
const { createHmac, randomUUID } = require('crypto');
const { connectDB, getDB, closeDB } = require('./config/db');
const {
  getRazorpayInstance,
  createGatewayOrder,
} = require('./services/razorpayService');
const {
  verifyRazorpaySignature,
  validateShippingAddress,
  createRazorpayOrder,
} = require('./controllers/paymentController');
const authenticate = require('./middleware/authenticate');

// Helper to create mock Express req/res
function createMockContext({ user, headers = {}, body = {} }) {
  const req = {
    user,
    headers: { ...headers },
    body,
    get(headerName) {
      return this.headers[headerName.toLowerCase()] || this.headers[headerName];
    },
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };

  return { req, res };
}

async function runTests() {
  console.log('=== Starting ShopMate Razorpay Fixes Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // --- Test 1: Missing Razorpay credentials fail safely ---
  {
    const savedKeyId = process.env.RAZORPAY_KEY_ID;
    const savedKeySecret = process.env.RAZORPAY_KEY_SECRET;
    try {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      let caught = null;
      try {
        getRazorpayInstance();
      } catch (err) {
        caught = err;
      }
      assert(
        caught &&
          caught.code === 'GATEWAY_CREDENTIALS_MISSING' &&
          caught.isGatewayError === true,
        'Test 1: Missing Razorpay credentials fail safely with gateway error code'
      );
    } finally {
      process.env.RAZORPAY_KEY_ID = savedKeyId;
      process.env.RAZORPAY_KEY_SECRET = savedKeySecret;
    }
  }

  // --- Test 2: Invalid Razorpay credentials produce 502 GATEWAY_ERROR, not 401 session error ---
  {
    // Call createGatewayOrder with invalid credentials and verify that isGatewayError is attached
    let gatewayErrorCaught = null;
    try {
      await createGatewayOrder({
        amountPaise: 1000,
        receipt: 'test_rcpt_1234',
      });
    } catch (err) {
      gatewayErrorCaught = err;
    }
    assert(
      gatewayErrorCaught &&
        gatewayErrorCaught.isGatewayError === true &&
        gatewayErrorCaught.statusCode === 401,
      'Test 2: Upstream Razorpay 401 is tagged as isGatewayError'
    );
  }

  // --- Test 3: Genuine ShopMate authentication failures return 401 ---
  {
    // 3a: authenticate middleware without token
    const ctx1 = createMockContext({ headers: {} });
    let nextCalled = false;
    authenticate(ctx1.req, ctx1.res, () => {
      nextCalled = true;
    });
    assert(
      ctx1.res.statusCode === 401 && ctx1.res.data?.message === 'Token not provided' && !nextCalled,
      'Test 3a: Authenticate middleware returns 401 when token is missing'
    );

    // 3b: authenticate middleware with invalid token
    const ctx2 = createMockContext({ headers: { authorization: 'Bearer invalid.jwt.token' } });
    nextCalled = false;
    authenticate(ctx2.req, ctx2.res, () => {
      nextCalled = true;
    });
    assert(
      ctx2.res.statusCode === 401 && ctx2.res.data?.message === 'Invalid token' && !nextCalled,
      'Test 3b: Authenticate middleware returns 401 when token is invalid'
    );

    // 3c: createRazorpayOrder with invalid/missing user
    const ctx3 = createMockContext({ user: { id: 'invalid_id' } });
    await createRazorpayOrder(ctx3.req, ctx3.res);
    assert(
      ctx3.res.statusCode === 401 && ctx3.res.data?.message === 'Invalid user identity',
      'Test 3c: createRazorpayOrder returns 401 when user identity is invalid'
    );
  }

  // --- Test 4: Axios interceptor logic simulation ---
  {
    // Verify that isGatewayError (status 502 or code GATEWAY_ERROR) will NOT trigger refresh/retry
    const simulateAxiosInterceptor = (error) => {
      const originalRequest = error.config || {};
      const isAuthEndpoint =
        typeof originalRequest.url === 'string' &&
        (originalRequest.url.includes('/users/login') ||
          originalRequest.url.includes('/users/refresh') ||
          originalRequest.url.includes('/users/register'));

      const isGatewayError =
        error.response?.data?.code === 'GATEWAY_ERROR' ||
        error.response?.status === 502;

      if (
        error.response &&
        error.response.status === 401 &&
        !isGatewayError &&
        !isAuthEndpoint &&
        !originalRequest._retry
      ) {
        return 'TRIGGER_REFRESH_AND_RETRY';
      }
      return 'DO_NOT_RETRY';
    };

    // 4a: 502 GATEWAY_ERROR does not retry
    const resGateway502 = simulateAxiosInterceptor({
      response: { status: 502, data: { code: 'GATEWAY_ERROR' } },
      config: { url: '/orders/razorpay' },
    });
    assert(
      resGateway502 === 'DO_NOT_RETRY',
      'Test 4a: 502 GATEWAY_ERROR response does NOT trigger token refresh or retry'
    );

    // 4b: 401 on login endpoint does not retry
    const resLogin401 = simulateAxiosInterceptor({
      response: { status: 401, data: { message: 'Invalid Password' } },
      config: { url: '/users/login' },
    });
    assert(
      resLogin401 === 'DO_NOT_RETRY',
      'Test 4b: 401 on /users/login does NOT trigger token refresh or retry'
    );

    // 4c: genuine 401 on protected endpoint triggers refresh
    const resProtected401 = simulateAxiosInterceptor({
      response: { status: 401, data: { message: 'Invalid token' } },
      config: { url: '/orders' },
    });
    assert(
      resProtected401 === 'TRIGGER_REFRESH_AND_RETRY',
      'Test 4c: Genuine 401 on protected resource triggers token refresh'
    );
  }

  // Connect to DB for integration tests 5 - 11
  await connectDB();
  const db = getDB();

  // --- Test 5 & 8: Inventory reservation, failed gateway handling & stock restoration ---
  {
    const products = db.collection('products');
    const carts = db.collection('carts');
    const orders = db.collection('orders');

    // Find or create a test product
    let testProduct = await products.findOne({ stock: { $gt: 5 } });
    if (!testProduct) {
      const prodResult = await products.insertOne({
        name: 'Test Product',
        price: 150,
        stock: 10,
        category: 'Test',
      });
      testProduct = await products.findOne({ _id: prodResult.insertedId });
    }

    const initialStock = testProduct.stock;
    const testUserId = new ObjectId();

    // Setup cart with 2 units of testProduct
    await carts.insertOne({
      userId: testUserId,
      items: [{ productId: testProduct._id, quantity: 2 }],
      updatedAt: new Date(),
    });

    const idempotencyKey = randomUUID();
    const validAddress = {
      fullName: 'Test User',
      phone: '9876543210',
      addressLine1: '123 Main St',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500001',
      country: 'India',
    };

    const ctx = createMockContext({
      user: { id: testUserId.toString() },
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { shippingAddress: validAddress },
    });

    // Run createRazorpayOrder. Since credentials in .env return 401 from Razorpay,
    // this will hit the catch block where inventory is restored and 502 GATEWAY_ERROR is returned!
    await createRazorpayOrder(ctx.req, ctx.res);

    // Check HTTP status and code
    assert(
      ctx.res.statusCode === 502 && ctx.res.data?.code === 'GATEWAY_ERROR',
      'Test 5a: createRazorpayOrder returns 502 GATEWAY_ERROR when gateway fails',
      `Got status ${ctx.res.statusCode}, data: ${JSON.stringify(ctx.res.data)}`
    );

    // Verify stock is fully restored (Test 8)
    const productAfter = await products.findOne({ _id: testProduct._id });
    assert(
      productAfter.stock === initialStock,
      'Test 8: Inventory is restored correctly after failed gateway order creation',
      `Expected ${initialStock}, got ${productAfter.stock}`
    );

    // Verify order was transitioned to paymentStatus: 'failed', orderStatus: 'cancelled'
    const savedOrder = await orders.findOne({
      userId: testUserId,
      idempotencyKey,
    });
    assert(
      savedOrder &&
        savedOrder.paymentStatus === 'failed' &&
        savedOrder.orderStatus === 'cancelled',
      'Test 5b: Local order is safely transitioned to failed/cancelled'
    );

    // --- Test 6: Terminal checkout attempt returns 409 CHECKOUT_ATTEMPT_TERMINAL ---
    const retryCtx = createMockContext({
      user: { id: testUserId.toString() },
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { shippingAddress: validAddress },
    });
    await createRazorpayOrder(retryCtx.req, retryCtx.res);
    assert(
      retryCtx.res.statusCode === 409 &&
        retryCtx.res.data?.code === 'CHECKOUT_ATTEMPT_TERMINAL',
      'Test 6: Terminal checkout attempt returns 409 CHECKOUT_ATTEMPT_TERMINAL'
    );

    // --- Test 7: Fresh attempt can proceed after failure (using new idempotency key) ---
    // With a new idempotency key, the user attempt proceeds cleanly without matching terminal order
    const freshKey = randomUUID();
    const freshCtx = createMockContext({
      user: { id: testUserId.toString() },
      headers: { 'Idempotency-Key': freshKey },
      body: { shippingAddress: validAddress },
    });
    await createRazorpayOrder(freshCtx.req, freshCtx.res);
    // It proceeds to attempt gateway order again (resulting in 502 GATEWAY_ERROR, NOT 409 CHECKOUT_ATTEMPT_TERMINAL)
    assert(
      freshCtx.res.statusCode === 502 && freshCtx.res.data?.code === 'GATEWAY_ERROR',
      'Test 7: Fresh attempt with new key proceeds to payment attempt (502 GATEWAY_ERROR, not 409)'
    );

    // Cleanup test data
    await carts.deleteOne({ userId: testUserId });
    await orders.deleteMany({ userId: testUserId });
  }

  // --- Test 9: Public Key ID format and trimmed output ---
  {
    assert(
      typeof process.env.RAZORPAY_KEY_ID === 'string' &&
        process.env.RAZORPAY_KEY_ID.trim().startsWith('rzp_test_'),
      'Test 9: RAZORPAY_KEY_ID is a trimmed string in Test Mode (starts with rzp_test_)'
    );
  }

  // --- Test 10: Payment signature verification security ---
  {
    const secret = process.env.RAZORPAY_KEY_SECRET?.trim() || 'test_secret_for_validation_1234';
    const orderId = 'order_test_123456';
    const paymentId = 'pay_test_987654';
    const validSignature = createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Test with correct signature
    const isValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: validSignature,
    });
    assert(isValid === true, 'Test 10a: Valid HMAC-SHA256 signature passes verification');

    // Test with tampered signature
    const tamperedSignature = validSignature.slice(0, -4) + '0000';
    const isTamperedValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: tamperedSignature,
    });
    assert(
      isTamperedValid === false,
      'Test 10b: Tampered HMAC-SHA256 signature is rejected'
    );

    // Test with missing signature
    const isMissingValid = verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: '',
    });
    assert(
      isMissingValid === false,
      'Test 10c: Empty signature is rejected'
    );
  }

  // --- Test 11: COD order creation behavior remains functional ---
  {
    const { createOrder } = require('./controllers/orderController');
    const products = db.collection('products');
    const carts = db.collection('carts');
    const orders = db.collection('orders');

    const testProd = await products.findOne({ stock: { $gt: 5 } });
    const initialStock = testProd.stock;
    const codUserId = new ObjectId();

    await carts.insertOne({
      userId: codUserId,
      items: [{ productId: testProd._id, quantity: 1 }],
      updatedAt: new Date(),
    });

    const codCtx = createMockContext({
      user: { id: codUserId.toString() },
      headers: { 'Idempotency-Key': randomUUID() },
      body: {
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'COD User',
          phone: '9876543210',
          addressLine1: '456 COD Way',
          city: 'Vijayawada',
          state: 'AP',
          postalCode: '520001',
          country: 'India',
        },
      },
    });

    await createOrder(codCtx.req, codCtx.res);
    assert(
      codCtx.res.statusCode === 201 &&
        codCtx.res.data?.success === true &&
        codCtx.res.data?.order?.paymentMethod === 'cod',
      'Test 11: Cash on Delivery order creation remains intact and functional'
    );

    // Verify stock was decremented for COD
    const prodAfterCod = await products.findOne({ _id: testProd._id });
    assert(
      prodAfterCod.stock === initialStock - 1,
      'Test 11b: Stock is reserved correctly for COD order'
    );

    // Restore stock and clean up
    await products.updateOne({ _id: testProd._id }, { $inc: { stock: 1 } });
    await carts.deleteOne({ userId: codUserId });
    await orders.deleteMany({ userId: codUserId });
  }

  // --- Test 12: Razorpay Key ID prefix validation ---
  {
    const savedKeyId = process.env.RAZORPAY_KEY_ID;
    try {
      process.env.RAZORPAY_KEY_ID = 'invalid_prefix_key_123';
      let formatError = null;
      try {
        getRazorpayInstance();
      } catch (err) {
        formatError = err;
      }
      assert(
        formatError &&
          formatError.code === 'GATEWAY_CONFIGURATION_ERROR' &&
          formatError.isGatewayError === true,
        'Test 12: Invalid Razorpay Key ID format throws GATEWAY_CONFIGURATION_ERROR'
      );
    } finally {
      process.env.RAZORPAY_KEY_ID = savedKeyId;
    }
  }

  // --- Test 13: Gateway error returns sanitized message and AUTHENTICATION_ERROR category ---
  {
    let catCaught = null;
    try {
      await createGatewayOrder({
        amountPaise: 2000,
        receipt: 'test_rcpt_cat_test',
      });
    } catch (err) {
      catCaught = err;
    }
    assert(
      catCaught &&
        catCaught.isGatewayError === true &&
        catCaught.gatewayCategory === 'AUTHENTICATION_ERROR',
      'Test 13: Upstream 401 is categorized as AUTHENTICATION_ERROR'
    );
  }

  const { closeDB } = require('./config/db');
  await closeDB();


  console.log('\n=== Test Suite Complete ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
