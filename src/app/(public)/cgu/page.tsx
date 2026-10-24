export const metadata = { title: "Conditions Générales d'Utilisation | Benchrs" };

export default function CGUPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Conditions Générales d&apos;Utilisation</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Objet</h2>
        <p>Les présentes CGU régissent l&apos;utilisation de Benchrs.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Inscription</h2>
        <p>L&apos;utilisateur s&apos;engage à fournir des informations exactes. Pour les mineurs, l&apos;accord d&apos;un représentant légal est requis.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Données personnelles</h2>
        <p>Le traitement est régi par notre <a className="underline" href="/privacy">Politique de confidentialité</a>.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Responsabilité</h2>
        <p>Benchrs est un outil d&apos;organisation ; la responsabilité des décisions sportives/medicales incombe aux encadrants.</p>
      </section>
    </main>
  );
}
