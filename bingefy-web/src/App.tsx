// src/App.tsx
import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { SignUp } from "./components/SignUp";
import { Login } from "./components/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";
import { getDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

import { TabsLayout } from "./components/TabsLayout";
import { ShowsPage } from "./components/ShowsPage";
import { MoviesPage } from "./components/MoviesPage";
import { ExplorePage } from "./components/ExplorePage";
import { ProfilePage } from "./components/ProfilePage";

// Import your onboarding steps:
import { Step1BirthdateGender } from "./components/onboarding/Step1BirthdateGender";
import { Step2PickShows } from "./components/onboarding/Step2PickShows";
import { Step3WatchedMovies } from "./components/onboarding/Step3WatchedMovies";
import { Step4ToWatchMovies } from "./components/onboarding/Step4ToWatchMovies";

import logoSrc from "./assets/bingefy_text_logo.png";

function App() {
  const { user, username, logOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // We need to track if Firestore says this user has completed onboarding:
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  // If user signs in (or refreshes while logged in), fetch their “users/{uid}” doc:
  useEffect(() => {
    async function fetchProfile() {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOnboarded(Boolean(data.onboarded));
        } else {
          // It’s possible the “users/{uid}” doc doesn’t exist yet (no onboarding touched)
          setOnboarded(false);
        }
      } else {
        // If not logged in, we don’t care about onboarding
        setOnboarded(null);
      }
      setProfileLoaded(true);
    }
    fetchProfile();
  }, [user]);

  // Hide the top header on /login or /signup:
  const hideHeader = location.pathname.startsWith("/login") || location.pathname.startsWith("/signup");

  // While we’re loading the user profile from Firestore, show a spinner:
  if (user && !profileLoaded) {
    return (
      <div style={{ color: "#fff", textAlign: "center", marginTop: "3rem" }}>
        Loading profile…
      </div>
    );
  }

  return (
    <div style={{ background: "#121212", minHeight: "100vh", paddingTop: hideHeader ? 0 : "1rem" }}>
      {!hideHeader && (
        <header style={headerStyles.container}>
          <div style={headerStyles.logoContainer}>
            <img src={logoSrc} alt="Bingefy Logo" style={headerStyles.logoImage} />
          </div>
          <nav style={headerStyles.nav}>
            {user ? (
              <>
                <span style={headerStyles.welcome}>Hello, {username}</span>
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
          {/* Unauthenticated routes */}
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />

          {/* RequireAuth wraps everything under "/" */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RequireOnboarding onboarded={onboarded}>
                  <TabsLayout />
                </RequireOnboarding>
              </ProtectedRoute>
            }
          >
            {/* If already onboarded, default to “shows” */}
            <Route index element={<Navigate to="shows" replace />} />
            <Route path="shows" element={<ShowsPage />} />
            <Route path="movies" element={<MoviesPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Onboarding wizard steps (only visible if user not onboarded) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="step1" replace />} />
            <Route path="step1" element={<Step1BirthdateGender />} />
            <Route path="step2" element={<Step2PickShows />} />
            <Route path="step3" element={<Step3WatchedMovies />} />
            <Route path="step4" element={<Step4ToWatchMovies />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: RequireOnboarding
// If onboarded===false, redirect the user into /onboarding/step1.
// If onboarded===true, show the normal “tabs” layout. If null (not logged in), do nothing here.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";
function RequireOnboarding({ onboarded, children }: { onboarded: boolean | null; children: ReactNode }) {
  const location = useLocation();
  if (onboarded === false) {
    // If the user isn’t onboarded yet, send them into step1 (birthdate/gender)
    return <Navigate to="/onboarding/step1" state={{ from: location }} replace />;
  }
  // If onboarded===true (or user===null, meaning not signed in), just render children
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: OnboardingLayout
// A shared layout around each onboarding step (centered card, progress indicator, etc.)
// ─────────────────────────────────────────────────────────────────────────────
import { Outlet } from "react-router-dom";

function OnboardingLayout() {
  return (
    <div style={onboardStyles.fullscreenContainer}>
      <div style={onboardStyles.overlay} />
      <div style={onboardStyles.centerContainer}>
        <div style={onboardStyles.card}>
          {/* A simple “progress” indicator */}
          <h2 style={onboardStyles.heading}>Tell us about yourself</h2>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

const onboardStyles: { [key: string]: React.CSSProperties } = {
  fullscreenContainer: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 1,
  },
  centerContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "100%",
    maxWidth: "480px",
    padding: "1rem",
    boxSizing: "border-box",
    zIndex: 2,
  },
  card: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    borderRadius: "8px",
    padding: "2rem",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
    color: "#fff",
  },
  heading: {
    fontSize: "1.5rem",
    textAlign: "center",
    marginBottom: "1.5rem",
  },
};

const headerStyles: { [key: string]: React.CSSProperties } = {
  container: {
    marginBottom: "2rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 1rem",
    backgroundColor: "#000",
  },
  logoContainer: {},
  logoImage: {
    height: "40px",
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
