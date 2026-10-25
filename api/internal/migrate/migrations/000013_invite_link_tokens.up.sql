-- Invite links can be copied again until they're used, revoked or expire.
-- The token is kept encrypted (AES-GCM, key from JWT_SECRET), so the database
-- alone never gives away a working link. Older links have no copy: null.
alter table invite_links add column token_enc bytea;
