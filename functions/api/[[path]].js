// REST API: documents (D1), files (KV), AI reading of documents (Anthropic).
// Authentication is enforced by functions/_middleware.js before this runs.

const COLS = new Set(['offers', 'clients', 'payments', 'registru', 'settings', 'cu', 'cereri', 'cheltuieli']);
const MAX_FILE = 20 * 1024 * 1024;
const MODEL = 'claude-sonnet-5-5';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const err = (msg, status = 400) => json({ error: msg }, status);
const okId = (s) => typeof s === 'string' && /^[A-Za-z0-9_\-.:@+~]{1,120}$/.test(s);

import { Buffer } from 'node:buffer';

function toB64(buf) {
  try { return Buffer.from(buf).toString('base64'); } catch (e) { /* fallback mai jos */ }
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function ai(env, prompt, parts) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Lipsește cheia ANTHROPIC_API_KEY în setările Cloudflare.');
  const content = [];
  for (const p of parts) {
    if (p.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data } });
    else if (/^image\/(jpeg|png|gif|webp)$/.test(p.type)) content.push({ type: 'image', source: { type: 'base64', media_type: p.type, data: p.data } });
  }
  content.push({ type: 'text', text: prompt + '\n\nRăspunde DOAR cu obiectul JSON, fără alt text.' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Anthropic: ' + (j.error?.message || r.status));
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Răspuns fără JSON');
  return JSON.parse(text.slice(a, b + 1));
}

let ensured = false;
async function ensure(db) {
  if (ensured) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (col, id))').run();
  ensured = true;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const seg = (params.path || []).map(decodeURIComponent);
  const method = request.method;
  // Mutations must come from our own page (custom header ⇒ cross-site forms cannot send it).
  if (method !== 'GET' && request.headers.get('x-crm') !== '1') return err('Cerere refuzată', 403);
  const db = env.DB;
  try {
    await ensure(db);
    if (seg[0] === 'me') return json({ email: ctx.data.user?.email || '', aud: ctx.data.user?.aud || '', audPinned: !!env.ACCESS_AUD });

    // ---- documents
    if (seg[0] === 'c') {
      const col = seg[1], id = seg[2];
      if (!COLS.has(col)) return err('Colecție necunoscută', 404);
      if (method === 'GET' && !id) {
        const { results } = await db.prepare('SELECT id, data FROM docs WHERE col = ?1').bind(col).all();
        return json(results.map((r) => ({ ...JSON.parse(r.data), id: r.id })));
      }
      if (!okId(id)) return err('Id invalid');
      if (method === 'GET') {
        const r = await db.prepare('SELECT data FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).first();
        return r ? json({ ...JSON.parse(r.data), id }) : err('Nu există', 404);
      }
      if (method === 'PUT') {
        const body = await request.text();
        if (body.length > 900_000) return err('Document prea mare', 413);
        const data = JSON.parse(body); delete data.id;
        await db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated = excluded.updated')
          .bind(col, id, JSON.stringify(data), Date.now()).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await db.prepare('DELETE FROM docs WHERE col = ?1 AND id = ?2').bind(col, id).run();
        return json({ ok: true });
      }
      return err('Metodă nepermisă', 405);
    }

    // ---- bulk import (backup JSON from the earlier version or from export)
    if (seg[0] === 'import' && method === 'POST') {
      const body = await request.json();
      const stmts = [];
      const now = Date.now();
      for (const [col, list] of Object.entries(body)) {
        if (!COLS.has(col) || !Array.isArray(list)) continue;
        for (const d of list) {
          if (!d || !okId(d.id)) continue;
          const { id, ...rest } = d;
          stmts.push(db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(col, id, JSON.stringify(rest), now));
        }
      }
      for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
      return json({ ok: true, count: stmts.length });
    }
    if (seg[0] === 'export' && method === 'GET') {
      const { results } = await db.prepare('SELECT col, id, data FROM docs').all();
      const out = {};
      for (const r of results) (out[r.col] = out[r.col] || []).push({ ...JSON.parse(r.data), id: r.id });
      return json(out);
    }

    // ---- files (KV)
    if (seg[0] === 'files') {
      const kv = env.FILES;
      if (method === 'POST' && !seg[1]) {
        const form = await request.formData();
        const f = form.get('file');
        if (!f || typeof f === 'string') return err('Lipsește fișierul');
        if (f.size > MAX_FILE) return err('Fișier mai mare de 20 MB', 413);
        const key = 'f_' + Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
        await kv.put(key, await f.arrayBuffer(), { metadata: { name: f.name, type: f.type || 'application/octet-stream', size: f.size, at: Date.now() } });
        return json({ key, name: f.name, type: f.type, size: f.size });
      }
      const key = seg[1];
      if (!okId(key)) return err('Id invalid');
      if (method === 'GET') {
        const { value, metadata } = await kv.getWithMetadata(key, { type: 'arrayBuffer' });
        if (!value) return err('Nu există', 404);
        const name = (metadata?.name || key).replace(/["\r\n]/g, '');
        return new Response(value, { headers: { 'content-type': metadata?.type || 'application/octet-stream', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`, 'cache-control': 'private, max-age=3600' } });
      }
      if (method === 'DELETE') { await kv.delete(key); return json({ ok: true }); }
      return err('Metodă nepermisă', 405);
    }

    // ---- AI reading of documents
    if (seg[0] === 'ai' && method === 'POST') {
      const body = await request.json();
      const parts = [];
      for (const k of body.fileKeys || []) {
        if (!okId(k)) continue;
        const { value, metadata } = await env.FILES.getWithMetadata(k, { type: 'arrayBuffer' });
        if (value) parts.push({ type: metadata?.type || 'application/pdf', data: toB64(value) });
      }
      for (const p of body.inline || []) if (p && p.data && p.type) parts.push(p);
      if (!parts.length) return err('Niciun document de citit');
      const result = await ai(env, String(body.prompt || ''), parts.slice(0, 6));
      return json(result);
    }

    return err('Rută necunoscută', 404);
  } catch (e) {
    return err(e.message || String(e), 500);
  }
}
