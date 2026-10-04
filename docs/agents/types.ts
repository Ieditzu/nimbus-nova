export type ActorId = "worker-1" | "poster-1" | "admin-1";
export type Category = "event_setup" | "light_moving" | "shop_cover" | "other";
export type TaskStatus = "open" | "assigned" | "completed" | "hidden";
export type ApplicationStatus = "pending" | "accepted" | "rejected";

export interface TaskPublic {
  id: string;
  poster_id: string;
  poster_name: string;
  title: string;
  category: Category;
  city: string;
  photo_url: string;
  sector: string;
  lat: number;
  lng: number;
  starts_at: string;
  ends_at: string;
  amount_bani: number;
  description: string;
  safety_note: string;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
}

export interface CreateTaskRequest {
  title: string;
  category: Category;
  city: string;
  starts_at: string;
  ends_at: string;
  amount_bani: number;
  description: string;
  safety_note: string;
  photo_url?: string;
  sector?: string;
  lat?: number;
  lng?: number;
}

export interface Profile {
  user_id: string;
  display_name: string;
  skills: string[];
  city: string;
  availability: string;
  bio: string;
}

export interface ProfileWrite {
  skills: string[];
  city: string;
  availability: string;
  bio: string;
}

export interface ApplicationView {
  id: string;
  task_id: string;
  worker_id: string;
  worker_name: string;
  skills: string[];
  city: string;
  bio: string;
  message: string;
  status: ApplicationStatus;
  created_at: string;
}

export interface ApplicationWithTask extends ApplicationView {
  task: TaskPublic;
}

export interface Review {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  subject_id: string;
  subject_name: string;
  stars: number;
  text: string;
  created_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type IdentityKind = "ci" | "cei";
export type IdentitySlot = "ci_front" | "ci_back" | "ci_scan_text" | "cei_front" | "cei_back" | "cei_pdf" | "selfie";

export interface IdentityVerification {
  id: string;
  email: string;
  kind: IdentityKind;
  status: "collecting" | "verified" | "consumed";
  expires_at: string;
  checks?: { files: string; cnp: string; selfie: string; face_match: string };
}

export interface IdentityProof {
  token: string;
  expires_at: string;
  email: string;
}

export interface Reputation {
  count: number;
  average: number;
}
