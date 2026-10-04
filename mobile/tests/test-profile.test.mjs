import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesTestLogin,
  createTestProfileClient,
  initialTestProfile,
  testNotice,
} from "../src/auth/test-profile.ts";

test("the test credentials only work with development explicitly enabled", () => {
  assert.equal(
    matchesTestLogin(false, "test@haisamoritu.com", "samoaraplatoniimei"),
    false,
  );
  assert.equal(
    matchesTestLogin(true, " TEST@HAISAMORITU.COM ", "samoaraplatoniimei"),
    true,
  );
  assert.equal(matchesTestLogin(true, "test@haisamoritu.com", "wrong"), false);
  assert.equal(
    matchesTestLogin(true, "another@example.test", "samoaraplatoniimei"),
    false,
  );
});

test("local profile and applications never call private API methods", async () => {
  let profile = structuredClone(initialTestProfile);
  const api = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("Unexpected API call");
      },
    },
  );
  const client = createTestProfileClient(api, {
    read: async () => profile,
    write: async (body) => {
      profile = { ...profile, ...body };
      return profile;
    },
  });
  assert.equal(
    (await client.getMyProfile()).profile.user_id,
    initialTestProfile.user_id,
  );
  await client.putMyProfile({
    skills: ["test"],
    city: "Cluj",
    availability: "Weekend",
    bio: "Test",
  });
  assert.equal((await client.getMyProfile()).profile.city, "Cluj");
  assert.deepEqual(await client.listMyApplications(), { applications: [] });
});

test("test sessions block mutations and any future private API method", async () => {
  let calls = 0;
  const api = new Proxy(
    {},
    {
      get: () => async () => {
        calls++;
      },
    },
  );
  const client = createTestProfileClient(api, {
    read: async () => initialTestProfile,
    write: async () => initialTestProfile,
  });
  for (const method of [
    "applyToTask",
    "createTask",
    "pay",
    "startIdentity",
    "uploadIdentityFile",
    "completeIdentity",
    "register",
    "login",
    "me",
    "resetDemo",
    "futurePrivateMethod",
  ])
    await assert.rejects(
      () => client[method](),
      (error) => error.message === testNotice,
    );
  assert.equal(calls, 0);
});

test("public task browsing remains connected to the API", async () => {
  const client = createTestProfileClient(
    { getTask: async (id) => ({ task: { id } }) },
    {
      read: async () => initialTestProfile,
      write: async () => initialTestProfile,
    },
  );
  assert.deepEqual(await client.getTask("real-task-id"), {
    task: { id: "real-task-id" },
  });
});
