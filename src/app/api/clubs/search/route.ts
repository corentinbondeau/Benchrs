import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || ""
  if (!q.trim()) return NextResponse.json([])
  const url = `https://api-dofa.fff.fr/clubs?search=${encodeURIComponent(q)}&itemsPerPage=20`
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
      return NextResponse.json([])
    }
    const data = JSON.parse(body) as { ["hydra:member"]?: unknown[] }
    const members = Array.isArray(data["hydra:member"]) ? (data["hydra:member"] as any[]) : []
    return NextResponse.json(
      members.map((c: Record<string, any>) => ({
        id: c.id || c["@id"]?.match(/\/clubs\/(\d+)$/)?.[1],
        nom: c.nom,
        ville: c.ville,
        code: c.code,
        departement: c.departement,
        ligue: c.ligue,
        '@id': c['@id'],
      }))
    )
  } catch {
    return NextResponse.json([])
  }
}
