export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 items-center justify-center p-12">
        <div className="text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--gold)] text-[var(--gold-foreground)] font-bold text-3xl mx-auto mb-6">
            SP
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">SportPlus</h1>
          <p className="text-blue-200 text-lg max-w-sm">
            La plateforme de gestion d&apos;équipe de football amateur.
            Simplifiez la vie de votre club.
          </p>
          <div className="mt-8 flex items-center justify-center gap-8 text-blue-300">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">⚽</div>
              <div className="text-sm mt-1">Matchs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">📊</div>
              <div className="text-sm mt-1">Stats</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">💬</div>
              <div className="text-sm mt-1">Chat</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}
