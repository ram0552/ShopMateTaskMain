
import React, { useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import api from '../utils/api';


const initialAddress = {
    fullName: '',
    phone: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
};

const formatINR = (amount) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
    }).format(Number(amount) || 0);


const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if (window.Razorpay) {
            resolve(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;

        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);

        document.body.appendChild(script);
    });
};



const Checkout = () => {
    const { cart, cartLoading, cartInitialized, fetchCart } =
        useContext(ShopContext);

    const [address, setAddress] = useState(initialAddress);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [placedOrder, setPlacedOrder] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('cod');
    const [checkoutOpen, setCheckoutOpen] = useState(false);

    // Reuse the same key if a request must be retried.
    const idempotencyKeyRef = useRef(null);

    const total = cart.reduce(
        (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
    );

    const handleChange = (event) => {
        const { name, value } = event.target;

        setAddress((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    
const handleSubmit = async (event) => {
    event.preventDefault();

    setError('');

    if (submitting || checkoutOpen || placedOrder) return;

    if (!cartInitialized || cartLoading) {
        setError('Please wait while your cart loads.');
        return;
    }

    if (!cart.length) {
        setError('Your cart is empty.');
        return;
    }

    if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
    }

    setSubmitting(true);

    try {
        const isRazorpay = paymentMethod === 'razorpay';

        const response = await api.post(
            isRazorpay ? '/orders/razorpay' : '/orders',
            {
                shippingAddress: address,
                ...(isRazorpay ? {} : { paymentMethod: 'cod' }),
            },
            {
                headers: {
                    'Idempotency-Key': idempotencyKeyRef.current,
                },
            }
        );

        if (!isRazorpay) {
            const order = response.data?.order;

            if (!order?.orderId) {
                throw new Error('The server returned an invalid order response.');
            }

            setPlacedOrder(order);
            await fetchCart();
            return;
        }

        const checkoutData = response.data?.order ?? response.data;
        const keyId = response.data?.keyId ?? checkoutData?.keyId;
        const razorpayOrderId = checkoutData?.razorpayOrderId;
        const orderId = checkoutData?.orderId;
        const amount = checkoutData?.amount;
        const currency = checkoutData?.currency;

        if (
            !keyId ||
            !razorpayOrderId ||
            !orderId ||
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            !currency
        ) {
            throw new Error(
                'Invalid Razorpay order response. Please check the backend response format.'
            );
        }

        const scriptLoaded = await loadRazorpayScript();

        if (!scriptLoaded) {
            throw new Error(
                'Unable to load Razorpay Checkout. Check your internet connection and try again.'
            );
        }

        const checkout = new window.Razorpay({
            key: keyId,
            amount,
            currency,
            name: 'ShopMate',
            description: `Payment for order ${orderId}`,
            order_id: razorpayOrderId,

            prefill: {
                name: address.fullName,
                contact: address.phone,
            },

            theme: {
                color: '#111827',
            },

            handler: async (paymentResponse) => {
                setCheckoutOpen(false);
                setSubmitting(true);
                setError('');

                try {
                    const verificationResponse = await api.post(
                        '/orders/razorpay/verify',
                        {
                            orderId,
                            razorpay_order_id:
                                paymentResponse.razorpay_order_id,
                            razorpay_payment_id:
                                paymentResponse.razorpay_payment_id,
                            razorpay_signature:
                                paymentResponse.razorpay_signature,
                        }
                    );

                    const verifiedOrder =
                        verificationResponse.data?.order ?? {};

                    setPlacedOrder({
                        orderId,
                        totalAmount: amount / 100,
                        currency,
                        paymentMethod: 'razorpay',
                        paymentStatus: 'paid',
                        orderStatus: 'placed',
                        ...verifiedOrder,
                    });

                    await fetchCart();
                } catch (verificationError) {
                    setError(
                        verificationError.response?.data?.message ||
                        'Payment verification could not be completed. Check your order status before attempting another payment.'
                    );
                } finally {
                    setSubmitting(false);
                }
            },

            modal: {
                ondismiss: () => {
                    setCheckoutOpen(false);
                    setSubmitting(false);
                    setError(
                        'Checkout was closed. If you completed a payment, check your order status before trying again.'
                    );
                },
            },
        });

        checkout.on('payment.failed', () => {
            setCheckoutOpen(false);
            setSubmitting(false);
            setError(
                'Payment was unsuccessful. Check your order status before retrying.'
            );
        });

        setCheckoutOpen(true);
        setSubmitting(false);
        checkout.open();
    } catch (submitError) {
        
        if (
            submitError.response?.data?.code ===
            'CHECKOUT_ATTEMPT_TERMINAL'
        ) {
            idempotencyKeyRef.current = crypto.randomUUID();
        }

        setError(
            submitError.response?.data?.message ||
            submitError.message ||
            'Unable to process your order. Please try again.'
        );

        setSubmitting(false);
    }
};


    if (!cartInitialized || cartLoading) {
        return (
            <main className="mx-auto max-w-5xl px-4 py-16 text-center">
                Loading your cart...
            </main>
        );
    }

    if (placedOrder) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
                        ✓
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900">
                        Order placed successfully
                    </h1>

                    <p className="mt-3 text-gray-600">
                        Your order has been recorded. Payment is due on delivery.
                    </p>

                    <p className="mt-5 text-sm text-gray-500">
                        Order ID
                    </p>

                    <p className="break-all font-semibold text-gray-900">
                        {placedOrder.orderId}
                    </p>

                    <p className="mt-4 text-lg font-bold text-gray-900">
                        Total: {formatINR(placedOrder.totalAmount)}
                    </p>
                     <div className="mt-6 flex flex-col gap-3">
                        <Link
                            to="/orders"
                            className="rounded-lg bg-neutral-900 px-5 py-3 text-white"
                        >
                            View My Orders
                        </Link>

                        <Link
                            to="/home"
                            className="rounded-lg border px-5 py-3"
                        >
                            Continue Shopping
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    if (cart.length === 0) {
        return (
            <main className="mx-auto max-w-5xl px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-gray-900">
                    Your cart is empty
                </h1>

                <Link
                    to="/home"
                    className="mt-5 inline-flex rounded-lg bg-gray-900 px-6 py-3 text-white hover:bg-gray-700"
                >
                    Continue Shopping
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <h1 className="mb-8 text-3xl font-bold text-gray-900">
                Checkout
            </h1>

            <form
                onSubmit={handleSubmit}
                className="grid grid-cols-1 gap-8 lg:grid-cols-3"
            >
                <section className="space-y-6 lg:col-span-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="mb-5 text-xl font-semibold text-gray-900">
                            Delivery details
                        </h2>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {[
                                {
                                    name: 'fullName',
                                    label: 'Full name',
                                    autocomplete: 'name',
                                },
                                {
                                    name: 'phone',
                                    label: 'Phone number',
                                    autocomplete: 'tel',
                                    type: 'tel',
                                },
                                {
                                    name: 'addressLine1',
                                    label: 'Address',
                                    autocomplete: 'address-line1',
                                    fullWidth: true,
                                },
                                {
                                    name: 'city',
                                    label: 'City',
                                    autocomplete: 'address-level2',
                                },
                                {
                                    name: 'state',
                                    label: 'State',
                                    autocomplete: 'address-level1',
                                },
                                {
                                    name: 'postalCode',
                                    label: 'Postal code',
                                    autocomplete: 'postal-code',
                                },
                                {
                                    name: 'country',
                                    label: 'Country',
                                    autocomplete: 'country-name',
                                },
                            ].map((field) => (
                                <div
                                    key={field.name}
                                    className={
                                        field.fullWidth ? 'sm:col-span-2' : ''
                                    }
                                >
                                    <label
                                        htmlFor={field.name}
                                        className="mb-1.5 block text-sm font-medium text-gray-700"
                                    >
                                        {field.label}
                                    </label>

                                    <input
                                        id={field.name}
                                        name={field.name}
                                        type={field.type || 'text'}
                                        autoComplete={field.autocomplete}
                                        value={address[field.name]}
                                        onChange={handleChange}
                                        required
                                        maxLength={
                                            field.name === 'addressLine1'
                                                ? 200
                                                : 100
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-gray-900">
                        Payment method
                    </h2>

                    <div className="mt-4 space-y-3">
                        <label
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                                paymentMethod === 'cod'
                                    ? 'border-gray-900 bg-gray-50'
                                    : 'border-gray-200'
                            }`}
                        >
                            <input
                                type="radio"
                                name="paymentMethod"
                                value="cod"
                                checked={paymentMethod === 'cod'}
                                onChange={(event) =>
                                    setPaymentMethod(event.target.value)
                                }
                                className="mt-1 accent-gray-900"
                            />

                            <span>
                                <span className="block font-medium text-gray-900">
                                    Cash on Delivery
                                </span>
                                <span className="mt-1 block text-sm text-gray-600">
                                    Pay when your order is delivered.
                                </span>
                            </span>
                        </label>

                        <label
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                                paymentMethod === 'razorpay'
                                    ? 'border-gray-900 bg-gray-50'
                                    : 'border-gray-200'
                            }`}
                        >
                            <input
                                type="radio"
                                name="paymentMethod"
                                value="razorpay"
                                checked={paymentMethod === 'razorpay'}
                                onChange={(event) =>
                                    setPaymentMethod(event.target.value)
                                }
                                className="mt-1 accent-gray-900"
                            />

                            <span>
                                <span className="block font-medium text-gray-900">
                                    Pay Online with Razorpay
                                </span>
                                <span className="mt-1 block text-sm text-gray-600">
                                    Pay using supported online payment methods.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>

                </section>

                <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-5 text-xl font-semibold text-gray-900">
                        Order summary
                    </h2>

                    <div className="space-y-4">
                        {cart.map((item) => (
                            <div
                                key={item._id}
                                className="flex items-start justify-between gap-4"
                            >
                                <div className="min-w-0">
                                    <p className="break-words font-medium text-gray-800">
                                        {item.name || 'Product'}
                                    </p>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Qty: {item.quantity}
                                    </p>
                                </div>

                                <p className="shrink-0 font-medium text-gray-900">
                                    {formatINR(
                                        Number(item.price || 0) *
                                            Number(item.quantity || 0)
                                    )}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="my-5 border-t border-gray-200" />

                    <div className="flex justify-between gap-4 text-lg font-bold text-gray-900">
                        <span>Estimated total</span>
                        <span>{formatINR(total)}</span>
                    </div>

                    <p className="mt-3 text-xs text-gray-500">
                        Final prices and stock availability are validated by
                        the server when your order is placed.
                    </p>

                    {error && (
                        <p
                            role="alert"
                            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || checkoutOpen || placedOrder !== null}
                        className="mt-6 w-full rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting
                            ? 'Placing order...'
                            : 'Place Order'}
                    </button>
                     

                    <Link
                        to="/cart"
                        className="mt-4 block text-center text-sm text-gray-600 underline hover:text-gray-900"
                    >
                        Return to cart
                    </Link>
                </aside>
            </form>
        </main>
    );
};

export default Checkout;
