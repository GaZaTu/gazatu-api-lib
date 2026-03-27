-- BEGIN UserRole --
CREATE TABLE "UserRole" (
  "id" VARCHAR(26) NOT NULL,
  "name" VARCHAR(256) NOT NULL,
  "description" VARCHAR(512),
  UNIQUE ("name"),
  PRIMARY KEY ("id")
);
-- END UserRole --

-- BEGIN User --
CREATE TABLE "User" (
  "id" VARCHAR(26) NOT NULL,
  "username" VARCHAR(256) NOT NULL,
  "password" VARCHAR(256),
  "email" VARCHAR(256),
  "activated" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE ("username"),
  UNIQUE ("email"),
  PRIMARY KEY ("id")
);

SELECT __create_timestamp_trigger('User', 'updatedAt');
-- END User --

SELECT __create_n2m_table('User', 'UserRole');

-- BEGIN UserPasswordResetRequest --
CREATE TABLE "UserPasswordResetRequest" (
  "id" VARCHAR(26) NOT NULL,
  "userId" VARCHAR(26) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE ("userId"),
  PRIMARY KEY ("id")
);

SELECT __create_index('UserPasswordResetRequest', 'userId');
-- END UserPasswordResetRequest --

SELECT __create_auditlog_table();
