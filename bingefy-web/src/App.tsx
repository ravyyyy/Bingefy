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

// Import your logo file:
import logoSrc from "./assets/bingefy_text_logo.png";

function App() {
  const { user, username, logOut } = useAuth();
  const location = useLocation();

  // Hide header on /login and /signup pages
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
          {/* Left‐side: Your logo */}
          <div style={headerStyles.logoContainer}>
            <img src={logoSrc} alt="Bingefy Logo" style={headerStyles.logoImage} />
          </div>

          {/* Right‐side: if logged in, show “Hello, USERNAME”; if not, show Login/SignUp */}
          <nav style={headerStyles.nav}>
            {user ? (
              <>
                {/* Use the stored `username` (lowercased) from AuthContext */}
                <span style={headerStyles.welcome}>
                  Hello, {username || user.email}
                </span>
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
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TabsLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="shows" replace />} />
            <Route path="shows" element={<ShowsPage />} />
            <Route path="movies" element={<MoviesPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
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
    padding: "0 1rem",      // horizontal padding
    backgroundColor: "#000",
  },
  logoContainer: {
    // Optional: adjust to center‐vertically if needed
  },
  logoImage: {
    height: "40px",         // force your logo height to 40px (adjust as needed)
    width: "auto",
  },
  nav: {
    display: "flex",
    alignItems: "center",
  },
  link: {
    color: "#fff",
    marginRight: "1rem",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  welcome: {
    color: "#fff",
    marginRight: "1rem",
    fontSize: "0.95rem",
  },
  logoutButton: {
    padding: "0.25rem 0.5rem",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    backgroundColor: "#e50914",
    color: "#fff",
    fontSize: "0.9rem",
  },
};

export default App;
