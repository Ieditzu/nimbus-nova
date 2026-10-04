import test from 'node:test';
import assert from 'node:assert/strict';
import { photoSize } from '../src/identity/photo-size.ts';

test('high-resolution portrait and landscape photos keep both dimensions nonzero', () => {
  assert.deepEqual(photoSize(2160, 3840), { width: 1013, height: 1800 });
  assert.deepEqual(photoSize(3840, 2160), { width: 1800, height: 1013 });
  assert.deepEqual(photoSize(4000, 4000), { width: 1800, height: 1800 });
  assert.deepEqual(photoSize(640, 480), { width: 640, height: 480 });
  assert.deepEqual(photoSize(1, 4000), { width: 1, height: 1800 });
});

test('invalid capture dimensions cannot reach the image processor', () => {
  for (const [w, h] of [[0, 200], [200, 0], [NaN, 200], [Infinity, 200], [-1, 200]])
    assert.throws(() => photoSize(w, h));
});
