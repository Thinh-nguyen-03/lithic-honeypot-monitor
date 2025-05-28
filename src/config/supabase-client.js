import { createClient } from '@supabase/supabase-js';
import { config } from './index.js';

export const supabase_client = createClient(
  config.supabase.url,
  config.supabase.serviceKey
);