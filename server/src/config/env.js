const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Sarvam's /speech-to-text endpoint rejects any model outside this enum with a
// 400 invalid_request_error. A stale deployment value (the old docs shipped
// `saaras:v2`, which is not accepted) made every live STT call fail and silently
// fall back to Groq Whisper, which misheard Telugu callers. Normalising once at
// boot fixes existing deployments without touching their environment variables.
const SARVAM_STT_MODELS = new Set([
  'saarika:v2.5',
  'saaras:v3',
  'saaras:v3-realtime',
  'saaras:v4',
  'saaras-multispeaker',
  'saaras:v4-multispk',
  'saarika:v1',
  'saarika:v2',
  'saarika:flash',
]);

// Older names that are safe to map onto a currently accepted model.
const SARVAM_STT_ALIASES = {
  'saaras': 'saaras:v3',
  'saaras:v1': 'saaras:v3',
  'saaras:v2': 'saaras:v3',
  'saarika': 'saarika:v2.5',
};

function resolveSarvamSttModel() {
  const raw = String(process.env.SARVAM_STT_MODEL || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
  const normalized = SARVAM_STT_ALIASES[raw.toLowerCase()] || raw.toLowerCase();
  if (normalized && SARVAM_STT_MODELS.has(normalized)) return normalized;
  if (raw) {
    console.warn(`[config] SARVAM_STT_MODEL="${raw}" is not a valid Sarvam STT model; using saaras:v3 instead.`);
  }
  return 'saaras:v3';
}

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  mockMode: (process.env.MOCK_MODE || 'true') === 'true',

  mysql: {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'ai_calling_platform',
  },

  redisUrl: process.env.REDIS_URL || '',

  telephonyProvider: process.env.TELEPHONY_PROVIDER || 'twilio',

  providers: {
    vobiz: {
      authId: process.env.VOBIZ_AUTH_ID || process.env.VOBIZ_ACCOUNT_ID || '',
      authToken: process.env.VOBIZ_AUTH_TOKEN || '',
      accountId: process.env.VOBIZ_ACCOUNT_ID || '',
      baseUrl: process.env.VOBIZ_BASE_URL || 'https://api.vobiz.ai/api/v1',
      webhookSecret: process.env.VOBIZ_WEBHOOK_SECRET || '',
      // No default: a real credential must never be committed as a fallback.
      consoleEmail: process.env.VOBIZ_CONSOLE_EMAIL || '',
      consolePassword: process.env.VOBIZ_CONSOLE_PASSWORD || '',
      phoneNumber: process.env.VOBIZ_PHONE_NUMBER || '+918065354620',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      apiKey: process.env.TWILIO_API_KEY || '',
      apiSecret: process.env.TWILIO_API_SECRET || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    },
    livekit: {
      url: process.env.LIVEKIT_URL || '',
      apiKey: process.env.LIVEKIT_API_KEY || '',
      apiSecret: process.env.LIVEKIT_API_SECRET || '',
    },
    cartesia: {
      apiKey: process.env.CARTESIA_API_KEY || '',
      model: process.env.CARTESIA_MODEL || 'sonic-3.6',
      voiceId: process.env.CARTESIA_VOICE_ID || 'ca5e2caa-ba47-4096-91dd-dafc99d9086f',
    },
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    deepgram: {
      apiKey: process.env.DEEPGRAM_API_KEY || '',
      model: process.env.DEEPGRAM_STT_MODEL || 'nova-3',
    },
    sarvam: {
      apiKey: process.env.SARVAM_API_KEY || '',
      model: process.env.SARVAM_MODEL || 'bulbul:v3',
      sttModel: resolveSarvamSttModel(),
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    },
    llm: {
      apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL || (process.env.GROQ_API_KEY ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'),
      model: process.env.LLM_MODEL || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.6'),
    },
    payment: {
      provider: process.env.PAYMENT_PROVIDER || 'razorpay',
      keyId: process.env.PAYMENT_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
      secret: process.env.PAYMENT_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Telugu AI Calling <no-reply@example.com>',
  },
};