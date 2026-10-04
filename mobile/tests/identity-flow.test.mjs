import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyIdentityFlow } from "../src/identity/flow.ts";

function fixture(kind = "ci") {
  const calls = [];
  const email = "worker@example.test";
  const expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
  const checks = {
    files: "passed",
    cnp: "passed",
    selfie: "passed",
    face_match: "passed",
  };
  const started = {
    id: "session-1",
    email,
    kind,
    status: "collecting",
    expires_at,
    checks: { ...checks, face_match: "pending" },
  };
  const completed = {
    verification: { id: "session-1", status: "verified", checks },
    proof: { token: "synthetic-only", email, expires_at },
  };
  const slots =
    kind === "ci"
      ? ["ci_front", "ci_back", "selfie"]
      : ["cei_front", "cei_back", "cei_pdf", "selfie"];
  const assets = Object.fromEntries(
    slots.map((slot) => [
      slot,
      {
        uri: slot,
        name: "synthetic",
        contentType: slot === "cei_pdf" ? "application/pdf" : "image/jpeg",
        size: 100,
      },
    ]),
  );
  const input = {
    email: " WORKER@example.test ",
    kind,
    assets,
    cancelled: () => false,
    progress: () => {},
  };
  const services = {
    baseUrl: "https://nova.example.test",
    readAsset: async (asset) => {
      calls.push(["read", asset.uri]);
      return "synthetic-base64";
    },
    client: {
      startIdentity: async (body) => {
        calls.push(["start", body]);
        return { verification: started };
      },
      uploadIdentityFile: async (id, body) => {
        calls.push(["upload", id, body]);
        return { file: { id: "file", slot: body.slot, sha256: "synthetic" } };
      },
      completeIdentity: async (id) => {
        calls.push(["complete", id]);
        return completed;
      },
    },
  };
  return { input, services, calls, started, completed, slots };
}

test("plaintext transport stops before starting a session or reading documents", async () => {
  const f = fixture();
  f.services.baseUrl = "http://172.16.15.29:8080";
  await assert.rejects(
    verifyIdentityFlow(f.input, f.services),
    /conexiune securizată/,
  );
  assert.deepEqual(f.calls, []);
});

test("unavailable and missing provider checks never read or upload documents", async () => {
  for (const status of ["not_available", "failed", "review", undefined]) {
    const f = fixture();
    f.started.checks.face_match = status;
    await assert.rejects(
      verifyIdentityFlow(f.input, f.services),
      /nu este disponibilă/,
    );
    assert.deepEqual(
      f.calls.map((call) => call[0]),
      ["start"],
    );
  }
  const f = fixture();
  delete f.started.checks;
  await assert.rejects(
    verifyIdentityFlow(f.input, f.services),
    /nu este disponibilă/,
  );
  assert.deepEqual(
    f.calls.map((call) => call[0]),
    ["start"],
  );
});

test("missing required files stop before any network request", async () => {
  const f = fixture("cei");
  delete f.input.assets.cei_pdf;
  await assert.rejects(verifyIdentityFlow(f.input, f.services), /Adaugă toate/);
  assert.deepEqual(f.calls, []);
});

test("wrong-email, wrong-kind, closed and expired sessions never receive files", async () => {
  for (const override of [
    { email: "someone@example.test" },
    { kind: "cei" },
    { status: "consumed" },
    { id: "" },
    { expires_at: "2000-01-01T00:00:00Z" },
  ]) {
    const f = fixture();
    Object.assign(f.started, override);
    await assert.rejects(verifyIdentityFlow(f.input, f.services));
    assert.deepEqual(
      f.calls.map((call) => call[0]),
      ["start"],
    );
  }
});

test("cancelling after file preparation prevents transmission", async () => {
  const f = fixture();
  let cancelled = false;
  f.input.cancelled = () => cancelled;
  f.services.readAsset = async (asset) => {
    f.calls.push(["read", asset.uri]);
    cancelled = true;
    return "synthetic";
  };
  await assert.rejects(verifyIdentityFlow(f.input, f.services), /anulată/);
  assert.deepEqual(
    f.calls.map((call) => call[0]),
    ["start", "read"],
  );
});

test("an upload failure prevents completion and proof issuance", async () => {
  const f = fixture();
  f.services.client.uploadIdentityFile = async () => {
    throw new Error("synthetic upload failure");
  };
  await assert.rejects(
    verifyIdentityFlow(f.input, f.services),
    /upload failure/,
  );
  assert.equal(
    f.calls.some((call) => call[0] === "complete"),
    false,
  );
});

test("review, rejected or missing face checks cannot yield a signup proof", async () => {
  for (const status of ["review", "failed", "not_available", undefined]) {
    const f = fixture();
    f.completed.verification.checks.face_match = status;
    await assert.rejects(verifyIdentityFlow(f.input, f.services));
  }
});

test("completion for another session cannot yield a signup proof", async () => {
  const f = fixture();
  f.completed.verification.id = "different-session";
  await assert.rejects(
    verifyIdentityFlow(f.input, f.services),
    /nu a fost confirmată/,
  );
});

test("CI and CEI return a proof only after their required files and real checks pass", async () => {
  for (const kind of ["ci", "cei"]) {
    const f = fixture(kind);
    const result = await verifyIdentityFlow(f.input, f.services);
    assert.equal(result, f.completed);
    const uploads = f.calls.filter((call) => call[0] === "upload");
    assert.deepEqual(
      uploads.map((call) => call[2].slot),
      f.slots,
    );
    assert.ok(uploads.every((call) => call[1] === "session-1"));
    assert.deepEqual(f.calls[0], [
      "start",
      { email: "worker@example.test", kind },
    ]);
    assert.deepEqual(f.calls.at(-1), ["complete", "session-1"]);
  }
});
