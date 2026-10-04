import type { NovaClient, PublicAccount } from "../api/client.ts";
import type { Profile, ProfileWrite } from "../api/types.ts";

// Explicit local development fixture. This marker is never an API bearer token.
export const testToken = "nova-local-test-profile";
export const testEmail = "test@haisamoritu.com";
const testPassword = "samoaraplatoniimei";
export const testNotice =
  "Profil de test local. Aplicările reale necesită un cont verificat.";
export const testUser: PublicAccount = {
  id: "local-test-worker",
  role: "worker",
  display_name: "Perjoc Test",
  volunteer_only: false,
};
export const initialTestProfile: Profile = {
  user_id: testUser.id,
  display_name: testUser.display_name,
  skills: ["organizare", "comunicare"],
  city: "București",
  availability: "După-amiaza și în weekend",
  bio: "Profil local pentru testarea aplicației Nova.",
};
export function matchesTestLogin(
  enabled: boolean,
  email: string,
  password: string,
) {
  return (
    enabled &&
    email.trim().toLowerCase() === testEmail &&
    password === testPassword
  );
}

export function createTestProfileClient(
  publicClient: NovaClient,
  storage: {
    read: () => Promise<Profile>;
    write: (body: ProfileWrite) => Promise<Profile>;
  },
): NovaClient {
  const publicMethods = new Set([
    "getHealth",
    "listOpenTasks",
    "searchTasks",
    "getTask",
    "listReviews",
    "listEvents",
  ]);
  // Block every private operation, including future methods added to the shared client.
  return new Proxy(publicClient, {
    get(target, property) {
      if (property === "getMyProfile")
        return async () => ({ profile: await storage.read() });
      if (property === "putMyProfile")
        return async (body: ProfileWrite) => ({
          profile: await storage.write(body),
        });
      if (property === "listMyApplications")
        return async () => ({ applications: [] });
      if (typeof property === "string" && publicMethods.has(property))
        return Reflect.get(target, property);
      return async () => {
        throw new Error(testNotice);
      };
    },
  });
}
