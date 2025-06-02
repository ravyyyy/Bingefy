// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  auth,
  onUserStateChange,
  signUp as firebaseSignUp,
  logIn as firebaseLogIn,
  logOut as firebaseLogOut,
  sendEmailVerification as firebaseSendEmailVerification,
} from "../firebase";
import type { User } from "firebase/auth";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  sendVerification: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signUp: async () => {},
  logIn: async () => {},
  logOut: async () => {},
  sendVerification: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onUserStateChange((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Wrapper for signing up
  const signUp = async (email: string, password: string) => {
    const userCredential = await firebaseSignUp(email, password);
    const newUser = userCredential.user;
    // Immediately send a verification email
    await firebaseSendEmailVerification(newUser);
    // Then sign them out so they cannot proceed until verified
    await firebaseLogOut();
  };

  // Wrapper for logging in
  const logIn = async (email: string, password: string) => {
    const userCredential = await firebaseLogIn(email, password);
    const loggedInUser = userCredential.user;

    // If email not verified, immediately sign out and throw an error
    if (!loggedInUser.emailVerified) {
      await firebaseLogOut();
      throw new Error(
        "Email not verified. Please check your inbox for a verification link."
      );
    }
    // Otherwise, user stays signed in
  };

  const logOut = async () => {
    await firebaseLogOut();
  };

  // In case you want a manual resend button:
  const sendVerification = async () => {
    if (auth.currentUser) {
      await firebaseSendEmailVerification(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        logIn,
        logOut,
        sendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
