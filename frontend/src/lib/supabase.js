import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://ojyqihiobrhdnghlzalq.supabase.co";
const publishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_URybM4wCEj5ILOaQUz1FvQ_7xHclQH3";

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
