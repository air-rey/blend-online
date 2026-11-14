#!/usr/bin/env node
// Upload the Volga private content to Supabase Storage.
//
// Reads two env vars:
//   SUPABASE_URL                 e.g. https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service_role (NOT the publishable key)
//
// Walks the local trees:
//   private-content/volga-test-scene/media/*         -> bucket `media`,     path `volga-test-scene/<filename>`
//   private-downloads/volga-test-scene/*             -> bucket `downloads`, path `volga-test-scene/<filename>`
//
// Idempotent: `upsert: true` on each put. Run from the repo root:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-content.js

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  console.error('Example:');
  console.error('  SUPABASE_URL=https://xxxx.supabase.co \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ... \\');
  console.error('  node scripts/upload-content.js');
  process.exit(2);
}

const db = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const EXT_TO_TYPE = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.zip':  'application/zip',
  '.pdf':  'application/pdf',
  '.md':   'text/markdown',
  '.json': 'application/json'
};

function contentType (filename) {
  return EXT_TO_TYPE[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function uploadDir (localDir, bucket, remotePrefix) {
  if (!fs.existsSync(localDir)) {
    console.log(`skip ${localDir} (not present)`);
    return;
  }
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const localPath  = path.join(localDir, e.name);
    const remotePath = `${remotePrefix}/${e.name}`;
    const buf  = fs.readFileSync(localPath);
    const type = contentType(e.name);
    process.stdout.write(`uploading ${bucket}/${remotePath}  (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${type}) ... `);
    const { error } = await db.storage.from(bucket).upload(remotePath, buf, {
      contentType: type, upsert: true
    });
    if (error) {
      console.error('FAIL');
      console.error('  ', error.message || error);
      process.exitCode = 1;
    } else {
      console.log('OK');
    }
  }
}

(async () => {
  const root = path.resolve(__dirname, '..');

  // Volga section kept at its historical `volga-test-scene/` remote
  // prefix for reference. In practice Volga's live objects sit at the
  // ROOT of each bucket (the serving code in media.js / download-url.js
  // uses an empty prefix for the Volga slug), so running this section
  // today would upload to a parallel `volga-test-scene/` folder the
  // serving code wouldn't read. Not touched here because the instruction
  // is to leave Volga's folders alone.
  await uploadDir(
    path.join(root, 'private-content', 'volga-test-scene', 'media'),
    'media', 'volga-test-scene'
  );
  await uploadDir(
    path.join(root, 'private-downloads', 'volga-test-scene'),
    'downloads', 'volga-test-scene'
  );

  // ApexDream (and any further resource) lives under <slug>/ in the
  // bucket. media.js and download-url.js resolve the per-resource
  // storage prefix via netlify/functions/_lib/resources.js.
  await uploadDir(
    path.join(root, 'private-content', 'apexdream-confined-space', 'media'),
    'media', 'apexdream-confined-space'
  );
  await uploadDir(
    path.join(root, 'private-downloads', 'apexdream-confined-space'),
    'downloads', 'apexdream-confined-space'
  );

  if (process.exitCode) {
    console.error('\nOne or more uploads failed. See messages above.');
  } else {
    console.log('\nAll uploads OK.');
  }
})();
