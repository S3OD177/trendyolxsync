import Link from "next/link";
import { requireUserFromServerHeaders } from "@/lib/auth/cloudflare";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/alerts", label: "Alerts" },
  { href: "/settings", label: "Settings" }
];

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserFromServerHeaders();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Trendyol BuyBox Guard</h1>
            <p className="text-xs text-muted-foreground">SAR-only monitoring and manual repricing</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>{user.email}</div>
            <div>Cloudflare Access</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-md border bg-card p-4">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded px-3 py-2 text-sm hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
