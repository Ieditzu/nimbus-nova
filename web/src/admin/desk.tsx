import type { ReactNode } from 'react';
import {
  BankIcon, CalendarBlankIcon, ClipboardTextIcon, ClockCounterClockwiseIcon, HandshakeIcon, IdentificationCardIcon,
  PaperPlaneTiltIcon, PulseIcon, ScalesIcon, SquaresFourIcon, StarIcon, UsersIcon, type Icon,
} from '@phosphor-icons/react';
import type { TaskPublic } from '../api/types';
import type {
  AdminApplication, AdminDispute, AdminEvent, AdminLog, AdminReview, AdminStats, AdminSystem, AdminUser,
  IdentitySession, LedgerEntry, Partner,
} from './client';

export const sections = ['overview', 'users', 'tasks', 'applications', 'reviews', 'disputes', 'identity', 'ledger', 'partners', 'events', 'logs', 'system'] as const;
export type Section = (typeof sections)[number];

export const sectionMeta: Record<Section, { title: string; blurb: string; icon: Icon; group: string; key: string }> = {
  overview: { title: 'Rezumat', blurb: 'Pulsul platformei: ce s-a mișcat azi și ce așteaptă o decizie.', icon: SquaresFourIcon, group: 'Birou', key: '1' },
  users: { title: 'Oameni', blurb: 'Conturi, roluri și stare. Deschide un rând pentru tot istoricul.', icon: UsersIcon, group: 'Piață', key: '2' },
  tasks: { title: 'Sarcini', blurb: 'Toate anunțurile, inclusiv cele ascunse. Moderează în masă.', icon: ClipboardTextIcon, group: 'Piață', key: '3' },
  applications: { title: 'Candidaturi', blurb: 'Cine a aplicat unde și ce a scris.', icon: PaperPlaneTiltIcon, group: 'Piață', key: '4' },
  reviews: { title: 'Recenzii', blurb: 'Reputația din spatele fiecărui cont. Elimină ce încalcă regulile.', icon: StarIcon, group: 'Piață', key: '5' },
  disputes: { title: 'Dispute', blurb: 'Nova nu ține banii. Decizi cine are dreptate: eliberare, returnare sau împărțire.', icon: ScalesIcon, group: 'Încredere', key: '6' },
  identity: { title: 'Identitate', blurb: 'Verificările CI și CEI, cu rezultatul fiecărei etape.', icon: IdentificationCardIcon, group: 'Încredere', key: '7' },
  ledger: { title: 'Bani', blurb: 'Registrul dublu: fiecare leu care intră, stă sau pleacă.', icon: BankIcon, group: 'Bani', key: '8' },
  partners: { title: 'Parteneri', blurb: 'Magazinele și organizațiile care publică ture.', icon: HandshakeIcon, group: 'Bani', key: '9' },
  events: { title: 'Evenimente', blurb: 'Voluntariat fără plată, cu prezență și diplome.', icon: CalendarBlankIcon, group: 'Comunitate', key: '' },
  logs: { title: 'Jurnal', blurb: 'Fiecare acțiune de administrare, cu autor și țintă.', icon: ClockCounterClockwiseIcon, group: 'Platformă', key: '' },
  system: { title: 'Sistem', blurb: 'Starea serverului, a bazei de date și a configurației.', icon: PulseIcon, group: 'Platformă', key: '' },
};

export type DeskData = {
  users: AdminUser[];
  tasks: TaskPublic[];
  applications: AdminApplication[];
  disputes: AdminDispute[];
  reviews: AdminReview[];
  entries: LedgerEntry[];
  partners: Partner[];
  events: AdminEvent[];
  identity: IdentitySession[];
  logs: AdminLog[];
  stats: AdminStats | null;
  system: AdminSystem | null;
};

export const emptyData: DeskData = {
  users: [], tasks: [], applications: [], disputes: [], reviews: [], entries: [], partners: [], events: [], identity: [], logs: [], stats: null, system: null,
};

export type ConfirmRequest = { title: string; body: ReactNode; label: string; danger?: boolean; onConfirm: () => void };

export type Desk = {
  token: string;
  me: { id: string; display_name: string };
  data: DeskData;
  loading: boolean;
  days: 14 | 30;
  setDays: (days: 14 | 30) => void;
  /** Runs a mutation, shows a toast (with optional undo) and reloads the desk. */
  run: (action: () => Promise<unknown>, done: string, undo?: () => Promise<unknown>) => Promise<boolean>;
  confirm: (request: ConfirmRequest) => void;
  openUser: (id: string) => void;
  openTask: (id: string) => void;
  go: (section: Section) => void;
  reload: () => Promise<void>;
  userName: (id: string) => string;
};
