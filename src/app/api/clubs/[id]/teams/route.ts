import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clubId = id
  if (!clubId) return NextResponse.json({ teams: [] })
  const url = `https://api-dofa.fff.fr/engagements?structure.id=${encodeURIComponent(clubId)}&itemsPerPage=100`
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/ld+json, application/json",
        "Referer": "https://epreuves.fff.fr/",
      },
      cache: "no-store",
    })
    const ct = res.headers.get("content-type") || ""
    const body = await res.text()
    if (!ct.includes("json") || body.startsWith("<!")) {
      return NextResponse.json({ teams: [] })
    }
    const data = JSON.parse(body) as Record<string, unknown>
    const members = Array.isArray((data as any)["hydra:member"]) ? ((data as any)["hydra:member"] as any[]) : []
    const teams = members
      .map((e: Record<string, any>) => {
        const cp = e.competition?.cp_no
        const cpNo = cp == null || cp === "" ? null : Number(cp)
        return {
          equipe: e.equipe?.nom,
          competition: e.competition?.nom,
          cpNo: Number.isFinite(cpNo) ? cpNo : null,
          saison: e.saison,
          '@id': e['@id'],
        }
      })
      .filter((t: any) => t)
    return NextResponse.json({ teams })
  } catch {
    return NextResponse.json({ teams: [] })
  }
}
