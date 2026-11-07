import AppShell from "@/components/AppShell";

// Todas las páginas dentro de (app) comparten este menú.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
