import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
  try {
    const u = new URL(url)
    if (u.hostname !== "api-dofa.fff.fr" && u.hostname !== "epreuves.fff.fr") {
      return NextResponse.json({ error: "invalid host" }, { status: 403 })
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/ld+json, application/json, text/plain, */*",
        "Referer": u.hostname === "epreuves.fff.fr" ? "https://epreuves.fff.fr/" : "https://epreuves.fff.fr/",
        "Origin": "https://epreuves.fff.fr",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
      },
      redirect: "follow",
      cache: "no-store",
    })
    const ct = res.headers.get("content-type") || "application/json"
    const body = await res.text()
    // If Akamai returns HTML, pass through but client will see HTML - better to detect
    if (res.ok && ct.includes("text/html") && body.includes("Fédération française de football")) {
      // Try to detect if it's an error page - return 502 so client shows appropriate message
      return NextResponse.json({ error: "upstream blocked" }, { status: 502 })
    }
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": ct, "cache-control": "no-store" },
    })
  } catch (e) {
    return NextResponse.json({ error: "proxy failed" }, { status: 500 })
  }
}
