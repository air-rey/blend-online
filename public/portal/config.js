// Client portal config. Everything here is public by design: the project
// URL and the publishable key ship to every browser, and all data access is
// enforced by RLS on the signed-in user. No service role key, no code logic.
window.BLENDXR_PORTAL_CONFIG = {
  supabaseUrl:    'https://sgzltnhmxywjslvjwaif.supabase.co',
  publishableKey: '',              // sb_publishable_... (set before running)
  loginPath:      '/functions/v1/portal-login',
  defaultSession: 'vc-T02',        // first session page: tenant BlendXR demo
  labelsView:     'client_labels'  // read; writes go through set/reset_tenant_label
};
