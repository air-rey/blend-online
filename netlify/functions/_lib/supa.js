// Supabase client singleton. We only ever use the service_role key from the
// server side (never shipped to the browser), and all table access goes
// through this module so the key is centralised.
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function supa () {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'blendxr-deal-room' } }
  });
  return _client;
}

module.exports = { supa };
