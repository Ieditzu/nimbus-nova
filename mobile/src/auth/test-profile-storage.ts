import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile, ProfileWrite } from "../api/types";
import { initialTestProfile } from "./test-profile";

const key = "nova.local-test.profile";
export async function readTestProfile(): Promise<Profile> {
  const value = await AsyncStorage.getItem(key);
  if (!value)
    return { ...initialTestProfile, skills: [...initialTestProfile.skills] };
  const saved: unknown = JSON.parse(value);
  if (typeof saved !== "object" || saved === null)
    throw new Error("Profilul local nu a putut fi citit.");
  const body = saved as Partial<ProfileWrite>;
  if (
    !Array.isArray(body.skills) ||
    !body.skills.every((item) => typeof item === "string") ||
    typeof body.city !== "string" ||
    typeof body.availability !== "string" ||
    typeof body.bio !== "string"
  )
    throw new Error("Profilul local nu a putut fi citit.");
  return {
    ...initialTestProfile,
    skills: body.skills,
    city: body.city,
    availability: body.availability,
    bio: body.bio,
  };
}
export async function writeTestProfile(body: ProfileWrite): Promise<Profile> {
  await AsyncStorage.setItem(key, JSON.stringify(body));
  return { ...initialTestProfile, ...body };
}
