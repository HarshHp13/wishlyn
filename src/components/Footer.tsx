"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import styles from "./Footer.module.css";

export default function Footer() {
  const { setIsCartOpen } = useCart();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) throw new Error("Subscription failed");
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }
  return (
    <footer className={styles.footer}>
      <div className={`${styles.newsletter} container`}>
        <div>
          <span className="eyebrow">LET’S STAY A LITTLE CLOSER</span>
          <h2>
            Your inbox. <em>A little more golden.</em>
          </h2>
          <p>
            New pieces, styling notes, and first dibs. A little Wishlyn, just
            for you.
          </p>
        </div>
        <div className={styles.signup}>
          {status === "success" ? (
            <p className={styles.success} role="status">
              You’re on the list. Welcome to the Wishlyn circle.
            </p>
          ) : (
            <form onSubmit={subscribe}>
              <label className={styles.emailLabel} htmlFor="newsletter-email">
                Your email address
              </label>
              <div className={styles.emailRow}>
                <input
                  id="newsletter-email"
                  type="email"
                  maxLength={254}
                  required
                  autoComplete="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={status === "submitting"}
                />
                <button
                  type="submit"
                  aria-label="Join the newsletter"
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? (
                    "Joining…"
                  ) : (
                    <ArrowRight size={23} strokeWidth={1.3} />
                  )}
                </button>
              </div>
              <p className={styles.formNote}>
                By subscribing, you agree to receive emails from Wishlyn.
              </p>
              {status === "error" && (
                <p role="alert" className={styles.error}>
                  We couldn’t add you just now. Please try again.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
      <div className={`${styles.footerMain} container`}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo} aria-label="Wishlyn home">
            <Image
              src="/wishlyn-mark.png"
              alt="Wishlyn"
              width={447}
              height={354}
              unoptimized
            />
          </Link>
          <p>
            Jewellery for every version of you.
            <br />
            Thoughtfully made. Effortlessly yours.
          </p>
        </div>
        <nav className={styles.linkColumns} aria-label="Footer navigation">
          <div>
            <h3>Find your shine</h3>
            <Link href="/#shop">All jewellery</Link>
            <Link href="/?category=earrings#shop">Earrings</Link>
            <Link href="/?category=necklaces#shop">Necklaces</Link>
            <Link href="/?category=bracelets#shop">Bracelets</Link>
          </div>
          <div>
            <h3>Your Wishlyn</h3>
            <Link href="/profile">Your account</Link>
            <Link href="/wishlist">Your wishlist</Link>
            <button type="button" onClick={() => setIsCartOpen(true)}>Your shopping bag</button>
            <Link href="/support">Help with your order</Link>
            <Link href="/#story">
              Our world <ArrowUpRight size={12} />
            </Link>
          </div>
        </nav>
        <div className={styles.footerNote}>
          <span>MADE TO MATCH YOU</span>
          <p>
            A little gold.
            <br />
            <em>All you.</em>
          </p>
        </div>
      </div>
      <div className={`${styles.bottom} container`}>
        <p>© {new Date().getFullYear()} Wishlyn. All rights reserved.</p>
        <span>A little love, in every detail.</span>
      </div>
    </footer>
  );
}
