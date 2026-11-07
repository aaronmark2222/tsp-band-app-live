// practice-audio: short-lived signed links to the practice MP3s in Cloudflare R2.
// The bucket itself is the list of what exists (songs/<SONG ID>/<element-slug>.mp3).
//   { action: 'list' }                             -> which songs have which files (members)
//   { action: 'urls', song_id }                    -> signed GET links for a song (members)
//   { action: 'upload', song_id, element, bytes }  -> signed PUT link (admin)
//   { action: 'upload_batch', song_ids }           -> 24 h PUT + DELETE links per song and
//                                                     element, for TSPWork's overnight export (admin)
// R2 keys live only in this function's secrets (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY); the browser never sees them.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'tsp-practice';
const ALLOWED_ORIGINS = ['https://aaronmark2222.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const ELEMENT_RE = /^(?:(?:Stem|Part) - [A-Za-z][A-Za-z ]{0,29}|Backing|CPC|Mixdown)$/;
const SONG_RE = /^[A-Z]{1,4}\d{1,3}$/;
const ELEMENTS = ['Mixdown', 'Backing', 'CPC',
  'Part - Bass', 'Part - Keyboard', 'Part - Guitar', 'Part - Violin', 'Part - Percussion', 'Part - Drums', 'Part - Dale Vox', 'Part - Anston Vox',
  'Stem - Bass', 'Stem - Drums', 'Stem - Other', 'Stem - Vocals'];

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
async function presign(method: 'GET' | 'PUT' | 'DELETE', key: string | null, expires: number, extra: Record<string, string> = {}) {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const akid = Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!account || !akid || !secret) throw new Error('r2_not_configured');
  const host = `${account}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = '/' + (key === null ? [BUCKET] : [BUCKET, ...key.split('/')]).map(rfc3986).join('/');
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
const BY_SLUG = new Map(ELEMENTS.map((e) => [slug(e), e]));

// ListObjectsV2 through a presigned GET; returns [{key, size}].
async function listObjects(prefix: string) {
  const out: { key: string; size: number; modified: string }[] = [];
  let token = '';
  for (let page = 0; page < 20; page += 1) {
    const params: Record<string, string> = { 'list-type': '2', prefix, 'max-keys': '1000' };
    if (token) params['continuation-token'] = token;
    const res = await fetch(await presign('GET', null, 300, params));
    if (!res.ok) throw new Error(`r2_list_${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] || '';
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0);
      const modified = /<LastModified>([^<]*)<\/LastModified>/.exec(m[1])?.[1] || '';
      out.push({ key: key.replace(/&amp;/g, '&'), size, modified });
    }
    token = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] || '';
    if (!token) break;
  }
  return out;
}

// Files are songs/<ID>/<slug>.m4a (AAC 128 kbps, what TSPWork uploads) or
// .mp3 (older / manual uploads). One file per song and element: an .m4a wins.
function parseKey(key: string) {
  const m = /^songs\/([A-Z]{1,4}\d{1,3})\/([a-z0-9-]+)\.(mp3|m4a)$/.exec(key);
  if (!m || !BY_SLUG.has(m[2])) return null;
  return { songId: m[1], element: BY_SLUG.get(m[2])!, ext: m[3] };
}
function dedupe<T extends { key: string }>(objs: T[]) {
  const best = new Map<string, T & { parsed: NonNullable<ReturnType<typeof parseKey>> }>();
  for (const obj of objs) {
    const parsed = parseKey(obj.key);
    if (!parsed) continue;
    const id = `${parsed.songId}|${parsed.element}`;
    const prev = best.get(id);
    if (!prev || (prev.parsed.ext === 'mp3' && parsed.ext === 'm4a')) best.set(id, { ...obj, parsed });
  }
  return [...best.values()];
}

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

    if (body.action === 'list') {
      const all = await listObjects('songs/');
      const songs: Record<string, { element: string; bytes: number; modified: string; ext: string }[]> = {};
      for (const obj of dedupe(all)) {
        (songs[obj.parsed.songId] ||= []).push({ element: obj.parsed.element, bytes: obj.size, modified: obj.modified, ext: obj.parsed.ext });
      }
      // Storage actually used in the bucket (everything, duplicates included).
      const totalBytes = all.reduce((sum, obj) => sum + obj.size, 0);
      return reply(200, { ok: true, songs, total_bytes: totalBytes, objects: all.length });
    }

    if (body.action === 'upload_batch') {
      const { data: isAdmin } = await db.rpc('is_admin');
      if (!isAdmin) return reply(403, { ok: false, error: 'admin_only' });
      const ids = (Array.isArray(body.song_ids) ? body.song_ids : []).map(String).filter((id: string) => SONG_RE.test(id)).slice(0, 100);
      // TSPWork uploads AAC (.m4a): put = the new file, del = its .m4a (for
      // elements a song no longer has), del_old = any older .mp3 copy, so the
      // bucket never holds two files for one track.
      const urls: Record<string, Record<string, { put: string; del: string; del_old: string }>> = {};
      for (const id of ids) {
        urls[id] = {};
        for (const element of ELEMENTS) {
          const base = `songs/${id}/${slug(element)}`;
          urls[id][element] = {
            put: await presign('PUT', `${base}.m4a`, 86400),
            del: await presign('DELETE', `${base}.m4a`, 86400),
            del_old: await presign('DELETE', `${base}.mp3`, 86400),
          };
        }
      }
      return reply(200, { ok: true, urls });
    }

    const songId = String(body.song_id || '');
    if (!SONG_RE.test(songId)) return reply(400, { ok: false, error: 'bad_song_id' });

    if (body.action === 'urls') {
      const objects = dedupe(await listObjects(`songs/${songId}/`));
      const tracks = await Promise.all(objects.map(async (obj) => ({
        element: obj.parsed.element, bytes: obj.size, uploaded_at: obj.modified, ext: obj.parsed.ext,
        url: await presign('GET', obj.key, 3 * 3600),
        // Same file, but the browser saves it instead of playing it.
        download: await presign('GET', obj.key, 3 * 3600, {
          'response-content-disposition': `attachment; filename="${songId} - ${obj.parsed.element}.${obj.parsed.ext}"`,
        }),
      })));
      return reply(200, { ok: true, tracks });
    }

    if (body.action === 'upload') {
      const { data: isAdmin } = await db.rpc('is_admin');
      if (!isAdmin) return reply(403, { ok: false, error: 'admin_only' });
      const element = String(body.element || '');
      if (!ELEMENT_RE.test(element) || !BY_SLUG.has(slug(element))) return reply(400, { ok: false, error: 'bad_element' });
      const bytes = Number(body.bytes || 0);
      if (!(bytes > 0 && bytes < 60 * 1024 * 1024)) return reply(400, { ok: false, error: 'bad_size' });
      const objectKey = `songs/${songId}/${slug(element)}.mp3`;
      // A manual upload replaces any AAC copy of the same track (no duplicates).
      await fetch(await presign('DELETE', `songs/${songId}/${slug(element)}.m4a`, 300), { method: 'DELETE' }).catch(() => {});
      return reply(200, { ok: true, object_key: objectKey, url: await presign('PUT', objectKey, 900) });
    }
    return reply(400, { ok: false, error: 'unknown_action' });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return reply(msg === 'r2_not_configured' ? 503 : 500, { ok: false, error: msg === 'r2_not_configured' || msg.startsWith('r2_list') ? msg : 'server_error' });
  }
});
