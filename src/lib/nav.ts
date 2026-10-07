import {
  Home,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  Heart,
  Car,
  ListTodo,
  Vote,
  Image as ImageIcon,
  Bell,
  Dumbbell,
  Medal,
  Trophy,
  Swords,
  Flag,
  GitCompareArrows,
  TrendingDown,
  ClipboardList,
  PartyPopper,
  Flame,
  CalendarClock,
  UserCog,
  Building2,
  MapPin,
  Sofa,
  RefreshCw,
  Newspaper,
  Package,
  Wallet,
  PiggyBank,
  IdCard,
  CalendarRange,
  Clapperboard,
  HandHeart,
  FolderOpen,
  Gavel,
  FileText,
  BookUser,
  Shirt,
  GraduationCap,
  HeartPulse,
  Sparkles,
  Mail,
  Handshake,
  CalendarDays,
  Lightbulb,
  Camera,
  Network,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  coachOnly?: boolean;
  clubOnly?: boolean;
  coachAndClub?: boolean;
  clubTeamOnly?: boolean;
}

/* ─── Espace principal : 5 sections toujours visibles ─── */
export const NAV_SECTIONS: { key: string; title: string; items: NavItem[] }[] = [
  {
    key: "team",
    title: "Équipe",
    items: [
      { key: "medical", href: "/medical", label: "Infirmerie", icon: Heart },
      { key: "carpooling", href: "/carpooling", label: "Covoiturage", icon: Car },
      { key: "attendance", href: "/attendance", label: "Présences", icon: Users },
      { key: "tasks", href: "/tasks", label: "Tâches", icon: ListTodo },
      { key: "polls", href: "/polls", label: "Sondages", icon: Vote },
      { key: "gallery", href: "/gallery", label: "Galerie", icon: ImageIcon },
      { key: "meetings", href: "/meetings", label: "Réunions parents", icon: ClipboardList, coachOnly: true },
      { key: "fin-saison", href: "/fin-saison", label: "Fin de saison", icon: PartyPopper },
    ],
  },
  {
    key: "performance",
    title: "Performance",
    items: [
      { key: "physical", href: "/physical", label: "Prépa physique", icon: Dumbbell, coachOnly: true },
      { key: "tactics", href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
      { key: "championship", href: "/championship", label: "Championnat", icon: Medal },
      { key: "adversaires", href: "/adversaires", label: "Adversaires", icon: Flag },
      { key: "compare", href: "/stats/compare", label: "Comparer", icon: GitCompareArrows, coachOnly: true },
      { key: "drop", href: "/stats/drop", label: "Baisse de forme", icon: TrendingDown, coachOnly: true },
      { key: "trophies", href: "/trophies", label: "Trophées", icon: Trophy },
      { key: "tournament", href: "/tournament", label: "Tournois", icon: Trophy },
      { key: "video-analysis", href: "/video-analysis", label: "Analyse vidéo", icon: Clapperboard },
    ],
  },
  {
    key: "club",
    title: "Club",
    items: [
      { key: "club", href: "/club", label: "Espace club", icon: Building2, clubOnly: true },
      { key: "effectif", href: "/club/effectif", label: "Effectif", icon: Users, coachAndClub: true },
      { key: "sondages", href: "/club/sondages", label: "Sondages club", icon: Vote, clubTeamOnly: true },
      { key: "benevoles", href: "/club/benevoles", label: "Bénévoles", icon: HandHeart, clubTeamOnly: true },
      { key: "documents", href: "/club/documents", label: "Documents & PV", icon: FolderOpen, clubTeamOnly: true },
      { key: "discipline", href: "/club/discipline", label: "Discipline", icon: Gavel, clubOnly: true },
      { key: "rapport", href: "/club/rapport", label: "Rapport de saison", icon: FileText, clubOnly: true },
      { key: "annuaire", href: "/club/annuaire", label: "Annuaire", icon: BookUser, clubOnly: true },
      { key: "terrains", href: "/club/terrains", label: "Terrains", icon: MapPin, clubOnly: true },
      { key: "clubhouse", href: "/club/clubhouse", label: "Club House", icon: Sofa, clubTeamOnly: true },
      { key: "mutations", href: "/club/mutations", label: "Mutations", icon: RefreshCw, clubOnly: true },
      { key: "clubfeed", href: "/club/feed", label: "Fil du club", icon: Newspaper, clubTeamOnly: true },
      { key: "equipment", href: "/club/equipment", label: "Équipements", icon: Shirt, clubTeamOnly: true },
      { key: "bureau", href: "/club/bureau", label: "Réunions du bureau", icon: Users, clubOnly: true },
      { key: "newsletters", href: "/club/newsletters", label: "Newsletters", icon: Mail, clubOnly: true },
      { key: "formations", href: "/club/formations", label: "Diplômes & formations", icon: GraduationCap, clubOnly: true },
      { key: "urgences", href: "/club/urgences", label: "Cahier des urgences", icon: HeartPulse, coachAndClub: true },
      { key: "evenements", href: "/club/evenements", label: "Événementiel", icon: Sparkles, clubTeamOnly: true },
      { key: "partenaires", href: "/club/partenaires", label: "Partenaires", icon: Handshake, clubTeamOnly: true },
      { key: "week-end", href: "/club/week-end", label: "Week-end du club", icon: CalendarDays, clubTeamOnly: true },
      { key: "sante", href: "/club/sante", label: "Santé", icon: HeartPulse, clubTeamOnly: true },
      { key: "idees", href: "/club/idees", label: "Boîte à idées", icon: Lightbulb, clubTeamOnly: true },
      { key: "album", href: "/club/album", label: "Album souvenirs", icon: Camera, clubTeamOnly: true },
      { key: "saison-retro", href: "/club/saison", label: "La saison en chiffres", icon: Trophy, clubTeamOnly: true },
      { key: "categories", href: "/club/categories", label: "Arbre des catégories", icon: Network, clubOnly: true },
      { key: "material", href: "/material", label: "Matériel", icon: Package, coachAndClub: true },
      { key: "licences", href: "/admin/licences", label: "Licences", icon: IdCard, coachAndClub: true },
      { key: "cotisations", href: "/admin/cotisations", label: "Cotisations", icon: Wallet, coachAndClub: true },
      { key: "treasury", href: "/admin/treasury", label: "Trésorerie", icon: PiggyBank, coachAndClub: true },
      { key: "cagnotte", href: "/cagnotte", label: "Cagnottes", icon: PiggyBank, coachOnly: true },
    ],
  },
];

/* ─── Liens secondaires "Encore plus" ─── */
export const MORE_NAV: NavItem[] = [
  { key: "season", href: "/season", label: "Plan de saison", icon: CalendarRange },
  { key: "challenge", href: "/challenge", label: "Défi de la semaine", icon: Flame },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: Bell },
];

/* ─── Espace principal : 5 raccourcis de premier plan ─── */
export const PRIMARY_NAV: NavItem[] = [
  { key: "dashboard", href: "/", label: "Accueil", icon: Home },
  { key: "calendar", href: "/calendar", label: "Agenda", icon: Calendar },
  { key: "roster", href: "/roster", label: "Équipe", icon: Users },
  { key: "stats", href: "/stats", label: "Performance", icon: BarChart3 },
  { key: "chat", href: "/chat", label: "Messages", icon: MessageSquare },
];

/* ─── Admin coach ─── */
export const COACH_ADMIN_NAV: NavItem[] = [
  { key: "admin-players", href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { key: "admin-deadlines", href: "/admin/deadlines", label: "Échéances", icon: CalendarClock },
];

export const COMITE_ONLY_HREFS = new Set([
  "/club",
  "/club/feed",
  "/club/terrains",
  "/club/sondages",
  "/club/benevoles",
  "/club/documents",
  "/club/discipline",
  "/club/rapport",
  "/club/annuaire",
  "/calendar",
  "/roster",
  "/stats",
  "/notifications",
  "/material",
  "/admin/cotisations",
  "/admin/treasury",
  "/admin/licences",
  "/club/effectif",
  "/club/equipment",
  "/club/bureau",
  "/club/newsletters",
  "/club/formations",
  "/club/urgences",
  "/club/evenements",
  "/club/partenaires",
  "/club/week-end",
  "/club/sante",
  "/club/idees",
  "/club/album",
  "/club/saison",
  "/club/categories",
]);

export const CHAT_HREF = "/chat";

export const SETTINGS_HREF = "/settings";
export const TEAM_SETTINGS_HREF = "/settings/team";