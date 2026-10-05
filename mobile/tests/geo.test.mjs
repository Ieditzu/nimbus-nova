import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDistance,
  formatDuration,
  googleMapsUrl,
  taskMapsUrl,
  hasLocation,
  projectPoints,
} from "../src/lib/geo.ts";

test("0,0 means no location", () => {
  assert.equal(hasLocation({ lat: 0, lng: 0 }), false);
  assert.equal(hasLocation({ lat: 44.43, lng: 26.1 }), true);
  assert.equal(hasLocation({ lat: 91, lng: 26 }), false);
});

test("durations and distances read naturally in Romanian", () => {
  assert.equal(formatDuration(20), "1 min");
  assert.equal(formatDuration(1497), "25 min");
  assert.equal(formatDuration(3900), "1 h 5 min");
  assert.equal(formatDuration(7200), "2 h");
  assert.equal(formatDistance(640), "640 m");
  assert.equal(formatDistance(2751), "2,8 km");
  assert.equal(formatDistance(18400), "18 km");
});

test("google maps link targets the task location", () => {
  const url = new URL(googleMapsUrl({ lat: 44.4268, lng: 26.1025 }));
  assert.equal(url.origin + url.pathname, "https://www.google.com/maps/dir/");
  assert.equal(url.searchParams.get("destination"), "44.4268,26.1025");
  assert.equal(url.searchParams.get("origin"), null);
  const withOrigin = new URL(
    googleMapsUrl({ lat: 44.4, lng: 26.1 }, { lat: 44.5, lng: 26.2 }),
  );
  assert.equal(withOrigin.searchParams.get("origin"), "44.5,26.2");
});

test("public task links show the locality, while participants get the exact point", () => {
  const task = { lat: 45.755326, lng: 21.227171, city: "Timișoara", county: "Timiș", sector: "" };
  const publicUrl = new URL(taskMapsUrl(task, false));
  assert.equal(publicUrl.pathname, "/maps/search/");
  assert.equal(publicUrl.searchParams.get("query"), "Timișoara, Timiș, România");
  assert.ok(!publicUrl.href.includes("45.755326"));
  const privateUrl = new URL(taskMapsUrl(task, true));
  assert.equal(privateUrl.pathname, "/maps/dir/");
  assert.equal(privateUrl.searchParams.get("destination"), "45.755326,21.227171");
});

test("projected points stay inside the box with padding", () => {
  const pts = projectPoints(
    [
      { lat: 44.42, lng: 26.09 },
      { lat: 44.45, lng: 26.12 },
    ],
    300,
    200,
    20,
  );
  for (const p of pts) {
    assert.ok(p.x >= 20 - 1e-6 && p.x <= 280 + 1e-6);
    assert.ok(p.y >= 20 - 1e-6 && p.y <= 180 + 1e-6);
  }
  assert.ok(pts[1].y < pts[0].y, "north is up");
});
