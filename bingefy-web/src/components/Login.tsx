// src/components/Login.tsx
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

export function Login() {
  const { logIn } = useAuth();
  const navigate = useNavigate();

  // “identifier” can be either username OR email
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Pass identifier (username or email) plus password into logIn
      await logIn(identifier.trim(), password);
      navigate("/"); // on success, go to main page
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} style={formStyles.form}>
        <label style={formStyles.label}>
          Username or Email
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          placeholder="Enter your username or email"
          style={formStyles.input}
        />

        <label style={formStyles.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Enter your password"
          style={formStyles.input}
        />

        {error && <p style={formStyles.error}>{error}</p>}

        <button type="submit" style={formStyles.button}>
          Log In
        </button>
      </form>

      <p style={formStyles.footerText}>
        Don’t have an account?{" "}
        <Link to="/signup" style={formStyles.footerLink}>
          Sign up here
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
