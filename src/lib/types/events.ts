// Types for the event sign-up feature.

export type EventRow = {
  id: string;
  name: string;
  slug: string;
  saturday_date: string | null;
  sunday_date: string | null;
  is_open: boolean;
  created_at: string;
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
};

export type RosterHorse = {
  id: string;
  name: string;
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
  saturday: boolean;
  sunday: boolean;
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
