import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

export function Login() {
  const { logIn, sendVerification } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await logIn(email, password);
      navigate("/");
    } catch (err: any) {
      // If the error is “Email not verified…”, show a link to resend
      if (
        err.message.includes("Email not verified")
      ) {
        setInfo(
          "Your email is not verified. Check your inbox or"
        );
      } else {
        setError(err.message);
      }
    }
  };

  const handleResend = async () => {
    try {
      await sendVerification();
      setInfo("A new verification email has been sent. Please check your inbox.");
    } catch (err: any) {
      setError("Could not resend verification email.");
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} style={formStyles.form}>
        <label style={formStyles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={formStyles.input}
        />

        <label style={formStyles.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={formStyles.input}
        />

        {error && <p style={formStyles.error}>{error}</p>}

        {info && (
          <p style={formStyles.info}>
            {info}{" "}
            <button
              type="button"
              onClick={handleResend}
              style={formStyles.resendButton}
            >
              Resend verification email
            </button>
          </p>
        )}

        <button type="submit" style={formStyles.button}>
          Log In
        </button>
      </form>
      <p style={formStyles.footerText}>
        Don’t have an account?{" "}
        <Link to="/signup" style={formStyles.footerLink}>
          Sign Up here
        </Link>
      </p>
    </AuthLayout>
  );
}

const formStyles: { [key: string]: React.CSSProperties } = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  label: {
    fontSize: "0.9rem",
    marginBottom: "0.25rem",
    color: "#fff",
  },
  input: {
    padding: "0.5rem",
    borderRadius: "4px",
    border: "1px solid #444",
    backgroundColor: "#222",
    color: "#fff",
    fontSize: "1rem",
  },
  button: {
    marginTop: "1rem",
    padding: "0.75rem",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "#e50914",
    color: "#fff",
    fontSize: "1rem",
    cursor: "pointer",
    fontWeight: 600,
  },
  error: {
    color: "salmon",
    fontSize: "0.9rem",
    marginTop: "0.5rem",
  },
  info: {
    color: "#fff",
    fontSize: "0.9rem",
    marginTop: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  resendButton: {
    background: "none",
    border: "none",
    color: "#e50914",
    cursor: "pointer",
    fontSize: "0.9rem",
    textDecoration: "underline",
    padding: 0,
  },
  footerText: {
    marginTop: "1rem",
    fontSize: "0.9rem",
    textAlign: "center",
  },
  footerLink: {
    color: "#e50914",
    textDecoration: "none",
    fontWeight: 500,
  },
};
