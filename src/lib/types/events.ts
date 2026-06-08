// Types for the event sign-up feature.

import type { EventConfig } from "@/lib/events/config";

export type EventRow = {
  id: string;
  name: string;
  slug: string;
  saturday_date: string | null;
  sunday_date: string | null;
  is_open: boolean;
  created_at: string;
  config: EventConfig;
};

export type ClubOption = {
  id: string;
  name: string;
  representative: string | null;
  coach: string | null;
  phone: string | null;
  email: string | null;
};

export type RosterRider = {
  id: string;
  first_name: string;
  last_name: string;
  club: string | null;
};

export type RosterHorse = {
  id: string;
  name: string;
  club: string | null;
};

export type ClubRoster = {
  riders: RosterRider[];
  horses: RosterHorse[];
};

// ---- Public registration payload (POST /api/events/[slug]/register) ----

export type EntryInput = {
  // rider: either an existing rider id, or a new rider's names
  riderId: string | null;
  newRiderFirst: string;
  newRiderLast: string;
  // horse: either an existing horse id, or a new horse name
  horseId: string | null;
  newHorseName: string;
  height: string;
  section: string;
  days: string[];
  circuit: boolean;
  discount: boolean;
};

export type RegisterPayload = {
  isOtherClub: boolean;
  clubId: string | null;
  newClubName: string;
  contact: {
    representative: string;
    coach: string;
    phone: string;
    email: string;
  };
  entries: EntryInput[];
};

// ---- Edit flow (club + email gated) ------------------------------------

export type ExistingEntry = {
  id: string;
  submission_id: string;
  rider_id: string | null;
  horse_id: string | null;
  rider_name: string;
  horse_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount: boolean;
};

export type LookupPayload = { clubId: string; email: string };

export type LookupResult = {
  clubId: string;
  clubName: string;
  submissionId: string; // submission new entries get attached to
  entries: ExistingEntry[];
  riders: RosterRider[];
  horses: RosterHorse[];
};

export type UpdatePayload = {
  clubId: string;
  email: string;
  deletedEntryIds: string[];
  updatedEntries: (EntryInput & { id: string })[];
  addedEntries: EntryInput[];
};
