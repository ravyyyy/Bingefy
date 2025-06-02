// src/components/onboarding/Step1BirthdateGender.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

function isAtLeast16(birthdateISO: string): boolean {
  const today = new Date();
  const [year, month, day] = birthdateISO.split("-").map((s) => parseInt(s, 10));
  const dob = new Date(year, month - 1, day);
  const age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    return age - 1 >= 16;
  }
  return age >= 16;
}

export function Step1BirthdateGender() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<"Male" | "Female" | "Other" | "">("");
  const [error, setError] = useState<string | null>(null);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!birthdate) {
      setError("Please select your birthdate.");
      return;
    }
    if (!isAtLeast16(birthdate)) {
      setError("You must be at least 16 years old to use this service.");
      return;
    }
    if (!user) {
      setError("User not found. Please log in again.");
      return;
    }

    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        birthdate,
        gender: gender || null,
      });
      // Immediately redirect to step2. On next login, the OnboardingGate sees birthdate is set
      navigate("/onboarding/step2");
    } catch (err) {
      console.error(err);
      setError("Failed to save your birthdate/gender. Please try again.");
    }
  };

  return (
    <form onSubmit={handleNext} style={styles.form}>
      <label style={styles.label}>Birthdate *</label>
      <input
        type="date"
        value={birthdate}
        onChange={(e) => setBirthdate(e.target.value)}
        required
        style={styles.input}
      />

      <label style={styles.label}>Gender (optional)</label>
      <select
        value={gender}
        onChange={(e) => setGender(e.target.value as any)}
        style={styles.input}
      >
        <option value="">Skip</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
        <option value="Other">Other</option>
      </select>

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" style={styles.button}>
        Next
      </button>
    </form>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  label: {
    fontSize: "1rem",
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
    marginTop: "1.5rem",
    padding: "0.75rem",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "#e50914",
    color: "#fff",
    fontSize: "1rem",
    cursor: "pointer",
  },
  error: {
    color: "salmon",
    fontSize: "0.9rem",
  },
};
