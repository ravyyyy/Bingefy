// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  children: React.ReactNode;
};

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p style={{ color: "#fff", textAlign: "center", marginTop: "2rem" }}>
      Checking authentication…
    </p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  // If user is logged in, render the nested content (TabsLayout + its children)
  return <>{children}</>;
}
