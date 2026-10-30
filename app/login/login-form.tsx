"use client";
import { useState, type FormEvent } from "react";
import { GoogleAuthProvider, createUserWithEmailAndPassword, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { NotebookPen, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { firebaseAuth, syncAuthSession } from "@/lib/firebase-client";

function authMessage(error: unknown) {
  const code = (error as { code?: string }).code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use": "This email already has an account. Sign in or reset your password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password with at least 8 characters.",
    "auth/password-does-not-meet-requirements": "Choose a stronger password that meets the account's password policy.",
    "auth/popup-closed-by-user": "The Google window was closed. You can try again.",
    "auth/popup-blocked": "Allow popups for this website, then try Google sign-in again.",
    "auth/unauthorized-domain": "This website address must be added to Firebase's authorized domains.",
    "auth/operation-not-allowed": "Enable Email/Password and Google sign-in in the Firebase console.",
    "auth/too-many-requests": "Too many attempts. Please wait before trying again.",
    "auth/network-request-failed": "Could not connect. Check your internet connection and try again.",
    "auth/account-exists-with-different-credential": "This email uses another sign-in method. Sign in with that method first.",
  };
  return (code && messages[code]) || "Sign-in could not finish. Please try again.";
}

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const changeMode = (value: typeof mode) => { setMode(value); setError(""); setMessage(""); setPassword(""); };
  const finish = async () => {
    const user = firebaseAuth().currentUser;
    if (!user?.emailVerified) { setNeedsVerification(true); return; }
    await syncAuthSession(user);
    window.location.replace("/");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const auth = firebaseAuth();
      if (mode === "reset") {
        try { await sendPasswordResetEmail(auth, email.trim()); }
        catch (e) { if ((e as {code?: string}).code !== "auth/user-not-found") throw e; }
        setMessage("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.");
      } else if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        setPassword(""); setNeedsVerification(true);
        await sendEmailVerification(result.user);
        setMessage("Check your email for a verification link, then return here.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setPassword(""); await finish();
      }
    } catch (e) { setError(authMessage(e)); } finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true); setError(""); setMessage("");
    try { await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()); await finish(); }
    catch (e) { setError(authMessage(e)); } finally { setBusy(false); }
  };
  const verify = async (resend: boolean) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const user = firebaseAuth().currentUser;
      if (!user) { setNeedsVerification(false); changeMode("login"); return; }
      if (resend) { await sendEmailVerification(user); setMessage("A new verification email has been sent."); }
      else {
        await reload(user);
        if (!user.emailVerified) setMessage("Your email is not verified yet. Open the link in your email, then try again.");
        else { await user.getIdToken(true); await finish(); }
      }
    } catch (e) { setError(authMessage(e)); } finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <a className="brand" href="/"><span className="brand-mark"><NotebookPen size={23}/></span><span>noteatlas<span className="brand-period">.</span></span></a>
    <section className="auth-card">
      <span className="eyebrow">A HOME FOR YOUR IDEAS</span>
      <h1>{needsVerification ? "Check your inbox." : mode === "signup" ? "Make room for ideas." : mode === "reset" ? "Find your way back." : "Welcome back."}</h1>
      <p>{needsVerification ? "Verify your email before accessing your private notes." : mode === "signup" ? "Create your free account to start your own notebook." : mode === "reset" ? "We'll email you a link to reset your password." : "Your notes, right where you left them."}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      {needsVerification ? <div className="auth-form">
        <button className="button primary full-width" disabled={busy} onClick={() => verify(false)}>I've verified my email</button>
        <button className="button secondary full-width" disabled={busy} onClick={() => verify(true)}>Resend verification email</button>
        <button className="button ghost" disabled={busy} onClick={async () => { setBusy(true); try { await signOut(firebaseAuth()); await syncAuthSession(null); setNeedsVerification(false); changeMode("login"); } catch(e) { setError(authMessage(e)); } finally { setBusy(false); } }}>Use another account</button>
      </div> : <>
        {mode !== "reset" && <><button className="button secondary full-width" disabled={busy} onClick={google}>Continue with Google</button><div className="auth-divider">or use your email</div></>}
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
          {mode !== "reset" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} maxLength={4096} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/>{mode === "signup" && <small>Use at least 8 characters.</small>}</label>}
          <button className="button primary full-width" disabled={busy} type="submit">{busy && <Loader2 size={15} className="spin"/>}{mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
        </form>
        <div className="auth-links">{mode === "login" ? <><button disabled={busy} onClick={() => changeMode("reset")}>Forgot password?</button><button disabled={busy} onClick={() => changeMode("signup")}>Create an account</button></> : <button disabled={busy} onClick={() => changeMode("login")}>Back to sign in</button>}</div>
      </>}
      <div className="soft-note"><ShieldCheck size={18}/><span>Your notes are private. Research is optional and stays off unless you separately choose to join.</span></div>
    </section>
    <a className="auth-back" href="/"><ArrowLeft size={15}/>Back to NoteAtlas</a>
  </main>;
}
