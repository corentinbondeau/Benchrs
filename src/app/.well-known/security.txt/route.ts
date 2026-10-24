import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const content = `Contact: security@benchrs.fr
Expires: 2027-10-24T00:00:00.000Z
Preferred-Languages: fr, en
Canonical: https://benchrs.fr/.well-known/security.txt
Policy: https://benchrs.fr/privacy
`;
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
