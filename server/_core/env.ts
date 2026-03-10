// Validate critical secrets at startup
function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${name} must be set (min ${minLength} chars)`);
    }
    console.warn(`[ENV] WARNING: ${name} is not set or too short`);
    return value ?? "";
  }
  return value;
}

export const ENV = {
  // Auth
  cookieSecret: requireEnv("JWT_SECRET", 32),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // LLM
  llmApiUrl: process.env.LLM_API_URL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gemini-2.5-flash",

  // LINE
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",

  // Runtime
  isProduction: process.env.NODE_ENV === "production",
};
