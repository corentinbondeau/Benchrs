"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PouleRefSelect {
  cpNo: number
  phase: number
  poule: number
}

interface ClubSearchDialogProps {
  children: React.ReactNode
  onSelect: (ref: PouleRefSelect) => void
}

interface ClubItem {
  "@id"?: string
  id?: number | string
  nom?: string
  ville?: string
  departement?: string
  ligue?: string
  code?: string
}

interface EngagementItem {
  "@id"?: string
  equipe?: { nom?: string }
  competition?: { cp_no?: number | string; nom?: string }
  saison?: string
  phaseActuelle?: unknown
}

interface PhaseItem {
  "@id"?: string
  number?: number | string
  libelle?: string
}

interface PouleItem {
  "@id"?: string
  stage_number?: number | string
  libelle?: string
}

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function extractClubId(c: ClubItem): string | number | null {
  if (c.id != null && c.id !== "") return c.id
  if (c["@id"]) {
    const m = c["@id"].match(/\/clubs\/(\d+)$/)
    if (m?.[1]) return Number(m[1])
  }
  return null
}

function extractEngagementCompetitionCpNo(e: EngagementItem): number | null {
  const v = e.competition?.cp_no
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function ClubSearchDialog({ children, onSelect }: ClubSearchDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"search" | "engagements" | "poules">("search")

  const [search, setSearch] = useState("")
  const q = useDebounce(search, 350)
  const [clubs, setClubs] = useState<ClubItem[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)
  const [clubsError, setClubsError] = useState<string | null>(null)
  const [selectedClub, setSelectedClub] = useState<ClubItem | null>(null)
  const clubsAbort = useRef<AbortController | null>(null)

  const [engagements, setEngagements] = useState<EngagementItem[]>([])
  const [engLoading, setEngLoading] = useState(false)
  const [engError, setEngError] = useState<string | null>(null)
  const [selectedEng, setSelectedEng] = useState<EngagementItem | null>(null)
  const engAbort = useRef<AbortController | null>(null)

  const [phases, setPhases] = useState<PhaseItem[]>([])
  const [poules, setPoules] = useState<PouleItem[]>([])
  const [phaseLoading, setPhaseLoading] = useState(false)
  const [phaseError, setPhaseError] = useState<string | null>(null)
  const [selectedPhase, setSelectedPhase] = useState<PhaseItem | null>(null)
  const [selectedPoule, setSelectedPoule] = useState<PouleItem | null>(null)
  const phaseAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    if (q.trim().length < 3) {
      setClubs([])
      setClubsError(null)
      setClubsLoading(false)
      return
    }
    clubsAbort.current?.abort()
    const ac = new AbortController()
    clubsAbort.current = ac
    setClubsLoading(true)
    setClubsError(null)
    fetch(`https://api-dofa.fff.fr/clubs?search=${encodeURIComponent(q.trim())}&itemsPerPage=20`, {
      headers: { Accept: "application/ld+json, application/json" },
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const list = Array.isArray((data as any)?.["hydra:member"]) ? ((data as any)["hydra:member"] as ClubItem[]) : []
        setClubs(list)
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return
        setClubsError("Impossible de récupérer la liste des clubs")
        setClubs([])
      })
      .finally(() => setClubsLoading(false))
    return () => ac.abort()
  }, [open, q])

  useEffect(() => {
    if (step !== "engagements" || !selectedClub) return
    const cid = extractClubId(selectedClub)
    if (cid == null) return
    engAbort.current?.abort()
    const ac = new AbortController()
    engAbort.current = ac
    setEngLoading(true)
    setEngError(null)
    setSelectedEng(null)
    fetch(`https://api-dofa.fff.fr/engagements?structure.id=${encodeURIComponent(String(cid))}&itemsPerPage=50`, {
      headers: { Accept: "application/ld+json, application/json" },
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const list = Array.isArray((data as any)?.["hydra:member"]) ? ((data as any)["hydra:member"] as EngagementItem[]) : []
        setEngagements(list)
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return
        setEngError("Impossible de récupérer les engagements de ce club")
        setEngagements([])
      })
      .finally(() => setEngLoading(false))
    return () => ac.abort()
  }, [step, selectedClub])

  useEffect(() => {
    if (step !== "poules") return
    const cpNo = selectedEng ? extractEngagementCompetitionCpNo(selectedEng) : null
    if (cpNo == null) return
    phaseAbort.current?.abort()
    const ac = new AbortController()
    phaseAbort.current = ac
    setPhaseLoading(true)
    setPhaseError(null)
    setPhases([])
    setPoules([])
    setSelectedPhase(null)
    setSelectedPoule(null)
    fetch(`https://api-dofa.fff.fr/competitions/${cpNo}/phases?itemsPerPage=50`, {
      headers: { Accept: "application/ld+json, application/json" },
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const list = Array.isArray((data as any)?.["hydra:member"]) ? ((data as any)["hydra:member"] as PhaseItem[]) : []
        setPhases(list)
        if (list.length === 1) setSelectedPhase(list[0])
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return
        setPhaseError("Impossible de récupérer les phases/poules")
      })
      .finally(() => setPhaseLoading(false))
    return () => ac.abort()
  }, [step, selectedEng])

  useEffect(() => {
    if (step !== "poules" || !selectedPhase) return
    const pid = selectedPhase["@id"]
    let url: string | null = null
    if (pid) {
      const m = pid.match(/\/phases\/(\d+)$/)
      if (m?.[1]) url = `https://api-dofa.fff.fr/phases/${m[1]}/poules?itemsPerPage=50`
    }
    if (!url) return
    const ac = new AbortController()
    phaseAbort.current = ac
    setPhaseLoading(true)
    setPhaseError(null)
    setPoules([])
    setSelectedPoule(null)
    fetch(url, {
      headers: { Accept: "application/ld+json, application/json" },
      signal: ac.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const list = Array.isArray((data as any)?.["hydra:member"]) ? ((data as any)["hydra:member"] as PouleItem[]) : []
        setPoules(list)
        if (list.length === 1) setSelectedPoule(list[0])
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return
        setPhaseError("Impossible de récupérer les poules")
      })
      .finally(() => setPhaseLoading(false))
    return () => ac.abort()
  }, [step, selectedPhase])

  const canValidate = useMemo(() => {
    if (step !== "poules") return false
    const cpNo = selectedEng ? extractEngagementCompetitionCpNo(selectedEng) : null
    const phaseN = selectedPhase?.number != null ? Number(selectedPhase.number) : null
    const pouleN = selectedPoule?.stage_number != null ? Number(selectedPoule.stage_number) : null
    return cpNo != null && phaseN != null && pouleN != null && Number.isFinite(cpNo) && Number.isFinite(phaseN) && Number.isFinite(pouleN)
  }, [step, selectedEng, selectedPhase, selectedPoule])

  function resetAll() {
    setStep("search")
    setSearch("")
    setClubs([])
    setSelectedClub(null)
    setEngagements([])
    setSelectedEng(null)
    setPhases([])
    setPoules([])
    setSelectedPhase(null)
    setSelectedPoule(null)
    setClubsError(null)
    setEngError(null)
    setPhaseError(null)
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) resetAll()
  }

  function goToEng() {
    if (!selectedClub) return
    setStep("engagements")
    setEngagements([])
    setSelectedEng(null)
  }

  function goToPoules() {
    if (!selectedEng) return
    setStep("poules")
    setPhases([])
    setPoules([])
    setSelectedPhase(null)
    setSelectedPoule(null)
  }

  function validate() {
    const cpNo = selectedEng ? extractEngagementCompetitionCpNo(selectedEng) : null
    const phaseN = selectedPhase?.number != null ? Number(selectedPhase.number) : null
    const pouleN = selectedPoule?.stage_number != null ? Number(selectedPoule.stage_number) : null
    if (cpNo == null || phaseN == null || pouleN == null) return
    onSelect({ cpNo, phase: phaseN, poule: pouleN })
    setOpen(false)
    resetAll()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Rechercher un club FFF</DialogTitle>
          <DialogDescription>
            Sélectionnez le club → l’équipe/championnat → la phase/poule pour pré-remplir automatiquement le triplet.
          </DialogDescription>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nom du club (minimum 3 caractères)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              {search && (
                <Button variant="ghost" size="icon" onClick={() => setSearch("")} aria-label="Effacer">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {clubsLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Recherche en cours…
              </div>
            )}
            {clubsError && <p className="text-sm text-destructive">{clubsError}</p>}
            {!clubsLoading && !clubsError && q.trim().length >= 3 && clubs.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun club trouvé pour « {q.trim()} »</p>
            )}
            <div className="grid max-h-[420px] gap-2 overflow-y-auto">
              {clubs.map((c, i) => {
                const cid = extractClubId(c)
                const selected = selectedClub === c
                return (
                  <Card
                    key={`${cid ?? i}-${c.nom}`}
                    className={cn("cursor-pointer transition hover:border-primary", selected && "border-primary")}
                    onClick={() => setSelectedClub(c)}
                  >
                    <CardContent className="flex flex-col gap-1 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{c.nom || "Sans nom"}</p>
                        {c.code && <Badge variant="secondary">{c.code}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[c.ville, c.departement, c.ligue].filter(Boolean).join(" • ")}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {step === "engagements" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("search")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Retour aux clubs
              </Button>
              <p className="text-sm text-muted-foreground truncate max-w-[400px]">{selectedClub?.nom}</p>
            </div>
            {engLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des engagements…
              </div>
            )}
            {engError && <p className="text-sm text-destructive">{engError}</p>}
            {!engLoading && !engError && engagements.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun engagement trouvé pour ce club.</p>
            )}
            <div className="grid max-h-[420px] gap-2 overflow-y-auto">
              {engagements.map((e, i) => {
                const cp = extractEngagementCompetitionCpNo(e)
                const selected = selectedEng === e
                return (
                  <Card
                    key={`${cp ?? i}-${e.competition?.nom}`}
                    className={cn("cursor-pointer transition hover:border-primary", selected && "border-primary")}
                    onClick={() => setSelectedEng(e)}
                  >
                    <CardContent className="flex flex-col gap-1 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">
                          {e.equipe?.nom || "Équipe"} — {e.competition?.nom || "Championnat"}
                        </p>
                        {cp != null && <Badge variant="outline">cp_no {cp}</Badge>}
                      </div>
                      {e.saison && <p className="text-sm text-muted-foreground">Saison {e.saison}</p>}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {step === "poules" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("engagements")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Retour aux engagements
              </Button>
              <p className="text-sm text-muted-foreground truncate max-w-[420px]">
                {selectedClub?.nom} • {selectedEng?.equipe?.nom} — {selectedEng?.competition?.nom}
              </p>
            </div>
            {phaseLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des phases/poules…
              </div>
            )}
            {phaseError && <p className="text-sm text-destructive">{phaseError}</p>}
            {!phaseLoading && phases.length > 0 && (
              <div className="space-y-2">
                <Label>Phase</Label>
                <div className="flex flex-wrap gap-2">
                  {phases.map((ph, i) => {
                    const pn = ph.number != null ? Number(ph.number) : i + 1
                    const selected = selectedPhase === ph
                    return (
                      <Button key={ph["@id"] ?? pn} type="button" variant={selected ? "default" : "outline"} size="sm" onClick={() => setSelectedPhase(ph)}>
                        Phase {pn}
                        {ph.libelle ? ` — ${ph.libelle}` : ""}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}
            {selectedPhase && poules.length > 0 && (
              <div className="space-y-2">
                <Label>Poule</Label>
                <div className="flex flex-wrap gap-2">
                  {poules.map((pl, i) => {
                    const pnn = pl.stage_number != null ? Number(pl.stage_number) : i + 1
                    const selected = selectedPoule === pl
                    return (
                      <Button key={pl["@id"] ?? pnn} type="button" variant={selected ? "default" : "outline"} size="sm" onClick={() => setSelectedPoule(pl)}>
                        Poule {pnn}
                        {pl.libelle ? ` — ${pl.libelle}` : ""}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}
            {!phaseLoading && selectedPhase && poules.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune poule trouvée pour cette phase.</p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
            {step === "search" && (
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Annuler
              </Button>
            )}
            {step === "engagements" && (
              <Button variant="ghost" size="sm" onClick={() => setStep("search")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
              </Button>
            )}
            {step === "poules" && (
              <Button variant="ghost" size="sm" onClick={() => setStep("engagements")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
              </Button>
            )}
            <div className="flex gap-2">
              {step === "search" && selectedClub && (
                <Button size="sm" onClick={goToEng}>
                  Suivant
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {step === "engagements" && selectedEng && (
                <Button size="sm" onClick={goToPoules}>
                  Suivant
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {step === "poules" && (
                <Button size="sm" disabled={!canValidate} onClick={validate}>
                  Utiliser cette poule
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
