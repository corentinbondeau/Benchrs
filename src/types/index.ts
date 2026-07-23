export type UserRole = "coach" | "player" | "parent";
export type EventType = "match" | "training";
export type EventStatus = "upcoming" | "ongoing" | "completed" | "cancelled";
export type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "excused"
  | "pending";
export type MatchResult = "win" | "loss" | "draw";
export type InjuryStatus = "active" | "recovered";
export type CarpoolingRole = "driver" | "passenger";

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  position: string | null;
  shirt_number: number | null;
  is_active: boolean;
  email_notifications?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParentStudent {
  parent_id: string;
  student_id: string;
}

export interface Event {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  location: string | null;
  map_url: string | null;
  status: EventStatus;
  opponent: string | null;
  match_result: MatchResult | null;
  score_us: number | null;
  score_them: number | null;
  sporteasy_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  event_id: string;
  user_id: string;
  status: AttendanceStatus;
  minutes_played: number;
  absence_reason: string | null;
  responded_at: string | null;
  created_at: string;
  event?: Event;
  profile?: Profile;
}

export interface MatchStat {
  id: string;
  event_id: string;
  player_id: string;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  clean_sheet: boolean;
  saves: number;
  minutes_played: number;
  created_at: string;
  event?: Event;
  profile?: Profile;
}

export interface FitnessRating {
  id: string;
  user_id: string;
  event_id: string | null;
  fatigue_level: number;
  form_level: number;
  notes: string | null;
  created_at: string;
}

export interface Injury {
  id: string;
  player_id: string;
  description: string;
  injury_type: string | null;
  injury_date: string;
  expected_return: string | null;
  status: InjuryStatus;
  reported_by: string | null;
  created_at: string;
  player?: Profile;
}

export interface TrainingSession {
  id: string;
  event_id: string;
  created_by: string | null;
  title: string;
  objectives: string[] | null;
  exercises: Exercise[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
}

export interface Formation {
  id: string;
  event_id: string;
  name: string;
  formation_data: FormationData;
  created_by: string | null;
  is_default: boolean;
  created_at: string;
}

export interface FormationData {
  positions: PlayerPosition[];
}

export interface PlayerPosition {
  player_id: string;
  x: number;
  y: number;
  label: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  channel_type: "general" | "parents" | "coaches";
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null;
  content: string;
  is_edited: boolean;
  created_at: string;
  sender?: Profile;
}

export interface ChatMember {
  channel_id: string;
  user_id: string;
  joined_at: string;
}

export interface CarpoolingTrip {
  id: string;
  event_id: string;
  driver_id: string;
  total_seats: number;
  departure_location: string | null;
  departure_time: string | null;
  notes: string | null;
  created_at: string;
  driver?: Profile;
  event?: Event;
  bookings?: CarpoolingBooking[];
}

export interface CarpoolingBooking {
  id: string;
  trip_id: string;
  passenger_id: string;
  role: CarpoolingRole;
  seats_taken: number;
  status: string;
  created_at: string;
  passenger?: Profile;
}

export interface Task {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  is_completed: boolean;
  created_at: string;
  assignee?: Profile;
  event?: Event;
}

export interface MotmVote {
  id: string;
  event_id: string;
  voter_id: string;
  candidate_id: string;
  created_at: string;
  candidate?: Profile;
}

export interface TrophyItem {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  awarded_to: string | null;
  awarded_by: string | null;
  event_id: string | null;
  created_at: string;
  recipient?: Profile;
  event?: Event;
}

export interface GalleryMedia {
  id: string;
  event_id: string | null;
  uploaded_by: string | null;
  url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface MatchLineup {
  id: string;
  event_id: string;
  player_id: string;
  position_label: string | null;
  is_starter: boolean;
  entered_at_minute: number | null;
  exited_at_minute: number | null;
  created_at: string;
  player?: Profile;
}

export interface MatchEventRecord {
  id: string;
  event_id: string;
  event_type: string;
  player_id: string | null;
  related_player_id: string | null;
  minute: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  player?: Profile;
  related_player?: Profile;
}

export interface Licence {
  id: string;
  player_id: string;
  season: string;
  status: "valid" | "pending_documents" | "expired";
  documents_received: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cotisation {
  id: string;
  player_id: string;
  season: string;
  amount_expected: number;
  amount_paid: number;
  status: "paid" | "pending" | "partial";
  payment_method: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistory {
  id: string;
  cotisation_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  recorded_by_user?: Profile;
}

export interface User {
  id: string;
  email: string;
  profile: Profile;
}
