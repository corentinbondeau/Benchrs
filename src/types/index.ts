export type UserRole = "coach" | "player" | "parent";
export type TeamMemberRole = "owner" | "coach" | "player" | "parent";
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
export type TransferStatus = "pending" | "approved" | "rejected";

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface Club {
  id: string;
  name: string;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  invite_code: string;
  color_primary: string;
  color_secondary: string;
  logo_url?: string | null;
  banner_url?: string | null;
  created_at: string;
  club?: Club;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: string;
  team?: Team;
  profile?: Profile;
}

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
  preferred_foot?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  secondary_positions?: string[] | null;
  is_active: boolean;
  email_notifications?: boolean;
  vma: number | null;
  vmi: number | null;
  licence_expires_at: string | null;
  medical_cert_expires_at: string | null;
  allergies?: string | null;
  licence_number?: string | null;
  emergency_contacts?: EmergencyContact[] | null;
  team_id: string | null;
  parent_onboarding_done?: boolean;
  onboarding_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentStudent {
  parent_id: string;
  student_id: string;
  team_id: string;
}

export type GoalCategory =
  | "goals"
  | "assists"
  | "matches"
  | "minutes"
  | "assiduite"
  | "other";

export interface PersonalGoal {
  id: string;
  player_id: string;
  team_id: string;
  season: string;
  category: GoalCategory;
  label: string;
  target: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  team_id: string;
  recurrence_group_id: string | null;
  match_started_at?: string | null;
  match_ended_at?: string | null;
  match_halftime_at?: string | null;
  match_resumed_at?: string | null;
  live_token?: string | null;
  travel_time_min?: number | null;
  departure_notified_at?: string | null;
  arrival_notified_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  referee?: string | null;
  delegate?: string | null;
  cancel_reason?: string | null;
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
  team_id: string;
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
  team_id: string;
  created_at: string;
  event?: Event;
  profile?: Profile;
}

export interface PlayerPhysicalTest {
  id: string;
  player_id: string;
  team_id: string;
  test_type: "vma" | "vmi";
  value: number;
  tested_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FitnessRating {
  id: string;
  user_id: string;
  event_id: string | null;
  fatigue_level: number;
  form_level: number;
  notes: string | null;
  team_id: string;
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
  team_id: string;
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
  team_id: string;
  source?: "ai" | "manual";
  visibility?: "coach" | "team";
  created_at: string;
  updated_at: string;
}

export type SchematicView = "full" | "half" | "third" | "h_full" | "h_half";
export type TeamColor = "att" | "def" | "neutral" | "yellow" | "green" | "orange" | "purple" | "black";
export type ArrowVariant = "solid" | "dashed" | "double" | "curved";
export type ShapeKind = "rect" | "circle" | "triangle" | "diamond" | "hexagon";
export type BallVariant = "classic" | "motion";

export interface ExerciseSchematicElement {
  id: string;
  type: "player" | "cone" | "ball" | "arrow" | "zone" | "shape" | "label";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  team?: TeamColor;
  number?: string;
  text?: string;
  color?: string;
  arrowVariant?: ArrowVariant;
  ballVariant?: BallVariant;
  shapeKind?: ShapeKind;
}

export interface ExerciseSchematic {
  elements: ExerciseSchematicElement[];
  view?: SchematicView;
}

export interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
  schema?: ExerciseSchematic | null;
}

export interface Formation {
  id: string;
  event_id: string;
  name: string;
  formation_data: FormationData;
  created_by: string | null;
  is_default: boolean;
  team_id: string;
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
  channel_type: "general" | "parents" | "coaches" | "custom" | "player";
  team_id: string;
  created_by: string | null;
  is_default: boolean;
  created_at: string;
  player_id?: string | null;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null;
  content: string;
  is_edited: boolean;
  team_id: string;
  created_at: string;
  sender?: Profile;
}

export interface ChatMember {
  channel_id: string;
  user_id: string;
  team_id: string;
  notifications_enabled: boolean;
  last_read_at: string;
  left_at: string | null;
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
  team_id: string;
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
  team_id: string;
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
  team_id: string;
  created_at: string;
  assignee?: Profile;
  event?: Event;
}

export interface MotmVote {
  id: string;
  event_id: string;
  title?: string;
  ends_at?: string;
  voter_id: string;
  candidate_id: string;
  team_id: string;
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
  team_id: string;
  created_at: string;
  recipient?: Profile;
  event?: Event;
}

export interface Album {
  id: string;
  title: string;
  description: string | null;
  team_id: string;
  created_by: string | null;
  created_at: string;
}

export interface GalleryMedia {
  id: string;
  event_id: string | null;
  album_id: string | null;
  uploaded_by: string | null;
  url: string;
  storage_path: string | null;
  media_type: string;
  caption: string | null;
  team_id: string;
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
  team_id: string | null;
  created_at: string;
  url?: string | null;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  team_id: string | null;
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
  team_id: string;
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
  team_id: string;
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
  team_id: string;
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
  due_date: string | null;
  notes: string | null;
  team_id: string;
  created_at: string;
  updated_at: string;
}

export interface TreasuryTransaction {
  id: string;
  team_id: string;
  type: "income" | "expense";
  label: string;
  amount: number;
  category: string;
  txn_date: string;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  team_id: string;
  name: string;
  category: "maillots" | "ballons" | "trousses" | "medical" | "autre";
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ItemLoan {
  id: string;
  team_id: string;
  item_id: string;
  player_id: string;
  quantity: number;
  loaned_at: string;
  returned_at: string | null;
  condition_note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SessionRpe {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string;
  rpe: number | null;
  session_duration: number | null;
  form_level: number | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchChecklistItem {
  id: string;
  event_id: string;
  team_id: string;
  label: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export interface MatchChecklistAck {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string;
  acknowledged_at: string;
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

export interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  team_id: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  profile: Profile;
}

export interface ExerciseLibrary {
  id: string;
  team_id: string;
  created_by: string | null;
  name: string;
  duration: number;
  description: string | null;
  drill_type: string;
  schema?: ExerciseSchematic | null;
  created_at: string;
}

export interface WeeklyChallengeRow {
  id: string;
  team_id: string;
  week_start: string;
  title: string;
  description: string;
  difficulty: "facile" | "moyen" | "difficile";
  created_by: string | null;
  created_at: string;
}

export interface ChallengeSubmission {
  id: string;
  challenge_id: string;
  player_id: string;
  team_id: string;
  media_url: string;
  storage_path: string;
  comment: string | null;
  status: "pending" | "validated" | "rejected";
  validated_by: string | null;
  created_at: string;
}

export interface PhysicalPrepDocument {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  file_url: string;
  storage_path?: string | null;
  file_type: string;
  uploaded_by: string | null;
  is_public: boolean;
  created_at: string;
}

export interface PhysicalPrepSession {
  id: string;
  team_id: string;
  title: string;
  session_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PhysicalPrepStatus {
  id: string;
  session_id: string;
  player_id: string;
  status: "success" | "partial" | "failed" | "excused" | "pending";
  notes: string | null;
  created_at: string;
  player?: Profile;
}

export interface TeamJoinRequest {
  id: string;
  team_id: string;
  user_id: string;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user?: Profile;
}

export interface TrainingTemplate {
  id: string;
  team_id: string;
  name: string;
  source: "manual" | "ai";
  exercises: unknown;
  objectives: string[] | null;
  notes: string | null;
  visibility: "coach" | "team";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  club_id: string | null;
  team_id: string;
  user_id: string | null;
  action_type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ClubPost {
  id: string;
  club_id: string;
  team_id: string;
  author_id: string | null;
  content: string;
  media_url: string | null;
  storage_path: string | null;
  media_type: string | null;
  created_at: string;
  author?: Profile;
  team?: Pick<Team, "id" | "name" | "color_primary">;
}

export interface PlayerNotebookEntry {
  id: string;
  player_id: string;
  team_id: string;
  event_id: string;
  performance: number;
  notable_events: string | null;
  improvements: string | null;
  notes: string | null;
  created_at: string;
}

export interface EducatorPlan {
  id: string;
  team_id: string;
  user_id: string;
  event_id: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
}

export interface Pitch {
  id: string;
  club_id: string;
  name: string;
  location: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PitchBooking {
  id: string;
  pitch_id: string;
  club_id: string;
  team_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  team?: Pick<Team, "id" | "name" | "color_primary">;
}

export interface PlayerTransfer {
  id: string;
  club_id: string;
  player_id: string;
  from_team_id: string;
  to_team_id: string;
  status: TransferStatus;
  notes: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  player?: Profile;
  from_team?: Pick<Team, "id" | "name">;
  to_team?: Pick<Team, "id" | "name">;
  requester?: Profile;
}

export interface MatchAgendaItem {
  id: string;
  event_id: string;
  team_id: string;
  label: string;
  agenda_time: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export interface Tournament {
  id: string;
  team_id: string;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  team_id: string;
  opponent: string;
  match_datetime: string;
  venue: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface LockerPlaylistItem {
  id: string;
  event_id: string;
  team_id: string;
  title: string;
  url: string;
  added_by: string | null;
  created_at: string;
}

export interface Suspension {
  id: string;
  player_id: string;
  team_id: string;
  reason: string;
  matches_count: number;
  start_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ParentMeeting {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  meeting_date: string | null;
  location: string | null;
  agenda: { label: string }[];
  minutes: { label: string; content: string }[];
  status: "planned" | "done" | "cancelled";
  created_by: string | null;
  created_at: string;
}

export interface MeetingSignature {
  id: string;
  meeting_id: string;
  team_id: string;
  member_id: string;
  member_name: string;
  signature_data: string;
  signed_at: string;
}

export interface TeamPot {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  goal_amount: number | null;
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
}

export interface PotContribution {
  id: string;
  pot_id: string;
  team_id: string;
  contributor_id: string | null;
  contributor_name: string;
  amount: number;
  message: string | null;
  payment_method: "cash" | "bank" | "app";
  transferred: boolean;
  created_at: string;
}

export interface Newsletter {
  id: string;
  team_id: string;
  month: string;
  title: string;
  content: Record<string, unknown>;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SeasonStorybook {
  id: string;
  team_id: string;
  season: string;
  content: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface SeasonGreeting {
  id: string;
  player_id: string;
  team_id: string;
  season: string;
  content: string;
  created_at: string;
}

export interface TrialRequest {
  id: string;
  club_id: string;
  player_first_name: string;
  player_last_name: string;
  birth_date: string | null;
  position: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  message: string | null;
  status: "new" | "contacted" | "scheduled" | "accepted" | "rejected";
  trial_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface SessionFeedback {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string;
  rating: number | null;
  intensity: number | null;
  morale: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClubhouseReservation {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  reservation_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  created_by: string;
  created_at: string;
  creator?: Pick<Profile, "id" | "first_name" | "last_name" | "avatar_url">;
}
