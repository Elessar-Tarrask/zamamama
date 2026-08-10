// Типы документов Firestore. Держать в синхроне с functions/src/types.ts.

export interface LeadProfile {
  parentName?: string;
  childName?: string;
  childAge?: number;
  preferredDays?: string;
  notes?: string;
}

export interface ConvDoc {
  id: string; // телефон без «+»
  mode: "bot" | "human";
  contactName?: string;
  lead?: LeadProfile;
  lastInboundAtMs?: number;
  pausedUntilMs?: number;
  flagReason?: string;
}

export interface MessageDoc {
  id: string;
  direction: "in" | "out";
  byBot: boolean;
  type: string;
  text: string;
  dateTimeMs: number;
}

export interface FaqDoc {
  id: string;
  question: string;
  answer: string;
  enabled: boolean;
  order: number;
}

export interface BookingDoc {
  id: string;
  phone: string;
  parentName: string;
  childAge?: number;
  slotStartIso: string;
  status: string;
  calendarEventId?: string;
  createdAtMs?: number;
}

export interface UnansweredDoc {
  id: string;
  phone: string;
  question: string;
  context?: string;
  resolved: boolean;
  createdAtMs: number;
}
