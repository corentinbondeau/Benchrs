import { NextResponse } from "next/server";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";
import { registerUser } from "@/lib/auth/register";

export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:register:${clientKey(req)}`, AUTH_LIMIT)) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez dans une minute" },
        { status: 429 }
      );
    }

    const { email, password, firstName, lastName, role, phone } =
      await req.json();

    const result = await registerUser({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Inscription invalide" },
        { status: result.status ?? 400 }
      );
    }

    return NextResponse.json({
      user: result.user,
      message: "Compte cree avec succes",
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
