export const metadata = { title: "RGPD | Benchrs" };

export default function RGPDPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Informations RGPD</h1>
      <ul className="list-disc pl-6 space-y-2">
        <li><a className="underline" href="/privacy">Politique de confidentialité</a></li>
        <li><a className="underline" href="/mentions-legales">Mentions légales</a></li>
        <li><a className="underline" href="/cgu">CGU</a></li>
        <li>Exercer vos droits : <a className="underline" href="/settings">Paramètres &gt; Mes données</a></li>
      </ul>
    </main>
  );
}
