// src/components/SignUp.tsx

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

export function SignUp() {
  const { signUp } = useAuth();
  const navigate = useNavigate(); // we’re not calling navigate here—just showing a message.

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await signUp(username, email, password);
      setInfo(
        "Thank you for registering! A verification email has been sent. Please check your inbox before logging in."
      );
      // We do NOT navigate anywhere. The user remains on the same page so they can read the instructions.
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} style={formStyles.form}>
        <label style={formStyles.label}>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={formStyles.input}
        />

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
          minLength={6}
          style={formStyles.input}
        />

        {error && <p style={formStyles.error}>{error}</p>}
        {info && <p style={formStyles.info}>{info}</p>}

        <button type="submit" style={formStyles.button}>
          Sign Up
        </button>
      </form>
      <p style={formStyles.footerText}>
        Already have an account?{" "}
        <Link to="/login" style={formStyles.footerLink}>
          Log in here
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
    color: "#4caf50",
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
