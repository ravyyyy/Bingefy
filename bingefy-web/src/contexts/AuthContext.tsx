// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  auth,
  onUserStateChange,
  signUpWithEmail,
  logInWithEmail,
  logOut as firebaseLogOut,
  sendEmailVerification,
  db,
  checkUsernameExists,
  registerUsername,
  lookupEmailByUsername,
  lookupUsernameByUID,
} from "../firebase";
import type { User } from "firebase/auth";

// 1) Extend the context to include `username` and a `loginIdentifier` function
type AuthContextType = {
  user: User | null;
  username: string | null;    // store the user’s chosen username
  loading: boolean;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  logIn: (identifier: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  sendVerification: () => Promise<void>;
};

// 2) Default values for the context (will be overwritten in provider)
const AuthContext = createContext<AuthContextType>({
  user: null,
  username: null,
  loading: true,
  signUp: async () => {},
  logIn: async () => {},
  logOut: async () => {},
  sendVerification: async () => {},
});

// 3) Provider implementation
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // When Firebase Auth state changes (login, logout, verification, etc.)
  useEffect(() => {
    const unsubscribe = onUserStateChange(async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // If the user is logged in (and email was verified), fetch their username:
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        const uname = await lookupUsernameByUID(uid);
        setUsername(uname);
      } else {
        setUsername(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) signUp: enforce unique username → create user → store username → send email verify → sign out
  // ─────────────────────────────────────────────────────────────────────────────
  const signUp = async (usernameInput: string, email: string, password: string) => {
    // 1) Trim + lowercase for uniformity
    const unameKey = usernameInput.trim().toLowerCase();
    if (!unameKey) {
      throw new Error("Username cannot be empty.");
    }

    // 2) Check Firestore if that username already exists
    const exists = await checkUsernameExists(unameKey);
    if (exists) {
      throw new Error("Username already taken. Please choose another one.");
    }

    // 3) Create the Firebase Auth user
    const userCredential = await signUpWithEmail(email, password);
    const newUser = userCredential.user;

    // 4) Immediately store username→uid and users→username mapping
    await registerUsername(newUser.uid, unameKey, email);

    // 5) Send verification email
    await sendEmailVerification(newUser);

    // 6) Sign out the fresh user so they cannot proceed until verified
    await firebaseLogOut();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) logIn: accept either “email” or “username” as identifier
  // ─────────────────────────────────────────────────────────────────────────────
  const logIn = async (identifier: string, password: string) => {
    // 1) Determine if identifier is an email (contains “@”)
    let emailToUse: string | null = null;

    if (identifier.includes("@")) {
      // User typed an email directly
      emailToUse = identifier.trim();
    } else {
      // Treat as username → look up the corresponding email in Firestore
      const emailLookup = await lookupEmailByUsername(identifier);
      if (!emailLookup) {
        throw new Error("Username not found.");
      }
      emailToUse = emailLookup;
    }

    // 2) Sign in with the resolved email
    const userCredential = await logInWithEmail(emailToUse, password);
    const loggedInUser = userCredential.user;

    // 3) If email not verified, sign out & throw
    if (!loggedInUser.emailVerified) {
      await firebaseLogOut();
      throw new Error(
        "Email not verified. Please check your inbox for the verification link."
      );
    }

    // If we reach here, login is successful and email is verified.
    // The onUserStateChange listener will pick up and fetch `username` automatically.
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 6) logOut & sendVerification
  // ─────────────────────────────────────────────────────────────────────────────
  const logOut = async () => {
    await firebaseLogOut();
  };

  const sendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, username, loading, signUp, logIn, logOut, sendVerification }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
