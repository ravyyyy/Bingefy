// src/App.tsx
import React from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { SignUp } from "./components/SignUp";
import { Login } from "./components/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { TabsLayout } from "./components/TabsLayout";
import { ShowsPage } from "./components/ShowsPage";
import { MoviesPage } from "./components/MoviesPage";
import { ExplorePage } from "./components/ExplorePage";
import { ProfilePage } from "./components/ProfilePage";
import { useAuth } from "./contexts/AuthContext";

function App() {
  const { user, logOut } = useAuth();
  const location = useLocation();

  // Hide header when on /login or /signup
  const hideHeader = location.pathname === "/signup" || location.pathname === "/login";

  return (
    <div
      style={{
        background: "#121212",
        minHeight: "100vh",
        paddingTop: hideHeader ? 0 : "1rem",
      }}
    >
      {!hideHeader && (
        <header style={headerStyles.container}>
          <h1 style={headerStyles.logo}>Bingefy</h1>
          <nav>
            {user ? (
              <>
                <span style={headerStyles.welcome}>Hello, {user.email}</span>
                <button onClick={logOut} style={headerStyles.logoutButton}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={headerStyles.link}>
                  Login
                </Link>
                <Link to="/signup" style={headerStyles.link}>
                  Sign Up
                </Link>
              </>
            )}
          </nav>
        </header>
      )}

      <main style={{ height: hideHeader ? "100vh" : "auto" }}>
        <Routes>
          {/* Protect everything under “/” */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TabsLayout />
              </ProtectedRoute>
            }
          >
            {/* Default to “shows” when at “/” */}
            <Route index element={<Navigate to="shows" replace />} />
            <Route path="shows" element={<ShowsPage />} />
            <Route path="movies" element={<MoviesPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Authentication routes */}
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />

          {/* Catch-all → redirect to / */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const headerStyles: { [key: string]: React.CSSProperties } = {
  container: {
    marginBottom: "2rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem",
    backgroundColor: "#000",
  },
  logo: {
    color: "#fff",
    margin: 0,
    fontSize: "1.5rem",
  },
  link: {
    color: "#fff",
    marginRight: "1rem",
    textDecoration: "none",
  },
  welcome: {
    color: "#fff",
    marginRight: "1rem",
  },
  logoutButton: {
    padding: "0.25rem 0.5rem",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    backgroundColor: "#e50914",
    color: "#fff",
  },
};

export default App;
