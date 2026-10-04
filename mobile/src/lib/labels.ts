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

export function schedule(start: string, end: string) {
  const first = new Date(start);
  const last = new Date(end);
  const dateOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Bucharest",
  };
  const date = first.toLocaleDateString("ro-RO", dateOptions);
  const endDate = last.toLocaleDateString("ro-RO", dateOptions);
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  };
  return {
    date: date === endDate ? date : `${date} – ${endDate}`,
    time: `${first.toLocaleTimeString("ro-RO", timeOptions)} – ${last.toLocaleTimeString("ro-RO", timeOptions)}`,
  };
}
