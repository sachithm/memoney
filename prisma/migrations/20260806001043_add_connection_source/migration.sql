-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "linkUri" TEXT,
    "connectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastAuthorizedAt" DATETIME,
    "scopes" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TRUELAYER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Connection" ("connectionId", "createdAt", "id", "lastAuthorizedAt", "linkUri", "providerId", "scopes", "status", "updatedAt") SELECT "connectionId", "createdAt", "id", "lastAuthorizedAt", "linkUri", "providerId", "scopes", "status", "updatedAt" FROM "Connection";
DROP TABLE "Connection";
ALTER TABLE "new_Connection" RENAME TO "Connection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
