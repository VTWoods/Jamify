import { z } from "zod";

const serverEnvSchema = z.object({
  APP_URL: z.string().url().default("http://127.0.0.1:3000"),
  DATABASE_PATH: z.string().min(1).default("./data/jamify.db"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  SPOTIFY_CLIENT_ID: z.string().min(1).optional(),
  SPOTIFY_CLIENT_SECRET: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  ALLOWED_SPOTIFY_USER_IDS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}

export function getAllowedSpotifyUserIds(): string[] {
  const raw = process.env.ALLOWED_SPOTIFY_USER_IDS ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
