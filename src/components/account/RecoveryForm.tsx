"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { accountRequest } from "@/lib/account/client";
import { refreshAuthSession } from "@/lib/authClient";
import styles from "./account.module.css";
export default function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const captured = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    if (reset) {
      if (captured.current === null)
        captured.current =
          new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
      const value = captured.current;
      window.history.replaceState(null, "", window.location.pathname);
      queueMicrotask(() => {
        if (active) setToken(value);
      });
    }
    return () => {
      active = false;
    };
  }, [reset]);
  return (
    <>
      <Header />
      <main id="main-content" className={styles.page}>
        <div className="container">
          <section className={styles.panel}>
            <h1>{reset ? "Choose a new password" : "Password recovery"}</h1>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {message && (
              <p role="status" className={styles.notice}>
                {message}
              </p>
            )}
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                void accountRequest<{ message: string }>(
                  reset
                    ? "/api/account/reset-password"
                    : "/api/account/recovery",
                  null,
                  reset ? { token, newPassword: password } : { email },
                )
                  .then(async (data) => {
                    setMessage(data.message);
                    if (reset) {
                      setToken("");
                      setPassword("");
                      await refreshAuthSession(true).catch(() => undefined);
                    }
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {reset ? (
                <>
                  <label className={styles.field} htmlFor="reset-password">
                    New password
                    <input
                      id="reset-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <p className={styles.meta}>
                    Use at least 8 characters and at most 72 UTF-8 bytes.
                    Resetting signs out existing sessions.
                  </p>
                  {!token && !message && (
                    <p role="alert">
                      Open the complete reset link from your email.{" "}
                      <Link href="/forgot-password">Request another link</Link>.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className={styles.field} htmlFor="recovery-email">
                    Account email
                    <input
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <p className={styles.meta}>
                    Enter the email address used for your account. If recovery
                    is unavailable, see store help for the available support
                    options.
                  </p>
                </>
              )}
              <button disabled={busy || (reset && !token)}>
                {busy
                  ? "Processing…"
                  : reset
                    ? "Reset password"
                    : "Request reset link"}
              </button>
            </form>
            <p>
              <Link href="/login">Back to sign in</Link> ·{" "}
              <Link href="/support">Store help</Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
