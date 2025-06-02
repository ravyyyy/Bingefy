// src/App.tsx
import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import { SignUp } from "./components/SignUp";
import { Login } from "./components/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Your main “tabs” pages
import { TabsLayout } from "./components/TabsLayout";
import { ShowsPage } from "./components/ShowsPage";
import { MoviesPage } from "./components/MoviesPage";
import { ExplorePage } from "./components/ExplorePage";
import { ProfilePage } from "./components/ProfilePage";

// Onboarding steps:
import { Step1BirthdateGender } from "./components/onboarding/Step1BirthdateGender";
import { Step2PickShows } from "./components/onboarding/Step2PickShows";
import { Step3WatchedMovies } from "./components/onboarding/Step3WatchedMovies";
import { Step4ToWatchMovies } from "./components/onboarding/Step4ToWatchMovies";

import logoSrc from "./assets/bingefy_text_logo.png";

function App() {
  const { user, username, logOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // We’ll load the Firestore user doc once they're signed in:
  const [profileData, setProfileData] = useState<null | {
    birthdate?: string;
    gender?: string | null;
    showsOnboarded?: number[];
    moviesWatched?: number[];
    moviesToWatch?: number[];
    onboarded?: boolean;
  }>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfileData(null);
      setLoadingProfile(false);
      return;
    }
    // Fetch the user’s Firestore doc at /users/{uid}:
    (async () => {
      setLoadingProfile(true);
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setProfileData(snap.data() as any);
      } else {
        setProfileData({});
      }
      setLoadingProfile(false);
    })();
  }, [user]);

  // Hide header on /login or /signup
  const hideHeader = location.pathname.startsWith("/login") || location.pathname.startsWith("/signup");

  // If the user is signed in but we haven’t loaded Firestore data yet, show a loading spinner:
  if (user && loadingProfile) {
    return (
      <div style={{ color: "#fff", textAlign: "center", marginTop: "3rem" }}>
        Loading your profile…
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
          {/* Public: signup / login */}
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />

          {/* All routes under "/" require auth + onboarding */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <OnboardingGate profileData={profileData}>
                  <TabsLayout />
                </OnboardingGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="shows" replace />} />
            <Route path="shows" element={<ShowsPage />} />
            <Route path="movies" element={<MoviesPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Onboarding wizard: only accessible if not fully onboarded */}
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

/** 
 * OnboardingGate inspects profileData (fetched from Firestore). 
 * It enforces STEP 1 → STEP 2 → STEP 3 → STEP 4 → DONE.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

function OnboardingGate({
  profileData,
  children,
}: {
  profileData: {
    birthdate?: string;
    gender?: string | null;
    showsOnboarded?: number[];
    moviesWatched?: number[];
    moviesToWatch?: number[];
    onboarded?: boolean;
  } | null;
  children: ReactNode;
}) {
  const location = useLocation();

  // If profileData is null, or user not signed in, just render children
  if (profileData === null) {
    return <>{children}</>;
  }

  // If they already completed all steps (onboarded===true), show the app
  if (profileData.onboarded) {
    return <>{children}</>;
  }

  // STEP 1: If no birthdate, send to /onboarding/step1
  if (!profileData.birthdate) {
    return <Navigate to="/onboarding/step1" state={{ from: location }} replace />;
  }

  // STEP 2: If birthdate exists but no showsOnboarded, /onboarding/step2
  if (!profileData.showsOnboarded) {
    return <Navigate to="/onboarding/step2" state={{ from: location }} replace />;
  }

  // STEP 3: If showsOnboarded exists but no moviesWatched, /onboarding/step3
  if (!profileData.moviesWatched) {
    return <Navigate to="/onboarding/step3" state={{ from: location }} replace />;
  }

  // STEP 4: If moviesWatched exists but no moviesToWatch, /onboarding/step4
  if (!profileData.moviesToWatch) {
    return <Navigate to="/onboarding/step4" state={{ from: location }} replace />;
  }

  // Otherwise (all steps done but onboarded not yet flagged), let Step4 set onboarded=true
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingLayout: same as before—puts a card & progress bar around each step
// ─────────────────────────────────────────────────────────────────────────────
import { Outlet } from "react-router-dom";

function OnboardingLayout() {
  return (
    <div style={onboardStyles.fullscreenContainer}>
      <div style={onboardStyles.overlay} />
      <div style={onboardStyles.centerContainer}>
        <div style={onboardStyles.card}>
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
