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
  checkUsernameExists,
  registerUsername,
  lookupEmailByUsername,
  lookupUsernameByUID,
} from "../firebase";
import type { User } from "firebase/auth";

type AuthContextType = {
  user: User | null;
  username: string | null;
  loading: boolean;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  logIn: (identifier: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  sendVerification: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  username: null,
  loading: true,
  signUp: async () => {},
  logIn: async () => {},
  logOut: async () => {},
  sendVerification: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onUserStateChange(async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

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
  //  Updated signUp: create user → register username → send verification → THEN await signOut()
  // ─────────────────────────────────────────────────────────────────────────────
  const signUp = async (
    usernameInput: string,
    email: string,
    password: string
  ) => {
    // 1) trim + lowercase
    const unameKey = usernameInput.trim().toLowerCase();
    if (!unameKey) {
      throw new Error("Username cannot be empty.");
    }

    // 2) check uniqueness
    const exists = await checkUsernameExists(unameKey);
    if (exists) {
      throw new Error("Username already taken. Please choose another one.");
    }

    // 3) create the Auth user
    const userCredential = await signUpWithEmail(email, password);
    const newUser = userCredential.user;

    // 4) immediately write username → { uid, email } & users/{uid} → { username, email }
    await registerUsername(newUser.uid, unameKey, email);

    // 5) send verification email
    await sendEmailVerification(newUser);

    // 6) NOW explicitly sign out and await it before returning
    await firebaseLogOut();
    // By the time we return, Firebase’s currentUser is null again.
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  logIn & logOut & sendVerification (unchanged)
  // ─────────────────────────────────────────────────────────────────────────────
  const logIn = async (identifier: string, password: string) => {
    let emailToUse: string | null = null;

    if (identifier.includes("@")) {
      emailToUse = identifier.trim();
    } else {
      const emailLookup = await lookupEmailByUsername(identifier);
      if (!emailLookup) {
        throw new Error("Username not found.");
      }
      emailToUse = emailLookup;
    }

    const userCredential = await logInWithEmail(emailToUse, password);
    const loggedInUser = userCredential.user;

    if (!loggedInUser.emailVerified) {
      await firebaseLogOut();
      throw new Error(
        "Email not verified. Please check your inbox for the verification link."
      );
    }
  };

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
