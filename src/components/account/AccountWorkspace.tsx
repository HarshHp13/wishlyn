"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  getAuthState,
  getServerAuthState,
  subscribeAuth,
  refreshAuthSession,
  clearAuthSession,
} from "@/lib/authClient";
import { accountRequest } from "@/lib/account/client";
import { INDIAN_STATES } from "@/lib/commerce/validation";
import type { AccountProfile, SavedAddress } from "@/lib/account/types";
import styles from "./account.module.css";
const emptyAddress = {
  label: "",
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "India" as const,
};
export default function AccountWorkspace() {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthState,
    getServerAuthState,
  );
  const [knownOwner, setKnownOwner] = useState<string | null>(null);
  if (
    auth.status === "authenticated" &&
    auth.user &&
    auth.user.id !== knownOwner
  )
    setKnownOwner(auth.user.id);
  useEffect(() => {
    void refreshAuthSession().catch(() => undefined);
  }, []);
  return (
    <>
      <Header />
      <AccountContent key={auth.user?.id || knownOwner || "unverified"} />
      <Footer />
    </>
  );
}
function AccountContent() {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthState,
    getServerAuthState,
  );
  const owner = auth.status === "authenticated" ? auth.user?.id : null;
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null),
    [profile, setProfile] = useState<AccountProfile | null>(null),
    [addresses, setAddresses] = useState<SavedAddress[]>([]),
    [address, setAddress] = useState<
      typeof emptyAddress & { id?: string; version?: number }
    >(emptyAddress),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [password, setPassword] = useState({
      currentPassword: "",
      newPassword: "",
    });
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    Promise.all([
      accountRequest<{ profile: AccountProfile }>(
        "/api/account/profile",
        undefined,
        controller.signal,
      ),
      accountRequest<{ ownerId: string; addresses: SavedAddress[] }>(
        "/api/account/addresses",
        undefined,
        controller.signal,
      ),
    ])
      .then(([p, a]) => {
        if (
          controller.signal.aborted ||
          p.profile.ownerId !== owner ||
          a.ownerId !== owner
        )
          return;
        setProfile(p.profile);
        setAddresses(a.addresses);
        setLoadedOwner(owner);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoadedOwner(owner);
          setProfile(null);
          setAddresses([]);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [owner, revision]);
  const current = () =>
    getAuthState().status === "authenticated" &&
    getAuthState().user?.id === owner;
  async function perform(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      if (current()) setNotice(success);
    } catch (e) {
      if (current())
        setError(
          e instanceof Error ? e.message : "This update could not be saved.",
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  const reload = () => {
    setRevision((v) => v + 1);
  };
  return (
    <>
      <main id="main-content" className={styles.page}>
        <div className="container">
          <nav className={styles.nav} aria-label="Account navigation">
            <Link href="/orders">My orders</Link>
            <Link href="/wishlist">Saved pieces</Link>
            <Link href="/support">Help and requests</Link>
            {auth.user?.role === "admin" && (
              <>
                <Link href="/admin">Administration</Link>
                <Link href="/admin/support">Support queue</Link>
              </>
            )}
          </nav>
          <h1>My account</h1>
          {auth.status === "loading" ? (
            <p role="status">Verifying your account…</p>
          ) : auth.status === "error" ? (
            <div className={styles.error} role="alert">
              Your account could not be verified.{" "}
              <button
                onClick={() => {
                  void refreshAuthSession(true).catch(() => undefined);
                }}
              >
                Retry account check
              </button>
            </div>
          ) : auth.status === "guest" ? (
            <p>
              <Link href="/login?redirect=%2Fprofile">
                Sign in to manage your account
              </Link>
            </p>
          ) : loadedOwner !== owner ? (
            <p role="status">Loading your account details…</p>
          ) : (
            <>
              {error && (
                <div role="alert" className={styles.error}>
                  {error} <button onClick={reload}>Reload account</button>
                </div>
              )}
              {notice && (
                <p role="status" className={styles.notice}>
                  {notice}
                </p>
              )}
              {profile && (
                <>
                  <div className={styles.grid}>
                    <section className={styles.panel}>
                      <h2>Profile</h2>
                      <p className={styles.meta}>{profile.email}</p>
                      <form
                        className={styles.form}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void perform(async () => {
                            const data = await accountRequest<{
                              profile: AccountProfile;
                            }>("/api/account/profile", profile);
                            if (current()) setProfile(data.profile);
                          }, "Profile saved.");
                        }}
                      >
                        <div className={styles.fields}>
                          {(["firstName", "lastName"] as const).map((key) => (
                            <label
                              className={styles.field}
                              key={key}
                              htmlFor={key}
                            >
                              {key === "firstName" ? "First name" : "Last name"}
                              <input
                                id={key}
                                autoComplete={
                                  key === "firstName"
                                    ? "given-name"
                                    : "family-name"
                                }
                                maxLength={80}
                                value={profile[key]}
                                onChange={(e) =>
                                  setProfile({
                                    ...profile,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <button disabled={busy}>Save profile</button>
                      </form>
                    </section>
                    <section className={styles.panel}>
                      <h2>Account security</h2>
                      <form
                        className={styles.form}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void perform(async () => {
                            await accountRequest(
                              "/api/account/password",
                              password,
                            );
                            if (current()) {
                              setPassword({
                                currentPassword: "",
                                newPassword: "",
                              });
                              await refreshAuthSession(true);
                            }
                          }, "Password changed. Sign in again.");
                        }}
                      >
                        <label
                          className={styles.field}
                          htmlFor="current-password"
                        >
                          Current password
                          <input
                            id="current-password"
                            type="password"
                            autoComplete="current-password"
                            required
                            maxLength={1024}
                            value={password.currentPassword}
                            onChange={(e) =>
                              setPassword({
                                ...password,
                                currentPassword: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className={styles.field} htmlFor="new-password">
                          New password
                          <input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            maxLength={72}
                            value={password.newPassword}
                            onChange={(e) =>
                              setPassword({
                                ...password,
                                newPassword: e.target.value,
                              })
                            }
                          />
                        </label>
                        <p className={styles.meta}>
                          At least 8 characters, at most 72 UTF-8 bytes.
                          Changing your password signs out all devices.
                        </p>
                        <button disabled={busy}>Change password</button>
                        <Link href="/forgot-password">Password recovery</Link>
                      </form>
                    </section>
                  </div>
                  <section className={styles.panel}>
                    <h2>Saved delivery addresses</h2>
                    <p className={styles.meta}>
                      Addresses are private to your account. Checkout currently
                      supports India.
                    </p>
                    <ul className={styles.list}>
                      {addresses.map((a) => (
                        <li className={styles.item} key={a.id}>
                          <strong>{a.label}</strong>
                          <address>
                            {a.firstName} {a.lastName}
                            <br />
                            {a.address}
                            <br />
                            {a.city}, {a.state} {a.zipCode}
                            <br />
                            {a.phone}
                          </address>
                          <div className={styles.actions}>
                            <button
                              disabled={busy}
                              onClick={() => {
                                setAddress(a);
                                setNotice("Editing saved address.");
                              }}
                            >
                              Edit {a.label}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                void perform(async () => {
                                  const data = await accountRequest<{
                                    ownerId: string;
                                    addresses: SavedAddress[];
                                  }>("/api/account/addresses", {
                                    action: "delete",
                                    id: a.id,
                                    version: a.version,
                                  });
                                  if (current()) setAddresses(data.addresses);
                                }, "Address deleted.");
                              }}
                            >
                              Delete {a.label}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <form
                      className={styles.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void perform(async () => {
                          const data = await accountRequest<{
                            ownerId: string;
                            addresses: SavedAddress[];
                          }>("/api/account/addresses", address);
                          if (current()) {
                            setAddresses(data.addresses);
                            setAddress(emptyAddress);
                          }
                        }, "Address saved.");
                      }}
                    >
                      <h3>{address.id ? "Edit address" : "Add address"}</h3>
                      <div className={styles.fields}>
                        {(
                          [
                            { key: "label", label: "Address label", max: 60 },
                            {
                              key: "firstName",
                              label: "Recipient first name",
                              max: 80,
                            },
                            {
                              key: "lastName",
                              label: "Recipient last name",
                              max: 80,
                            },
                            { key: "phone", label: "Mobile number", max: 20 },
                            {
                              key: "address",
                              label: "Street address",
                              max: 300,
                            },
                            { key: "city", label: "City", max: 80 },
                            { key: "zipCode", label: "PIN code", max: 6 },
                          ] as const
                        ).map((field) => (
                          <label
                            className={styles.field}
                            key={field.key}
                            htmlFor={`address-${field.key}`}
                          >
                            {field.label}
                            <input
                              id={`address-${field.key}`}
                              required
                              maxLength={field.max}
                              type={field.key === "phone" ? "tel" : "text"}
                              inputMode={
                                field.key === "zipCode" ? "numeric" : undefined
                              }
                              value={address[field.key]}
                              onChange={(e) =>
                                setAddress({
                                  ...address,
                                  [field.key]: e.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <label className={styles.field} htmlFor="address-state">
                          State / union territory
                          <select
                            id="address-state"
                            required
                            value={address.state}
                            onChange={(e) =>
                              setAddress({ ...address, state: e.target.value })
                            }
                          >
                            <option value="">Choose a state</option>
                            {INDIAN_STATES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                        <label
                          className={styles.field}
                          htmlFor="address-country"
                        >
                          Country
                          <input id="address-country" value="India" readOnly />
                        </label>
                      </div>
                      <div className={styles.actions}>
                        <button disabled={busy}>Save address</button>
                        {address.id && (
                          <button
                            type="button"
                            onClick={() => setAddress(emptyAddress)}
                          >
                            Cancel edit
                          </button>
                        )}
                      </div>
                    </form>
                  </section>
                  <div className={styles.actions}>
                    <Link href="/">Continue shopping</Link>
                    <button
                      disabled={busy}
                      onClick={() => {
                        void perform(async () => {
                          await clearAuthSession();
                        }, "Signed out.");
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
