export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      {children}
    </div>
  );
}
