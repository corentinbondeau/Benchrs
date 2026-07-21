export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-royal)] p-4">
      {children}
    </div>
  );
}
