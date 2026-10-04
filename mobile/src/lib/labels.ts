import type { ApplicationStatus, Category, TaskStatus } from "../api/types";
export const categories: Category[] = [
  "event_setup",
  "light_moving",
  "shop_cover",
  "other",
];
export const categoryLabel: Record<Category, string> = {
  event_setup: "Amenajare eveniment",
  light_moving: "Mutat obiecte ușoare",
  shop_cover: "Acoperire scurtă în magazin",
  other: "Altele",
};
export const taskStatusLabel: Record<TaskStatus, string> = {
  open: "Deschisă",
  assigned: "Atribuită",
  completed: "Finalizată",
  hidden: "Ascunsă",
};
export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  pending: "În așteptare",
  accepted: "Acceptată",
  rejected: "Respinsă",
};
export const interval = (start: string, end: string) =>
  `${new Date(start).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" })} – ${new Date(end).toLocaleTimeString("ro-RO", { timeStyle: "short", timeZone: "Europe/Bucharest" })}`;
