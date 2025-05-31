import 'dotenv/config';

export const config = {
  lithic: {
    apiKey: process.env.LITHIC_API_KEY,
    environment: process.env.LITHIC_ENV || 'sandbox',
    webhookSecret: process.env.LITHIC_WEBHOOK_SECRET,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};