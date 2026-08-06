import { PrismaClient } from "../generated/prisma/client";

declare global {
  // allow global `var prisma` in dev (prevents hot-reload spawning new clients)
  var prisma: PrismaClient | undefined;
}

// Re-export PrismaClient type for convenience
export type { PrismaClient };

// Dynamically select the right adapter based on DATABASE_URL.
// SQLite → PrismaLibSql (local dev)
// Postgres → PrismaPg (production)
function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";

  if (dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: dbUrl });
    return new PrismaClient({ adapter, log: ["query"] } as never);
  }

  // Default: SQLite (local development)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaLibSql } = require("@prisma/adapter-libsql");
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter, log: ["query"] } as never);
}

export const prisma =
  global.prisma ||
  (() => {
    try {
      return createPrismaClient();
    } catch (e) {
      console.error("Failed to create Prisma client:", e);
      throw e;
    }
  })();

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
