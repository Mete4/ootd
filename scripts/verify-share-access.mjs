// Tests who can read and change a share link with the public key: a stranger,
// a friend who has the token, and the owner who has the secret.
// Usage: node scripts/verify-share-access.mjs  (all rules closed, the normal case)
// Makes a test link that expires in 1 day; the daily cleanup deletes it. The
// token and secret stay in tmp/share-access-test.json, so a second run reuses
// the link. Delete that file to make a new link.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL_BASE = 'https://zcipgvyhzttxhyytczbv.supabase.co';
const KEY = 'sb_publishable_dc_NntGPiAUiQpROowHGww_7c9mzhHe';
const phase = process.argv[2] ?? 'after';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const statePath = 'tmp/share-access-test.json';

const rpc = async (name, body) => {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.text() };
};
const check = (label, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);

let state;
if (existsSync(statePath)) state = JSON.parse(readFileSync(statePath, 'utf8'));
else {
  const made = await rpc('create_share', { p_scope: 'full', p_ttl_days: 1 });
  const [{ out_token, out_secret }] = JSON.parse(made.body);
  state = { token: out_token, secret: out_secret };
  writeFileSync(statePath, JSON.stringify(state));
  await rpc('save_share', {
    p_token: out_token, p_secret: out_secret,
    p_items: [{ id: 'a', itemNumber: 7, hierarchyCategory: 'Tops' }], p_outfits: [], p_scope: null, p_ttl_days: null,
  });
  await fetch(`${URL_BASE}/rest/v1/suggestions`, {
    method: 'POST', headers, body: JSON.stringify({ closet_token: out_token, suggested_by: 'test', item_ids: ['a'] }),
  });
}
const { token, secret } = state;
console.log(`phase=${phase} token=${token}`);

// A stranger with the token: the viewer path.
const closet = await rpc('get_shared_closet', { p_token: token });
check('viewer reads closet by token', closet.status === 200 && /"itemNumber": ?7/.test(closet.body), closet.body.slice(0, 80));
check('closet result has no secret hash', !closet.body.includes('owner_secret_hash'));
const wrong = await rpc('get_shared_closet', { p_token: 'nope' });
check('unknown token gives nothing', wrong.body === '[]', wrong.body);

// The owner.
const list = await rpc('list_suggestions', { p_token: token, p_secret: secret });
check('owner lists suggestions', list.status === 200 && list.body.includes('"suggested_by":"test"'), list.body.slice(0, 80));
const count = await rpc('count_suggestions', { p_token: token, p_secret: secret, p_since: null });
check('owner count equals the list length', count.body === String(JSON.parse(list.body).length), count.body);
const countSince = await rpc('count_suggestions', { p_token: token, p_secret: secret, p_since: new Date(Date.now() + 60000).toISOString() });
check('count after a later time is 0', countSince.body === '0', countSince.body);

// A stranger with the token but a wrong secret.
const badList = await rpc('list_suggestions', { p_token: token, p_secret: 'x'.repeat(64) });
check('wrong secret cannot list suggestions', badList.status >= 400, `${badList.status}`);
const badCount = await rpc('count_suggestions', { p_token: token, p_secret: 'x'.repeat(64), p_since: null });
check('wrong secret cannot count suggestions', badCount.status >= 400, `${badCount.status}`);

// Photos: upload, replace (upsert), list, public read, delete.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = async () => (await fetch(`${URL_BASE}/storage/v1/object/closet-images/${token}/a.jpg`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true', 'x-share-secret': secret },
  body: png,
})).status;
check('owner uploads a photo', (await upload()) === 200);
check('owner replaces the photo (upsert)', (await upload()) === 200);

const listPhotos = async (h) => {
  const r = await fetch(`${URL_BASE}/storage/v1/object/list/closet-images`, {
    method: 'POST', headers: { ...headers, ...h }, body: JSON.stringify({ prefix: token, limit: 100, offset: 0 }),
  });
  return { status: r.status, body: await r.text() };
};
const ownerPhotos = await listPhotos({ 'x-share-secret': secret });
check('owner lists the folder', ownerPhotos.body.includes('"a.jpg"'), ownerPhotos.body.slice(0, 60));
const publicPhoto = await fetch(`${URL_BASE}/storage/v1/object/public/closet-images/${token}/a.jpg?t=${Date.now()}`);
check('anyone loads the public photo address', publicPhoto.status === 200, `${publicPhoto.status}`);

// Open reads that part 2 closes.
const strangerPhotos = await listPhotos({});
const rootList = await (await fetch(`${URL_BASE}/storage/v1/object/list/closet-images`, {
  method: 'POST', headers, body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
})).text();
const allClosets = await (await fetch(`${URL_BASE}/rest/v1/shared_closets?select=token`, { headers })).text();
const allSuggestions = await (await fetch(`${URL_BASE}/rest/v1/suggestions?select=closet_token`, { headers })).text();
const isOpen = phase === 'before';
check(`stranger ${isOpen ? 'CAN' : 'cannot'} list the folder`, strangerPhotos.body.includes('a.jpg') === isOpen, strangerPhotos.body.slice(0, 60));
check(`stranger ${isOpen ? 'CAN' : 'cannot'} list the bucket`, rootList.includes(token) === isOpen, rootList.slice(0, 60));
check(`stranger ${isOpen ? 'CAN' : 'cannot'} list closets`, allClosets.includes(token) === isOpen, allClosets.slice(0, 60));
check(`stranger ${isOpen ? 'CAN' : 'cannot'} list suggestions`, allSuggestions.includes(token) === isOpen, allSuggestions.slice(0, 60));

// The friend still sends a suggestion (insert, no read back).
const send = await fetch(`${URL_BASE}/rest/v1/suggestions`, {
  method: 'POST', headers, body: JSON.stringify({ closet_token: token, suggested_by: 'test2', item_ids: ['a'] }),
});
check('friend sends a suggestion', send.status === 201, `${send.status}`);

if (phase === 'after') {
  const strangerDelete = await fetch(`${URL_BASE}/storage/v1/object/closet-images`, {
    method: 'DELETE', headers, body: JSON.stringify({ prefixes: [`${token}/a.jpg`] }),
  });
  const deletedByStranger = await strangerDelete.text();
  check('stranger cannot delete the photo', !deletedByStranger.includes('a.jpg'), deletedByStranger.slice(0, 60));
  const ownerDelete = await fetch(`${URL_BASE}/storage/v1/object/closet-images`, {
    method: 'DELETE', headers: { ...headers, 'x-share-secret': secret }, body: JSON.stringify({ prefixes: [`${token}/a.jpg`] }),
  });
  const deletedByOwner = await ownerDelete.text();
  check('owner deletes the photo', deletedByOwner.includes('a.jpg'), deletedByOwner.slice(0, 60));
}

// Limits from 20261014_share_abuse_limits.sql. Each of these must be refused,
// and none of them changes data when the rules are correct.
const suggest = body => fetch(`${URL_BASE}/rest/v1/suggestions`, { method: 'POST', headers, body: JSON.stringify(body) });
const refused = async (label, responsePromise) => {
  const r = await responsePromise;
  check(label, r.status >= 400, `${r.status} ${(await r.text()).slice(0, 70)}`);
};
await refused('suggestion name over 60 characters is refused',
  suggest({ closet_token: token, suggested_by: 'x'.repeat(61), item_ids: ['a'] }));
await refused('suggestion with 51 items is refused',
  suggest({ closet_token: token, suggested_by: 'test', item_ids: Array.from({ length: 51 }, (_, i) => `i${i}`) }));
await refused('suggestion with no items is refused',
  suggest({ closet_token: token, suggested_by: 'test', item_ids: [] }));
await refused('suggestion with its own created_at is refused',
  suggest({ closet_token: token, suggested_by: 'test', item_ids: ['a'], created_at: '2099-01-01T00:00:00Z' }));
await refused('suggestion to an unknown link is refused',
  suggest({ closet_token: 'nope', suggested_by: 'test', item_ids: ['a'] }));
await refused('stranger cannot update a suggestion',
  fetch(`${URL_BASE}/rest/v1/suggestions?closet_token=eq.${token}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ suggested_by: 'hacked' }) })
    .then(async r => (r.status < 400 && (await r.clone().text()) === '[]') ? new Response('no rows', { status: 403 }) : r));
await refused('stranger cannot claim a link with adopt_legacy_share',
  fetch(`${URL_BASE}/rest/v1/rpc/adopt_legacy_share`, { method: 'POST', headers, body: JSON.stringify({ p_token: token }) }));
await refused('stranger cannot run the cleanup',
  fetch(`${URL_BASE}/rest/v1/rpc/cleanup_expired_shares`, { method: 'POST', headers, body: '{}' }));
const bigItems = Array.from({ length: 2001 }, (_, i) => ({ id: `i${i}` }));
await refused('owner cannot save more than 2000 items',
  fetch(`${URL_BASE}/rest/v1/rpc/save_share`, { method: 'POST', headers, body: JSON.stringify({ p_token: token, p_secret: secret, p_items: bigItems, p_outfits: [], p_scope: null, p_ttl_days: null }) }));
await refused('owner cannot save more than 2 MB',
  fetch(`${URL_BASE}/rest/v1/rpc/save_share`, { method: 'POST', headers, body: JSON.stringify({ p_token: token, p_secret: secret, p_items: [{ id: 'a', note: 'x'.repeat(2.1 * 1024 * 1024) }], p_outfits: [], p_scope: null, p_ttl_days: null }) }));
await refused('a link cannot be made with a negative expiry',
  fetch(`${URL_BASE}/rest/v1/rpc/create_share`, { method: 'POST', headers, body: JSON.stringify({ p_scope: 'full', p_ttl_days: -1 }) }));
const bulk = Array.from({ length: 31 }, () => ({ closet_token: token, suggested_by: 'bulk', item_ids: ['a'] }));
await refused('31 suggestions in one request are refused (30 an hour)', suggest(bulk));
const afterBulk = await rpc('count_suggestions', { p_token: token, p_secret: secret, p_since: null });
check('the refused request added nothing', Number(afterBulk.body) < 31, afterBulk.body);
