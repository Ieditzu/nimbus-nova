import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Search is kept separate from the bundled JSON for direct Node verification.
import { locationSearch } from '../src/lib/location-search.ts';
const counties=JSON.parse(readFileSync(new URL('../src/data/romania-localities.json',import.meta.url)));
test('all counties and SIRUTA locality IDs are included without duplicates',()=>{
 assert.equal(counties.length,42);
 const places=counties.flatMap(c=>c.localities);
 assert.equal(places.length,13756);
 assert.equal(new Set(places.map(p=>p.id)).size,places.length);
 assert(counties.some(c=>c.name==='București'&&c.localities.some(p=>p.name==='București')));
});
test('Romanian accents and common keyboard transliterations match',()=>{
 for(const [typed,official]of [['Botoshani','Botoșani'],['Constantza','Constanța'],['Timishoara','Timișoara'],['Targu Mures','Târgu Mureș'],['Intorsura Buzaului','Întorsura Buzăului'],['Bistriţa-Năsăud','Bistrița-Năsăud']]) assert.equal(locationSearch(typed),locationSearch(official));
});
