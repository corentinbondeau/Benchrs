export const metadata = { title: "Mentions légales | Benchrs" };

export default function MentionsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Mentions légales</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Éditeur</h2>
        <p>Application Benchrs — outil de gestion d&apos;équipe sportive.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hébergement</h2>
        <p>Vercel Inc. et Supabase Inc.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Propriété intellectuelle</h2>
        <p>Tous les contenus sont protégés par le droit d&apos;auteur.</p>
      </section>
    </main>
  );
}
