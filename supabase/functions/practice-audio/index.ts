// practice-audio: short-lived signed links to the practice MP3s in Cloudflare R2.
//   { action: 'urls', song_id }                    -> signed GET links (any linked member)
//   { action: 'upload', song_id, element, bytes }  -> signed PUT link (admin only)
// R2 keys live only in this function's secrets (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY); the browser never sees them.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'tsp-practice';
const ALLOWED_ORIGINS = ['https://aaronmark2222.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const ELEMENT_RE = /^(?:(?:Stem|Part) - [A-Za-z][A-Za-z ]{0,29}|Backing|CPC|Mixdown)$/;
const SONG_RE = /^[A-Z]{1,4}\d{1,3}$/;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
async function hmac(key: ArrayBuffer | Uint8Array, text: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(text));
}
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// AWS Signature V4 query-string presign (S3-compatible; R2 region is "auto").
async function presign(method: 'GET' | 'PUT', key: string, expires: number, extra: Record<string, string> = {}) {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const akid = Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!account || !akid || !secret) throw new Error('r2_not_configured');
  const host = `${account}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = '/' + [BUCKET, ...key.split('/')].map(rfc3986).join('/');
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${akid}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    ...extra,
  };
  const query = Object.keys(params).sort().map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`).join('&');
  const canonical = [method, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let k = await hmac(enc.encode('AWS4' + secret), day);
  k = await hmac(k, 'auto');
  k = await hmac(k, 's3');
  k = await hmac(k, 'aws4_request');
  const signature = hex(await hmac(k, toSign));
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  try {
    const auth = req.headers.get('Authorization') || '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: memberId } = await db.rpc('current_member_id');
    if (!memberId) return reply(403, { ok: false, error: 'not_a_member' });
    const body = await req.json().catch(() => ({}));
    const songId = String(body.song_id || '');
    if (!SONG_RE.test(songId)) return reply(400, { ok: false, error: 'bad_song_id' });

    if (body.action === 'urls') {
      // RLS on practice_tracks decides what this member may see.
      const { data, error } = await db.from('practice_tracks').select('element, object_key, bytes, uploaded_at').eq('song_id', songId);
      if (error) return reply(500, { ok: false, error: 'db_error' });
      const tracks = await Promise.all((data || []).map(async (row) => ({
        element: row.element, bytes: row.bytes, uploaded_at: row.uploaded_at,
        url: await presign('GET', row.object_key, 3 * 3600),
        // Same file, but the browser saves it instead of playing it.
        download: await presign('GET', row.object_key, 3 * 3600, {
          'response-content-disposition': `attachment; filename="${songId} - ${row.element}.mp3"`,
        }),
      })));
      return reply(200, { ok: true, tracks });
    }

    if (body.action === 'upload') {
      const { data: isAdmin } = await db.rpc('is_admin');
      if (!isAdmin) return reply(403, { ok: false, error: 'admin_only' });
      const element = String(body.element || '');
      if (!ELEMENT_RE.test(element)) return reply(400, { ok: false, error: 'bad_element' });
      const bytes = Number(body.bytes || 0);
      if (!(bytes > 0 && bytes < 60 * 1024 * 1024)) return reply(400, { ok: false, error: 'bad_size' });
      const objectKey = `songs/${songId}/${slug(element)}.mp3`;
      return reply(200, { ok: true, object_key: objectKey, url: await presign('PUT', objectKey, 900) });
    }
    return reply(400, { ok: false, error: 'unknown_action' });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return reply(msg === 'r2_not_configured' ? 503 : 500, { ok: false, error: msg === 'r2_not_configured' ? msg : 'server_error' });
  }
});
