import test from "node:test";
import assert from "node:assert/strict";
import { amountToBani, platformFeeBani, romanianDateTime } from "../src/lib/job-form.ts";
import { mergeMessages } from "../src/chat/merge.ts";
test("money stays integer bani and rejects ambiguous or excessive amounts", () => {
  assert.equal(amountToBani("150,25"), 15025);
  assert.equal(amountToBani("0"), 0);
  assert.equal(amountToBani("5000"), 500000);
  for (const bad of ["5000.01", "-1", "1.001", "1e3", "", "12 3"])
    assert.throws(() => amountToBani(bad));
});
test("5% Nova commission rounds to whole bani like the backend", () => {
  assert.equal(platformFeeBani(10000), 500);
  assert.equal(platformFeeBani(101), 5);
  assert.equal(platformFeeBani(103), 5);
  assert.equal(platformFeeBani(110), 6);
});
test("Romanian times have the correct daylight saving offset", () => {
  assert.equal(
    romanianDateTime("2026-10-15", "09:00"),
    "2026-10-15T06:00:00.000Z",
  );
  assert.equal(
    romanianDateTime("2026-12-15", "09:00"),
    "2026-12-15T07:00:00.000Z",
  );
  for (const [date, time] of [
    ["2026-02-31", "09:00"],
    ["2026-03-29", "03:30"],
    ["2026-12-15", "24:00"],
    ["2026-13-01", "09:00"],
  ])
    assert.throws(() => romanianDateTime(date, time));
});
test("polling and send acknowledgements merge without duplicating or reordering messages", () => {
  const one = { id: "one", sequence: 1, text: "first" },
    two = { id: "two", sequence: 2, text: "second" },
    three = { id: "three", sequence: 3, text: "third" };
  assert.deepEqual(mergeMessages([two, one], [two, three]), [three, two, one]);
  assert.deepEqual(mergeMessages([three, two], [one]), [three, two, one]);
});
