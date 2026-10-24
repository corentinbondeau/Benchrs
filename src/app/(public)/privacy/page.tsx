export const metadata = { title: "Politique de confidentialité | Benchrs" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Politique de confidentialité</h1>
      <p className="text-muted-foreground">Dernière mise à jour : {new Date().toISOString().slice(0, 10)}</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Responsable du traitement</h2>
        <p>Benchrs est responsable du traitement des données personnelles collectées dans le cadre de l&apos;application.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Données collectées</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Identité : nom, prénom, rôle, équipe</li>
          <li>Contact : adresse e-mail, numéro de téléphone</li>
          <li>Sport : poste, numéro de maillot, statistiques, présences</li>
          <li>Santé (sensibles) : allergies, contacts d&apos;urgence, certificat médical (avec consentement explicite)</li>
          <li>Technique : logs de connexion, jetons de session</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Finalités et bases légales</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Gestion de l&apos;équipe (exécution du contrat)</li>
          <li>Sécurité et secours (intérêt légitime / obligation de précaution)</li>
          <li>Communication interne (intérêt légitime)</li>
          <li>Données de santé (consentement explicite)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Destinataires</h2>
        <p>Accès strictement limité aux membres de l&apos;équipe et au comité autorisé. Sous-traitants : Supabase (hébergement/auth/base de données), Vercel (hébergement web), Mistral (génération IA), Open-Meteo/Nominatim (météo/géocodage).</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Droits</h2>
        <p>Conformément au RGPD, vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité. Exercez-les depuis <strong>Paramètres → Mes données</strong> ou par email au responsable du traitement.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">6. Conservation</h2>
        <p>Les données sont conservées pendant la durée d&apos;appartenance à l&apos;équipe. À la suppression du compte ou sur demande, les données sont supprimées ou anonymisées selon notre politique de rétention.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">7. Sécurité</h2>
        <p>Mesures techniques et organisationnelles (RLS, chiffrement en transit/au repos, URLs signées, principe du moindre privilège).</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">8. Mineurs</h2>
        <p>Pour les mineurs de moins de 15 ans, un consentement parental est requis. L&apos;accès se fait via un compte parent ou avec autorisation parentale.</p>
      </section>
    </main>
  );
}
