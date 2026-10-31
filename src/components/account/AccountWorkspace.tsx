"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Heart, LayoutDashboard, LogOut, MapPin, MessageCircle, Package, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
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
import styles from "./profileWorkspace.module.css";
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
  const addressHeading = useRef<HTMLHeadingElement>(null);
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
        owner,
        undefined,
        controller.signal,
      ),
      accountRequest<{ ownerId: string; addresses: SavedAddress[] }>(
        "/api/account/addresses",
        owner,
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
    void refreshAuthSession(true).then(() => setRevision(v => v + 1)).catch(() => undefined);
  };
  const visibleProfile = auth.status === "authenticated" && loadedOwner === owner ? profile : null;
  const displayName = visibleProfile
    ? [visibleProfile.firstName, visibleProfile.lastName].filter(Boolean).join(" ")
    : "";
  const initials = visibleProfile
    ? `${visibleProfile.firstName.charAt(0)}${visibleProfile.lastName.charAt(0)}`.toUpperCase()
    : "";
  return (
    <main id="main-content" className={styles.page}>
      <div className="container">
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>Your Wishlyn</p>
            <h1>My account</h1>
            <p className={styles.intro}>A home for your details, your orders and the pieces you love.</p>
          </div>
          <Link href="/" className={styles.shopLink}>Continue shopping <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className={styles.workspace}>
          <aside className={styles.sidebar} aria-label="Your account">
            <div className={styles.identity}>
              <span className={styles.avatar} aria-hidden="true">{initials || <UserRound size={24} strokeWidth={1.4} />}</span>
              <div>
                <p className={styles.welcome}>{displayName ? "Welcome back" : "Your personal space"}</p>
                <p className={styles.name}>{displayName || "Made for you"}</p>
              </div>
            </div>
            <nav className={styles.nav} aria-label="Account navigation">
              <Link href="/profile" aria-current="page"><UserRound size={17} aria-hidden="true" />Account details<ArrowRight size={15} aria-hidden="true" /></Link>
              <Link href="/orders"><Package size={17} aria-hidden="true" />My orders</Link>
              <Link href="/wishlist"><Heart size={17} aria-hidden="true" />Saved pieces</Link>
              <Link href="/support"><MessageCircle size={17} aria-hidden="true" />Help and requests</Link>
              {auth.user?.role === "admin" && <Link href="/admin" className={styles.adminLink}><LayoutDashboard size={17} aria-hidden="true" />Administration</Link>}
            </nav>
            {auth.status === "authenticated" && <button
              className={styles.signOut}
              disabled={busy}
              onClick={() => { void perform(async () => { await clearAuthSession(); }, "Signed out."); }}
            ><LogOut size={17} aria-hidden="true" />Sign out</button>}
            <div className={styles.helpNote}>
              <p>A little help, whenever you need it.</p>
              <Link href="/support">We’re here for you <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          </aside>
          <div className={styles.content}>
            {auth.status === "loading" ? (
              <div className={styles.state} role="status"><UserRound size={28} strokeWidth={1.3} aria-hidden="true" /><h2>Just a moment</h2><p>Verifying your account…</p></div>
            ) : auth.status === "error" ? (
              <div className={styles.state} role="alert"><ShieldCheck size={28} strokeWidth={1.3} aria-hidden="true" /><h2>Let’s reconnect</h2><p>Your account could not be verified.</p><button className={styles.primary} onClick={() => { void refreshAuthSession(true).catch(() => undefined); }}>Retry account check</button></div>
            ) : auth.status === "guest" ? (
              <div className={styles.state}><UserRound size={28} strokeWidth={1.3} aria-hidden="true" /><p className={styles.eyebrow}>A space of your own</p><h2>Welcome to Wishlyn</h2><p>Sign in to keep your details close and follow every order.</p><Link href="/login?redirect=%2Fprofile" className={styles.primary}>Sign in to manage your account <ArrowRight size={16} aria-hidden="true" /></Link></div>
            ) : loadedOwner !== owner ? (
              <div className={styles.state} role="status"><UserRound size={28} strokeWidth={1.3} aria-hidden="true" /><h2>Getting things ready</h2><p>Loading your account details…</p></div>
            ) : (
              <>
                {error && <div role="alert" className={styles.error}><p>{error}</p><button onClick={reload}>Reload account</button></div>}
                {notice && <p role="status" className={styles.notice}><Check size={17} aria-hidden="true" />{notice}</p>}
                {profile && <>
                  <nav className={styles.sectionNav} aria-label="Account details sections">
                    <a href="#profile-details">Profile</a>
                    <a href="#delivery-addresses">Addresses <span>{addresses.length}</span></a>
                    <a href="#account-security">Security</a>
                  </nav>
                  <section id="profile-details" className={styles.panel} aria-labelledby="profile-title" tabIndex={-1}>
                    <div className={styles.panelHeading}>
                      <span className={styles.sectionIcon}><UserRound size={21} strokeWidth={1.5} aria-hidden="true" /></span>
                      <div><h2 id="profile-title">Profile</h2><p>Make yourself at home. Keep your personal details up to date.</p></div>
                    </div>
                    <form className={styles.form} onSubmit={(e) => {
                      e.preventDefault();
                      void perform(async () => {
                        const data = await accountRequest<{ profile: AccountProfile }>("/api/account/profile", owner, profile);
                        if (current()) setProfile(data.profile);
                      }, "Profile saved.");
                    }}>
                      <div className={styles.fields}>
                        {(["firstName", "lastName"] as const).map((key) => <label className={styles.field} key={key} htmlFor={key}>
                          {key === "firstName" ? "First name" : "Last name"}
                          <input id={key} autoComplete={key === "firstName" ? "given-name" : "family-name"} maxLength={80} value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />
                        </label>)}
                      </div>
                      <div className={styles.email}><span>Account email</span><p>{profile.email}</p></div>
                      <div className={styles.formFooter}><p>Your details are private to your account.</p><button className={styles.primary} disabled={busy}>Save profile</button></div>
                    </form>
                  </section>
                  <section id="delivery-addresses" className={styles.panel} aria-labelledby="addresses-title" tabIndex={-1}>
                    <div className={styles.panelHeading}>
                      <span className={styles.sectionIcon}><MapPin size={21} strokeWidth={1.5} aria-hidden="true" /></span>
                      <div><h2 id="addresses-title">Saved delivery addresses <span className={styles.count}>{addresses.length}</span></h2><p>A little less typing at checkout. Delivery is available within India.</p></div>
                    </div>
                    {addresses.length === 0 ? <div className={styles.emptyAddress}><MapPin size={22} strokeWidth={1.4} aria-hidden="true" /><div><h3>No saved addresses yet</h3><p>Add your first address below, ready for your next order.</p></div></div> : <ul className={styles.addressList}>
                      {addresses.map((a) => <li className={styles.addressCard} key={a.id}>
                        <div className={styles.addressLabel}><MapPin size={15} aria-hidden="true" /><strong>{a.label}</strong></div>
                        <address>{a.firstName} {a.lastName}<br />{a.address}<br />{a.city}, {a.state} {a.zipCode}<br />{a.phone}</address>
                        <div className={styles.addressActions}>
                          <button disabled={busy} onClick={() => { setAddress(a); setNotice("Editing saved address."); addressHeading.current?.focus(); }}><Pencil size={14} aria-hidden="true" /><span>Edit <span className={styles.srOnly}>{a.label}</span></span></button>
                          <button disabled={busy} onClick={() => { void perform(async () => {
                            const data = await accountRequest<{ ownerId: string; addresses: SavedAddress[] }>("/api/account/addresses", owner, { action: "delete", id: a.id, version: a.version });
                            if (current()) {
                              setAddresses(data.addresses);
                              if (address.id === a.id) setAddress(emptyAddress);
                            }
                          }, "Address deleted."); }}><Trash2 size={14} aria-hidden="true" /><span>Delete <span className={styles.srOnly}>{a.label}</span></span></button>
                        </div>
                      </li>)}
                    </ul>}
                    <form className={`${styles.form} ${styles.addressForm}`} onSubmit={(e) => {
                      e.preventDefault();
                      void perform(async () => {
                        const data = await accountRequest<{ ownerId: string; addresses: SavedAddress[] }>("/api/account/addresses", owner, address);
                        if (current()) { setAddresses(data.addresses); setAddress(emptyAddress); }
                      }, "Address saved.");
                    }}>
                      <h3 ref={addressHeading} tabIndex={-1} className={styles.addressFormHeading}>{address.id ? <Pencil size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{address.id ? "Edit address" : "Add address"}</h3>
                      <div className={styles.fields}>
                        {([
                          { key: "label", label: "Address label", max: 60, autoComplete: "off", placeholder: "e.g. Home or work", full: true },
                          { key: "firstName", label: "Recipient first name", max: 80, autoComplete: "shipping given-name" },
                          { key: "lastName", label: "Recipient last name", max: 80, autoComplete: "shipping family-name" },
                          { key: "phone", label: "Mobile number", max: 20, autoComplete: "shipping tel" },
                          { key: "address", label: "Street address", max: 300, autoComplete: "shipping street-address", full: true },
                          { key: "city", label: "City", max: 80, autoComplete: "shipping address-level2" },
                          { key: "zipCode", label: "PIN code", max: 6, autoComplete: "shipping postal-code" },
                        ] as const).map((field) => <label className={`${styles.field} ${"full" in field ? styles.full : ""}`} key={field.key} htmlFor={`address-${field.key}`}>
                          {field.label}
                          <input id={`address-${field.key}`} required maxLength={field.max} autoComplete={field.autoComplete} placeholder={"placeholder" in field ? field.placeholder : undefined} type={field.key === "phone" ? "tel" : "text"} inputMode={field.key === "zipCode" ? "numeric" : undefined} value={address[field.key]} onChange={(e) => setAddress({ ...address, [field.key]: e.target.value })} />
                        </label>)}
                        <label className={styles.field} htmlFor="address-state">State / union territory<select id="address-state" required autoComplete="shipping address-level1" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })}><option value="">Choose a state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
                        <label className={styles.field} htmlFor="address-country">Country<input id="address-country" value="India" readOnly autoComplete="shipping country-name" /></label>
                      </div>
                      <div className={styles.actions}><button className={styles.primary} disabled={busy}>Save address</button>{address.id && <button type="button" className={styles.secondary} disabled={busy} onClick={() => setAddress(emptyAddress)}>Cancel edit</button>}</div>
                    </form>
                  </section>
                  <section id="account-security" className={styles.panel} aria-labelledby="security-title" tabIndex={-1}>
                    <div className={styles.panelHeading}>
                      <span className={styles.sectionIcon}><ShieldCheck size={21} strokeWidth={1.5} aria-hidden="true" /></span>
                      <div><h2 id="security-title">Account security</h2><p>Keep your account yours with a password only you know.</p></div>
                    </div>
                    <form className={styles.form} onSubmit={(e) => {
                      e.preventDefault();
                      void perform(async () => {
                        await accountRequest("/api/account/password", owner, password);
                        if (current()) { setPassword({ currentPassword: "", newPassword: "" }); await refreshAuthSession(true); }
                      }, "Password changed. Sign in again.");
                    }}>
                      <div className={styles.fields}>
                        <label className={styles.field} htmlFor="current-password">Current password<input id="current-password" type="password" autoComplete="current-password" required maxLength={1024} value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} /></label>
                        <label className={styles.field} htmlFor="new-password">New password<input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="password-guidance" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} /></label>
                      </div>
                      <p className={styles.meta} id="password-guidance">Use at least 8 characters. Changing your password signs you out on all devices.</p>
                      <div className={styles.formFooter}><Link href="/forgot-password" className={styles.textLink}>Password recovery <ArrowUpRight size={14} aria-hidden="true" /></Link><button className={styles.primary} disabled={busy}>Change password</button></div>
                    </form>
                  </section>
                </>}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
