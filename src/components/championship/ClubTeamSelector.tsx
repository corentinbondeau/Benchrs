"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search } from "lucide-react"

interface Club {
  id: string | number
  nom?: string
  ville?: string
  code?: string
  departement?: string
  ligue?: string
}

interface Team {
  equipe?: string
  competition?: string
  cpNo: number | null
  saison?: string
}

interface Selected {
  club: Club
  team: Team
}

interface Props {
  onSelect: (sel: Selected) => void
}

export function ClubTeamSelector({ onSelect }: Props) {
  const [q, setQ] = useState("")
  const [clubs, setClubs] = useState<Club[]>([])
  const [loadingClubs, setLoadingClubs] = useState(false)
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const searchAbortRef = useRef(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setClubs([])
      return
    }
    searchAbortRef.current = false
    const t = setTimeout(async () => {
      setLoadingClubs(true)
      try {
        const res = await fetch(`/api/clubs/search?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        if (searchAbortRef.current) return
        setClubs(Array.isArray(data) ? data : [])
      } catch {
        if (searchAbortRef.current) return
        setClubs([])
      } finally {
        if (searchAbortRef.current) return
        setLoadingClubs(false)
      }
    }, 300)
    const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const comp = t.competition || ""
    let group = "Autres"
    if (/senior/i.test(comp) || /elite|national|regional|district.*senior/i.test(comp)) group = "Seniors"
    else if (/feminin|dame|f\s/i.test(comp)) group = "Féminines"
    else if (/u19|u18|u17|u16|u15|u14|u13|u12|u11|jeune|junior|cadet|minime|benjamin|poussin|baby|mois|echelon/i.test(comp)) group = "Jeunes"
    else if (/veteran|vétéran/i.test(comp)) group = "Vétérans"
    acc[group] = acc[group] || []
    acc[group].push(t)
    return acc
  }, {})

  const order = ["Seniors", "Féminines", "Jeunes", "Vétérans", "Autres"]
  const groups = order.filter((g) => grouped[g]?.length > 0)


  return () => {
      clearTimeout(t)
      searchAbortRef.current = true
    }
  }, [q])

  useEffect(() => {
    if (!selectedClub) return
    let cancelled = false
    setLoadingTeams(true)
    setSelectedTeam(null)
    fetch(`/api/clubs/${selectedClub.id}/teams`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setTeams(Array.isArray(d.teams) ? d.teams : [])
      })
      .catch(() => {
        if (cancelled) return
        setTeams([])
      })
      .finally(() => {
        if (cancelled) return
        setLoadingTeams(false)
      })
    const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const comp = t.competition || ""
    let group = "Autres"
    if (/senior/i.test(comp) || /elite|national|regional|district.*senior/i.test(comp)) group = "Seniors"
    else if (/feminin|dame|f\s/i.test(comp)) group = "Féminines"
    else if (/u19|u18|u17|u16|u15|u14|u13|u12|u11|jeune|junior|cadet|minime|benjamin|poussin|baby|mois|echelon/i.test(comp)) group = "Jeunes"
    else if (/veteran|vétéran/i.test(comp)) group = "Vétérans"
    acc[group] = acc[group] || []
    acc[group].push(t)
    return acc
  }, {})

  const order = ["Seniors", "Féminines", "Jeunes", "Vétérans", "Autres"]
  const groups = order.filter((g) => grouped[g]?.length > 0)


  return () => {
      cancelled = true
    }
  }, [selectedClub])

  function handleImport() {
    if (!selectedClub || !selectedTeam) return
    onSelect({ club: selectedClub, team: selectedTeam })
  }

  const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const comp = t.competition || ""
    let group = "Autres"
    if (/senior/i.test(comp) || /elite|national|regional|district.*senior/i.test(comp)) group = "Seniors"
    else if (/feminin|dame|f\s/i.test(comp)) group = "Féminines"
    else if (/u19|u18|u17|u16|u15|u14|u13|u12|u11|jeune|junior|cadet|minime|benjamin|poussin|baby|mois|echelon/i.test(comp)) group = "Jeunes"
    else if (/veteran|vétéran/i.test(comp)) group = "Vétérans"
    acc[group] = acc[group] || []
    acc[group].push(t)
    return acc
  }, {})

  const order = ["Seniors", "Féminines", "Jeunes", "Vétérans", "Autres"]
  const groups = order.filter((g) => grouped[g]?.length > 0)


  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un club français (ex: Camphin, Lille)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>

      {loadingClubs && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche des clubs...
        </div>
      )}

      {!selectedClub && clubs.length > 0 && (
        <div className="grid gap-2">
          {clubs.map((c, i) => (
            <Card key={`${c.id}-${i}`} className="cursor-pointer hover:border-primary" onClick={() => setSelectedClub(c)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.nom || "Sans nom"}</p>
                  {c.code && <Badge variant="secondary">{c.code}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[c.ville, c.departement, c.ligue].filter(Boolean).join(" • ")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedClub && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selectedClub.nom}</p>
              <p className="text-sm text-muted-foreground">{selectedClub.ville}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedClub(null)}>
              Changer de club
            </Button>
          </div>

          {loadingTeams && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des catégories...
            </div>
          )}

          {!loadingTeams && teams.length > 0 && (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g} className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{g}</p>
                  <div className="grid gap-2">
                    {grouped[g].map((t, i) => {
                      const active = selectedTeam === t
                      const grouped = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const comp = t.competition || ""
    let group = "Autres"
    if (/senior/i.test(comp) || /elite|national|regional|district.*senior/i.test(comp)) group = "Seniors"
    else if (/feminin|dame|f\s/i.test(comp)) group = "Féminines"
    else if (/u19|u18|u17|u16|u15|u14|u13|u12|u11|jeune|junior|cadet|minime|benjamin|poussin|baby|mois|echelon/i.test(comp)) group = "Jeunes"
    else if (/veteran|vétéran/i.test(comp)) group = "Vétérans"
    acc[group] = acc[group] || []
    acc[group].push(t)
    return acc
  }, {})

  const order = ["Seniors", "Féminines", "Jeunes", "Vétérans", "Autres"]
  const groups = order.filter((g) => grouped[g]?.length > 0)


  return (
                        <Card key={`${g}-${i}`} className={`cursor-pointer transition ${active ? "border-primary" : "hover:border-primary/60"}`} onClick={() => setSelectedTeam(t)}>
                          <CardContent className="flex flex-col gap-1 p-3">
                            <p className="font-medium">{t.equipe || "Équipe"}</p>
                            <p className="text-sm text-muted-foreground">{t.competition}</p>
                            {t.cpNo != null && <Badge variant="outline" className="w-fit mt-1">cp_no {t.cpNo}</Badge>}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingTeams && teams.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune équipe trouvée pour ce club.</p>
          )}

          <Button onClick={handleImport} disabled={!selectedTeam} className="w-full">
            Importer ce championnat
          </Button>
        </div>
      )}
    </div>
  )
}
