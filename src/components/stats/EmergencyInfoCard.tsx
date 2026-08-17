"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Pencil, Phone, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { EmergencyContact } from "@/types";

interface Props {
  playerId: string;
  allergies: string | null;
  licenceNumber: string | null;
  contacts: EmergencyContact[];
  canEdit: boolean;
  onSaved?: (allergies: string | null, licenceNumber: string | null, contacts: EmergencyContact[]) => void;
}

export function EmergencyInfoCard({
  playerId,
  allergies,
  licenceNumber,
  contacts,
  canEdit,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftAllergies, setDraftAllergies] = useState(allergies ?? "");
  const [draftLicence, setDraftLicence] = useState(licenceNumber ?? "");
  const [draftContacts, setDraftContacts] = useState<EmergencyContact[]>(
    contacts.length > 0 ? contacts.map((c) => ({ ...c })) : [{ name: "", phone: "", relation: "" }]
  );

  const hasData = !!allergies || !!licenceNumber || contacts.length > 0;

  function startEditing() {
    setDraftAllergies(allergies ?? "");
    setDraftLicence(licenceNumber ?? "");
    setDraftContacts(contacts.length > 0 ? contacts.map((c) => ({ ...c })) : [{ name: "", phone: "", relation: "" }]);
    setEditing(true);
  }

  async function save() {
    const contactsClean = draftContacts
      .map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), relation: c.relation.trim() }))
      .filter((c) => c.name || c.phone);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_player_emergency", {
        p_player_id: playerId,
        p_allergies: draftAllergies.trim(),
        p_licence_number: draftLicence.trim(),
        p_emergency_contacts: contactsClean as unknown as Record<string, unknown>[],
      });
      if (error) throw error;
      onSaved?.(draftAllergies.trim() || null, draftLicence.trim() || null, contactsClean);
      setEditing(false);
      toast.success("Fiche d'urgence mise à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer la fiche d'urgence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Fiche d&apos;urgence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && canEdit ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Allergies / contre-indications</label>
              <Textarea
                value={draftAllergies}
                onChange={(e) => setDraftAllergies(e.target.value)}
                rows={2}
                placeholder="Ex : allergie aux arachides, asthme…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">N° de licence</label>
              <Input
                value={draftLicence}
                onChange={(e) => setDraftLicence(e.target.value)}
                placeholder="Ex : 12404567890"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contacts d&apos;urgence</label>
              <div className="space-y-2">
                {draftContacts.map((c, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        className="h-8"
                        value={c.name}
                        onChange={(e) =>
                          setDraftContacts((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                        placeholder="Nom"
                      />
                      <Input
                        className="h-8"
                        value={c.relation}
                        onChange={(e) =>
                          setDraftContacts((arr) => arr.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))
                        }
                        placeholder="Lien (père, mère…)"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        className="h-8 flex-1"
                        type="tel"
                        value={c.phone}
                        onChange={(e) =>
                          setDraftContacts((arr) => arr.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))
                        }
                        placeholder="Téléphone"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => setDraftContacts((arr) => arr.filter((_, j) => j !== i))}
                        disabled={draftContacts.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraftContacts((arr) => [...arr, { name: "", phone: "", relation: "" }])}
                  disabled={draftContacts.length >= 4}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un contact
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="bg-[var(--color-primary-blue)] text-white font-semibold"
                onClick={save}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Enregistrer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!hasData && (
              <p className="text-sm text-muted-foreground">
                Aucune information renseignée pour le moment.
              </p>
            )}
            {allergies && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Allergies / contre-indications
                </p>
                <p className="text-sm text-red-800">{allergies}</p>
              </div>
            )}
            {licenceNumber && (
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">N° de licence</p>
                <p className="text-sm font-semibold">{licenceNumber}</p>
              </div>
            )}
            {contacts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Contacts d&apos;urgence</p>
                {contacts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium">{c.name || "Contact"}</p>
                      {c.relation && <p className="text-xs text-muted-foreground">{c.relation}</p>}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline text-xs">
                          {c.phone}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                {hasData ? "Modifier" : "Renseigner"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
