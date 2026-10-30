"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type User } from "firebase/auth";
import { firebaseConfig } from "./firebase-config";

export function firebaseAuth() {
  return getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
}

export async function syncAuthSession(user: User | null) {
  const token = user?.emailVerified ? await user.getIdToken() : null;
  const response = await fetch("/api/auth/session", {
    method: token ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: token ? JSON.stringify({ token }) : undefined,
  });
  if (!response.ok) {
    const data = await response.json() as { error?: string };
    throw new Error(data.error || "Could not start your session. Please try again.");
  }
}
