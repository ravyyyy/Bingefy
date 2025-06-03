// src/components/onboarding/Step1BirthdateGender.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export function Step1BirthdateGender() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Split birthdate into three pieces
  const [selectedYear, setSelectedYear] = useState<string>("");   // e.g. "1990"
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // e.g. "05"
  const [selectedDay, setSelectedDay] = useState<string>("");     // e.g. "23"
  const [gender, setGender] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Generate arrays for years, months, and days
  const thisYear = new Date().getFullYear();
  const earliestYear = thisYear - 120; // e.g. allow up to 120 years old
  const years = Array.from({ length: thisYear - earliestYear + 1 }, (_, i) =>
    String(thisYear - i)
  ); // [ "2025", "2024", ..., "1905", ... ]

  const months = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  // Dynamically compute number of days in chosen month/year
  const [daysInMonth, setDaysInMonth] = useState<string[]>([]);
  useEffect(() => {
    if (selectedYear && selectedMonth) {
      const yearNum = parseInt(selectedYear, 10);
      const monthNum = parseInt(selectedMonth, 10) - 1; // JS months are 0-11
      const daysCount = new Date(yearNum, monthNum + 1, 0).getDate();
      const arr = Array.from({ length: daysCount }, (_, idx) => {
        const day = idx + 1;
        return day < 10 ? "0" + day : String(day);
      });
      setDaysInMonth(arr);
      // If previously chosen day is now out of range, reset it:
      if (selectedDay && parseInt(selectedDay, 10) > daysCount) {
        setSelectedDay("");
      }
    } else {
      setDaysInMonth([]);
      setSelectedDay("");
    }
  }, [selectedYear, selectedMonth]);

  // Form valid only if year/month/day and gender are chosen
  const isFormValid =
    selectedYear !== "" &&
    selectedMonth !== "" &&
    selectedDay !== "" &&
    gender !== "";

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isFormValid) {
      setError("Please select your complete birthdate and gender.");
      return;
    }
    if (!user) {
      setError("User not found. Please log in again.");
      return;
    }

    try {
      // Build an ISO-style string: "YYYY-MM-DD"
      const birthdateString = `${selectedYear}-${selectedMonth}-${selectedDay}`;
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        birthdate: birthdateString,
        gender,
      });
      navigate("/onboarding/step2");
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    }
  };

  return (
    <div style={outerStyles.container}>
      <div style={outerStyles.innerBox}>
        <h2 style={outerStyles.heading}>Tell us about yourself</h2>
        <form onSubmit={handleNext} style={innerStyles.form}>
          {/* ─── Birthdate Block (3 dropdowns) ───────────────────────────────────── */}
          <label style={innerStyles.label}>Birthdate</label>
          <div style={innerStyles.dateRow}>
            {/* Year dropdown */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={innerStyles.dateSelect}
            >
              <option value="" disabled hidden>
                Year
              </option>
              {years.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            {/* Month dropdown */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={innerStyles.dateSelect}
            >
              <option value="" disabled hidden>
                Month
              </option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Day dropdown (depends on selected month/year) */}
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={innerStyles.dateSelect}
              disabled={!daysInMonth.length}
            >
              <option value="" disabled hidden>
                Day
              </option>
              {daysInMonth.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* ─── Gender Block ───────────────────────────────────────────────────────── */}
          <label style={innerStyles.label}>Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            style={innerStyles.input}
          >
            <option value="" disabled hidden>
              Select Gender
            </option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          {/* ─── Error & Submit ────────────────────────────────────────────────────── */}
          {error && <p style={innerStyles.error}>{error}</p>}

          <button
            type="submit"
            disabled={!isFormValid}
            style={{
              ...innerStyles.button,
              backgroundColor: isFormValid ? "#1a73e8" : "#555",
              cursor: isFormValid ? "pointer" : "not-allowed",
            }}
          >
            Next
          </button>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Inline styling for layout & “small bars”
// ──────────────────────────────────────────────────────────────────────────────
const outerStyles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "80vh",
    backgroundColor: "#000",
    padding: "1rem",
  },
  innerBox: {
    width: "100%",
    maxWidth: "400px",     // fixes width so “bars” stay narrow
    padding: "2rem",
    borderRadius: "8px",
    backgroundColor: "#111",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
  },
  heading: {
    color: "#fff",
    textAlign: "center" as const,
    marginBottom: "1.5rem",
  },
};

const innerStyles: { [key: string]: React.CSSProperties } = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  label: {
    color: "#fff",
    fontSize: "0.95rem",
  },

  // Row to hold the three dropdowns side by side
  dateRow: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "space-between",
  },

  // Individual dropdowns for year / month / day
  dateSelect: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "4px",
    border: "1px solid #444",
    backgroundColor: "#222",
    color: "#fff",
    fontSize: "1rem",
    appearance: "none" as const, // removes default arrow on some browsers
  },

  input: {
    width: "100%",
    padding: "0.5rem 0.75rem",
    borderRadius: "4px",
    border: "1px solid #444",
    backgroundColor: "#222",
    color: "#fff",
    fontSize: "1rem",
    appearance: "none" as const,
  },
  button: {
    marginTop: "1.25rem",
    padding: "0.8rem",
    border: "none",
    borderRadius: "4px",
    fontSize: "1rem",
    color: "#fff",
  },
  error: {
    color: "#ff4d4f",
    fontSize: "0.875rem",
    textAlign: "center" as const,
  },
};
