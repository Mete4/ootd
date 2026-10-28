#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zcipgvyhzttxhyytczbv.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_dc_NntGPiAUiQpROowHGww_7c9mzhHe';

const closetToken = process.argv[2];
const outputDir = process.argv[3] || path.join(process.cwd(), 'tmp');

if (!closetToken) {
  console.log('Usage: node scripts/verify-closet-image.mjs <closet-token> [output-dir]');
  process.exit(1);
}

const queryUrl = new URL(`${SUPABASE_URL}/rest/v1/shared_closets`);
queryUrl.searchParams.set('select', 'items_json');
queryUrl.searchParams.set('token', `eq.${closetToken}`);

const closetResponse = await fetch(queryUrl, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
});

if (!closetResponse.ok) {
  throw new Error(`Could not load closet: ${closetResponse.status} ${closetResponse.statusText}`);
}

const closets = await closetResponse.json();
const firstCloset = Array.isArray(closets) ? closets[0] : null;
const firstImageItem = (firstCloset?.items_json || []).find(item => item.imageUrl);

let imageUrl = firstImageItem?.imageUrl || null;
let objectPath = null;

if (imageUrl) {
  console.log(`Fetching image for item ${firstImageItem.id}`);
  console.log(imageUrl);

  const publicResponse = await fetch(imageUrl);
  if (publicResponse.ok) {
    const buffer = Buffer.from(await publicResponse.arrayBuffer());
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = path.join(outputDir, `${closetToken}-${firstImageItem.id}.jpg`);
    await fs.writeFile(fileName, buffer);

    console.log(`Saved ${buffer.length} bytes to ${fileName}`);
    process.exit(0);
  }

  const publicErrorText = await publicResponse.text().catch(() => '');
  console.log(`Public URL failed: ${publicResponse.status} ${publicResponse.statusText}`);
  if (publicErrorText) {
    console.log(publicErrorText);
  }

  const publicMarker = '/storage/v1/object/public/closet-images/';
  const markerIndex = imageUrl.indexOf(publicMarker);
  if (markerIndex === -1) {
    throw new Error('Could not parse object path from imageUrl.');
  }

  objectPath = imageUrl.slice(markerIndex + publicMarker.length);
} else {
  console.log(`No DB imageUrl found for closet token ${closetToken}. Listing storage folder instead.`);
  const listUrl = `${SUPABASE_URL}/storage/v1/object/list/closet-images`;
  const listResponse = await fetch(listUrl, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: `${closetToken}/`, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });

  if (!listResponse.ok) {
    const listErrorText = await listResponse.text().catch(() => '');
    throw new Error(`Storage list failed: ${listResponse.status} ${listResponse.statusText}${listErrorText ? `\n${listErrorText}` : ''}`);
  }

  const listedObjects = await listResponse.json();
  const firstObject = Array.isArray(listedObjects) ? listedObjects.find(entry => entry?.name) : null;
  if (!firstObject) {
    throw new Error(`No files found under closet-images/${closetToken}/`);
  }

  objectPath = `${closetToken}/${firstObject.name}`;
  console.log(`Found storage object: ${objectPath}`);
}

const downloadUrl = `${SUPABASE_URL}/storage/v1/object/closet-images/${objectPath}`;
console.log(`Trying direct storage download:`);
console.log(downloadUrl);

const directResponse = await fetch(downloadUrl, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
});

if (!directResponse.ok) {
  const directErrorText = await directResponse.text().catch(() => '');
  throw new Error(`Direct storage request failed: ${directResponse.status} ${directResponse.statusText}${directErrorText ? `\n${directErrorText}` : ''}`);
}

const buffer = Buffer.from(await directResponse.arrayBuffer());
await fs.mkdir(outputDir, { recursive: true });

const fileName = path.join(outputDir, `${closetToken}-verified.jpg`);
await fs.writeFile(fileName, buffer);

console.log(`Saved ${buffer.length} bytes to ${fileName}`);