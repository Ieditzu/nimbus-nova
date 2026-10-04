import assert from "node:assert/strict";
import { test } from "node:test";
import { identityApproved, secureIdentityUrl } from "../src/identity/policy.ts";

const now = Date.parse("2026-10-04T12:00:00Z");
const email = "worker@example.test";
function result() {
  return {
    verification: {
      id: "test",
      status: "verified",
      checks: {
        files: "passed",
        cnp: "passed",
        selfie: "passed",
        face_match: "passed",
    document: "passed",
      },
    },
    proof: {
      token: "synthetic-proof",
      email,
      expires_at: "2026-10-04T12:15:00Z",
    },
  };
}
test("a backend verified status with no face matching cannot create an account", () => {
  const value = result();
  value.verification.checks.face_match = "not_available";
  assert.equal(identityApproved(value, email, now), false);
});
test("every identity check must pass", () => {
  for (const check of ["files", "cnp", "selfie", "face_match", "document"]) {
    for (const state of [
      "failed",
      "pending",
      "review",
      "not_available",
      undefined,
    ]) {
      const value = result();
      value.verification.checks[check] = state;
      assert.equal(
        identityApproved(value, email, now),
        false,
        `${check}: ${state}`,
      );
    }
  }
});
test("absent and malformed proofs fail closed", () => {
  for (const proof of [
    undefined,
    {},
    { token: "value" },
    { ...result().proof, token: " " },
    { ...result().proof, email: undefined },
    { ...result().proof, expires_at: "bad-date" },
  ]) {
    assert.equal(identityApproved({ ...result(), proof }, email, now), false);
  }
  assert.equal(
    identityApproved({ ...result(), verification: {} }, email, now),
    false,
  );
});
test("expired, wrong-email and consumed proofs are rejected", () => {
  const expired = result();
  expired.proof.expires_at = "2026-10-04T12:00:00Z";
  assert.equal(identityApproved(expired, email, now), false);
  assert.equal(identityApproved(result(), "another@example.test", now), false);
  const consumed = result();
  consumed.verification.status = "consumed";
  assert.equal(identityApproved(consumed, email, now), false);
});
test("a fully passed, unexpired, email-bound verification is accepted", () => {
  assert.equal(identityApproved(result(), " WORKER@example.test ", now), true);
});
test("identity documents cannot be uploaded over plaintext connections", () => {
  assert.equal(secureIdentityUrl("https://nova.example.test"), true);
  for (const url of [
    "http://172.16.15.29:8080",
    "http://localhost:8080",
    "ftp://nova.example.test",
    "invalid",
  ])
    assert.equal(secureIdentityUrl(url), false);
});
