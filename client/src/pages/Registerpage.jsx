import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const Registerpage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone_number: "",
    role: "user",
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleResendVerification = async () => {
    const targetEmail = resendEmail || formData.email;
    if (!targetEmail) {
      setError("Please provide an email address to resend verification.");
      return;
    }

    setResending(true);
    setError("");
    setInfo("");

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/users/resend-verification`,
        { email: targetEmail }
      );
      setInfo(response.data?.message || "Verification email sent successfully! Please check your inbox.");
      setWarning("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Failed to resend verification email. Please try again later."
      );
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    setWarning("");
    setCanResend(false);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/users/register`,
        formData
      );

      // Case 1: Registration successful and verification email sent
      if (response.data?.emailSent) {
        navigate("/login", {
          state: {
            message:
              response.data?.message ||
              "Registration successful. Please check your email to verify your account.",
          },
        });
        return;
      }

      // Case 2: Account created, but verification email delivery failed
      setWarning(
        response.data?.message ||
        "Account created successfully, but we were unable to send the verification email. Please click below to resend the email."
      );
      setCanResend(true);
      setResendEmail(formData.email);
    } catch (err) {
      // Case 3: Email already registered or duplicate submission
      const responseData = err.response?.data;
      if (responseData?.canResend) {
        setWarning(responseData.message);
        setCanResend(true);
        setResendEmail(formData.email);
      } else {
        setError(
          responseData?.message ||
          "Registration failed. Please check your information and try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.brand}>ShopMATE</h1>
        <h2 style={styles.title}>Create an account</h2>
        <p style={styles.subtitle}>Sign up to start shopping</p>

        {error && <div style={styles.error}>{error}</div>}
        {warning && <div style={styles.warning}>{warning}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {canResend && (
          <div style={{ marginBottom: "16px" }}>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              style={styles.resendButton}
            >
              {resending ? "Sending verification email..." : "Resend Verification Email"}
            </button>
            <div style={{ marginTop: "8px" }}>
              <Link to="/login" style={styles.link}>
                Proceed to Sign In
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="John Doe"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="you@example.com"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              placeholder="••••••••"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Phone Number</label>
            <input
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleChange}
              placeholder="+91 9000000000"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              style={styles.select}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    padding: "20px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "420px",
    textAlign: "center",
  },
  brand: {
    fontSize: "26px",
    fontWeight: "800",
    color: "#111827",
    marginBottom: "8px",
    letterSpacing: "-0.5px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "24px",
  },
  error: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    color: "#dc2626",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "left",
    lineHeight: "1.4",
  },
  warning: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fcd34d",
    color: "#92400e",
    borderRadius: "8px",
    padding: "12px 14px",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "left",
    lineHeight: "1.4",
  },
  info: {
    backgroundColor: "#ecfdf5",
    border: "1px solid #6ee7b7",
    color: "#065f46",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "left",
    lineHeight: "1.4",
  },
  resendButton: {
    padding: "10px 16px",
    backgroundColor: "#1f2937",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    transition: "background-color 0.2s ease",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
    gap: "6px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "15px",
    color: "#111827",
    outline: "none",
    backgroundColor: "#f9fafb",
  },
  select: {
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "15px",
    color: "#111827",
    outline: "none",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  },
  button: {
    marginTop: "8px",
    padding: "12px",
    backgroundColor: "#111827",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
  footer: {
    marginTop: "20px",
    fontSize: "14px",
    color: "#6b7280",
  },
  link: {
    color: "#111827",
    fontWeight: "600",
    textDecoration: "underline",
    fontSize: "14px",
  },
};

export default Registerpage;
