import { z } from "zod";

const configSchema = z.object({
  // Server Configuration
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().default("./data/app.db"),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  BOT_USERNAME: z.string().min(1, "BOT_USERNAME is required"),

  // LLM (Anthropic Claude)
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // ElevenLabs TTS
  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY is required"),
  HIDE_AUDIO_PLAYER: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  // Authentication & Session
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_MAX_AGE_DAYS: z.coerce.number().default(180),

  // Cache Configuration
  CACHE_DIR: z.string().default("./cache/articles"),
  CACHE_MAX_AGE_DAYS: z.coerce.number().default(30),

  // Admin Access
  ADMIN_TELEGRAM_ID: z.string().optional(),

  // Processing Configuration
  PROCESSING_TIMEOUT_SECONDS: z.coerce.number().default(60),
  MAX_RETRY_ATTEMPTS: z.coerce.number().default(3),
  RETRY_DELAY_MINUTES: z.coerce.number().default(5),
  LONG_MESSAGE_THRESHOLD: z.coerce.number().default(1000),
});

// Parse and validate environment variables on module import
const parseResult = configSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error("Invalid environment variables:");
  console.error(z.treeifyError(parseResult.error));
  process.exit(1);
}

export const config = parseResult.data;

// Export type for use in other modules
export type Config = z.infer<typeof configSchema>;
