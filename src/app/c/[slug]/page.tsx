"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Phone, Mail, MapPin, Shield, Users } from "lucide-react";
import { toast } from "sonner";

interface ClubPublic {
  id: string;
  name: string;
  fff_number?: string | null;
  description?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  public_slug?: string | null;
  is_public: boolean;
}

export default function PublicClubPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const router = useRouter();
  const [club, setClub] = useState<ClubPublic | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    player_first_name: "",
    player_last_name: "",
    birth_date: "",
    position: "",
    parent_name: "",
    parent_email: "",
    parent_phone: "",
    message: "",
  });

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: clubRow } = await supabase
        .from("clubs")
        .select("*")
        .eq("public_slug", slug)
        .eq("is_public", true)
        .maybeSingle();
      if (!clubRow) {
        setLoading(false);
        return;
      }
      setClub(clubRow as ClubPublic);
      const { data: teamsRow } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubRow.id)
        .order("name");
      setTeams((teamsRow || []) as { id: string; name: string }[]);
      setLoading(false);
    })();
  }, [slug]);

  async function submit() {
    if (!form.player_first_name.trim() || !form.player_last_name.trim()) {
      toast.error("Prénom et nom du joueur requis");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("trial_requests").insert({
        club_id: club!.id,
        player_first_name: form.player_first_name.trim(),
        player_last_name: form.player_last_name.trim(),
        birth_date: form.birth_date || null,
        position: form.position.trim() || null,
        parent_name: form.parent_name.trim() || null,
        parent_email: form.parent_email.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
        message: form.message.trim() || null,
      });
      if (error) throw error;
      toast.success("Demande envoyée ! Le club vous recontactera rapidement.");
      setForm({
        player_first_name: "",
        player_last_name: "",
        birth_date: "",
        position: "",
        parent_name: "",
        parent_email: "",
        parent_phone: "",
        message: "",
      });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!club) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-4 text-center">
        <p className="text-muted-foreground">Ce club n&apos;a pas de page publique ou le lien est invalide.</p>
        <Button size="sm" variant="outline" onClick={() => router.push("/login")}>Retour à l&apos;accueil</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-navy)] pb-16">
      <div className="bg-[var(--color-navy)] px-4 py-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80">
          <Shield className="h-3.5 w-3.5" />
          Club de football{club.fff_number ? ` · n°${club.fff_number}` : ""}
        </div>
        <h1 className="mt-3 text-3xl font-bold text-white">{club.name}</h1>
        {club.description && <p className="mx-auto mt-3 max-w-md text-sm text-white/70">{club.description}</p>}
        {(club.contact_email || club.contact_phone) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-white/80">
            {club.contact_phone && (
              <a href={`tel:${club.contact_phone}`} className="flex items-center gap-1.5 hover:text-white">
                <Phone className="h-3.5 w-3.5" /> {club.contact_phone}
              </a>
            )}
            {club.contact_email && (
              <a href={`mailto:${club.contact_email}`} className="flex items-center gap-1.5 hover:text-white">
                <Mail className="h-3.5 w-3.5" /> {club.contact_email}
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-6">
        {teams.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--color-gold)]" />
                Nos équipes
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <span key={t.id} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{t.name}</span>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Demander un essai</CardTitle>
            <CardDescription>Remplissez ce formulaire, l&apos;équipe dirigeante vous recontactera pour organiser un entraînement d&apos;essai.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Prénom du joueur *</Label>
                <Input className="text-sm mt-1" value={form.player_first_name} onChange={(e) => setForm({ ...form, player_first_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Nom du joueur *</Label>
                <Input className="text-sm mt-1" value={form.player_last_name} onChange={(e) => setForm({ ...form, player_last_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Date de naissance</Label>
                <Input type="date" className="text-sm mt-1" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Poste préféré</Label>
                <Input className="text-sm mt-1" placeholder="Ex: attaquant" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Parent responsable</Label>
              <Input className="text-sm mt-1" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" className="text-sm mt-1" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Téléphone</Label>
                <Input className="text-sm mt-1" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea className="text-sm mt-1" rows={3} placeholder="Année d'expérience, clubs précédents, disponibilités..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <Button className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Envoyer ma demande
            </Button>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1 text-center text-xs text-white/40">
          <MapPin className="h-3 w-3" /> Proposé par Benchrs
        </p>
      </div>
    </div>
  );
}
