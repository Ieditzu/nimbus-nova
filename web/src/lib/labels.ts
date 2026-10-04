import type { ApplicationStatus, Category, TaskStatus } from '../api/types';

export const categories: Record<Category, string> = {
  event_setup: 'Amenajare eveniment',
  light_moving: 'Mutat obiecte ușoare',
  shop_cover: 'Acoperire scurtă în magazin',
  other: 'Altele',
};
export const statuses: Record<TaskStatus, string> = { open: 'Deschisă', assigned: 'Atribuită', completed: 'Finalizată', hidden: 'Ascunsă' };
export const applicationStatuses: Record<ApplicationStatus, string> = { pending: 'În așteptare', accepted: 'Acceptată', rejected: 'Respinsă' };
