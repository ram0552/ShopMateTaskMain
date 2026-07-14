import React,{useState} from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const ForgetPasswordPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);
    
    const handleSendOTP = async (e) => {
        e.preventDefault();

        if (!email) {
            setError("Email is required");
            return;
        }

        try {
            setLoading(true);
            setError("");
            setInfo("");

            const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/users/forget-password`, {
                email,
            });

            setInfo(response.data.message || "OTP sent to your email address");
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();

        if (!otp || !newPassword || !confirmPassword) {
            setError("All fields are required");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        try {
            setLoading(true);
            setError("");
            setInfo("");

            const response = await axios.post(
                `${import.meta.env.VITE_API_URL}/api/users/reset-password`,
                {
                    email,
                    otp,
                    newPassword,
                    confirmPassword,
                }
            );

            setInfo(response.data.message);

            setTimeout(() => {
                navigate("/login");
            }, 1500);

        } catch (err) {
            setError(err.response?.data?.message || "Password reset failed");
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
            <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-md">

            <h2 className="text-3xl font-bold text-center mb-6">
                Forgot Password
            </h2>

            {error && (
                <div className="mb-4 text-red-600 text-sm bg-red-50 p-2 rounded">
                {error}
                </div>
            )}

            {info && (
                <div className="mb-4 text-green-600 text-sm bg-green-50 p-2 rounded">
                {info}
                </div>
            )}

            {step === 1 ? (
                <form onSubmit={handleSendOTP} className="space-y-5">

                <div>
                    <label className="block mb-1 font-medium">
                    Email
                    </label>

                    <input
                    type="email"
                    placeholder="Enter registered email"
                    className="w-full border rounded-lg px-4 py-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg"
                >
                    {loading ? "Sending OTP..." : "Send OTP"}
                </button>

                </form>
            ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                        <label className="block mb-1 font-medium">
                            Email
                        </label>

                        <input
                            type="email"
                            value={email}
                            readOnly
                            className="w-full border rounded-lg px-4 py-2 bg-gray-100 cursor-not-allowed"
                        />
                    </div>

                <div>
                    <label className="block mb-1 font-medium">
                    OTP
                    </label>

                    <input
                    type="text"
                    placeholder="Enter OTP"
                    className="w-full border rounded-lg px-4 py-2"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block mb-1 font-medium">
                    New Password
                    </label>

                    <input
                    type="password"
                    placeholder="New Password"
                    className="w-full border rounded-lg px-4 py-2"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block mb-1 font-medium">
                    Confirm Password
                    </label>

                    <input
                    type="password"
                    placeholder="Confirm Password"
                    className="w-full border rounded-lg px-4 py-2"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg"
                >
                    {loading ? "Updating..." : "Reset Password"}
                </button>

                <button
                    type="button"
                    onClick={handleSendOTP}
                    className="w-full text-blue-600 hover:underline"
                >
                    Resend OTP
                </button>

                </form>
            )}

            <div className="text-center mt-6">
                <Link
                to="/login"
                className="text-blue-600 hover:underline"
                >
                Back to Login
                </Link>
            </div>

            </div>
        </div>
    );
}


export default ForgetPasswordPage;