// src/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification as firebaseSendEmailVerification,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  Firestore,
  type DocumentData,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
};

// Initialize Firebase App, Auth, and Firestore
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ─────────────────────────────────────────────────────────────────────────────
// 2) FUNCTIONS FOR AUTH:

// Sign up: returns the newly‐created UserCredential (so we can send verification, etc.)
export const signUpWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const logOut = () => signOut(auth);

export const onUserStateChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

export const sendEmailVerification = (user: User) =>
  firebaseSendEmailVerification(user);

// ─────────────────────────────────────────────────────────────────────────────
// 3) FUNCTIONS FOR USERNAME UNIQUENESS in FIRESTORE:

/**
 * Check if a username already exists.
 * In Firestore, we’ll keep a collection “usernames” where each document ID is the username itself.
 * The document’s data will include uid and email for convenience.
 */
export async function checkUsernameExists(username: string): Promise<boolean> {
  // Convert to lowercase to enforce case-insensitive uniqueness
  const unameKey = username.trim().toLowerCase();
  const docRef = doc(db, "usernames", unameKey);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
}

/**
 * After we create a new user (in sign‐up), we write two docs:
 * 1) “usernames/{username}” → { uid, email }
 * 2) “users/{uid}” → { username, email }
 *
 * This makes it easy to look up:
 *   • At login time by username → email
 *   • To retrieve the user’s own profile info by UID later (e.g. username)
 */
export async function registerUsername(
  uid: string,
  username: string,
  email: string
): Promise<void> {
  const unameKey = username.trim().toLowerCase();

  // 1) Map username → { uid, email }
  await setDoc(doc(db, "usernames", unameKey), {
    uid,
    email,
  });

  // 2) Create a user‐specific doc so we can read user profiles later
  await setDoc(doc(db, "users", uid), {
    username: unameKey,
    email,
  });
}

/**
 * Given a username, retrieve the mapped email (if it exists).
 * Returns email if found, otherwise returns null.
 */
export async function lookupEmailByUsername(
  username: string
): Promise<string | null> {
  const unameKey = username.trim().toLowerCase();
  const docRef = doc(db, "usernames", unameKey);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data() as DocumentData;
    return data.email as string;
  }
  return null;
}

/**
 * Given a UID, fetch the stored username from “users/{uid}”.
 * Returns username string or null if not found.
 */
export async function lookupUsernameByUID(uid: string): Promise<string | null> {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data() as DocumentData;
    return data.username as string;
  }
  return null;
}
