"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { firebaseAuth, syncAuthSession } from "@/lib/firebase-client";

const AuthStatus = createContext({ ready: false, revision: 0 });
export const useAuthStatus = () => useContext(AuthStatus);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState({ ready: false, revision: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let queue = Promise.resolve();
    let previousIdentity: string | null | undefined;
    const stop = onIdTokenChanged(firebaseAuth(), user => {
      const identity = user?.emailVerified ? user.uid : null;
      const changed = previousIdentity !== identity;
      previousIdentity = identity;
      if (changed) setStatus(s => ({ ...s, ready: false }));
      // Serialize cookie updates so a late login response cannot undo logout.
      queue = queue.then(async () => {
        if (!active) return;
        await syncAuthSession(user);
        if (active) { setError(""); setStatus(s => ({ ready: true, revision: s.revision + (changed ? 1 : 0) })); }
      }).catch(() => {
        if (active) setError("Could not connect your sign-in session. Check your connection and reload to try again.");
      });
    });
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const user = firebaseAuth().currentUser;
      if (user?.emailVerified) user.getIdToken(true).catch(() => {
        if (active) setError("Could not refresh your session. Check your connection and reload.");
      });
    };
    const timer = setInterval(refresh, 45 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; stop(); clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <AuthStatus.Provider value={status}>
    {error && <div className="error-banner" role="alert">{error} <button onClick={() => window.location.reload()}>Reload</button></div>}
    {children}
  </AuthStatus.Provider>;
}
