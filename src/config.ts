import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

export type APIConfig = {
  fileserverHits: number;
  port: number;
  platform: string;
};

export type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

function envOrThrow(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }

  return value;
}

const migrationConfig: MigrationConfig = {
  migrationsFolder: "./src/db/migrations",
};

export const config = {
  api: {
    fileserverHits: 0,
    port: Number(envOrThrow("PORT")),
    platform: envOrThrow("PLATFORM"),
  } satisfies APIConfig,

  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig,
  } satisfies DBConfig,
};
