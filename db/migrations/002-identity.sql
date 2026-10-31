-- ECMAScript String.trim whitespace, explicitly shared with normalizeEmail.
-- ASCII-only identity text makes lowercasing independent of database locale.
CREATE FUNCTION canonical_profile_email(value TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C")
$$;
CREATE FUNCTION valid_profile_email(value TEXT) RETURNS BOOLEAN
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value = canonical_profile_email(value)
    AND octet_length(value) = length(value) AND value ~ '^[!-~]+$' AND length(value) BETWEEN 3 AND 254
    AND length(split_part(value, '@', 1)) BETWEEN 1 AND 64
    AND split_part(value, '@', 1) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+$'
    AND left(split_part(value, '@', 1), 1) <> '.'
    AND right(split_part(value, '@', 1), 1) <> '.'
    AND position('..' in split_part(value, '@', 1)) = 0
    AND split_part(value, '@', 2) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    AND length(value) - length(replace(value, '@', '')) = 1
$$;
-- Abort before changing identity data if canonical collisions/invalid accounts exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM profiles GROUP BY canonical_profile_email(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Canonical email collisions require operator resolution before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE NOT valid_profile_email(canonical_profile_email(email))) THEN
    RAISE EXCEPTION 'Invalid profile emails require operator resolution before migration';
  END IF;
END $$;
UPDATE profiles SET email = canonical_profile_email(email) WHERE email <> canonical_profile_email(email);
CREATE UNIQUE INDEX profiles_canonical_email ON profiles (canonical_profile_email(email));
ALTER TABLE profiles ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0);
ALTER TABLE profiles ADD CONSTRAINT profile_email_canonical CHECK (valid_profile_email(email));
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
