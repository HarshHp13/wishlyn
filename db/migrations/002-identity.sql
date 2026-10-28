-- Abort the transaction before changing identity data if case/space collisions exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM profiles GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Canonical email collisions require operator resolution before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE length(btrim(email)) = 0 OR length(btrim(email)) > 254) THEN
    RAISE EXCEPTION 'Invalid profile emails require operator resolution before migration';
  END IF;
END $$;
UPDATE profiles SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));
CREATE UNIQUE INDEX profiles_canonical_email ON profiles (lower(btrim(email)));
ALTER TABLE profiles ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0);
ALTER TABLE profiles ADD CONSTRAINT profile_email_canonical CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254);
CREATE TABLE auth_sessions (
  token_hash CHAR(64) PRIMARY KEY, profile_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_version INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_profile ON auth_sessions(profile_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE FUNCTION invalidate_profile_sessions() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_profile_sessions BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION invalidate_profile_sessions();
CREATE TABLE request_budgets (key CHAR(64) PRIMARY KEY, count INTEGER NOT NULL CHECK (count > 0), expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX request_budgets_expiry ON request_budgets(expires_at);
