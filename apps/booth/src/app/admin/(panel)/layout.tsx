import { readSnapshot } from "@booth/db";
import { AdminShell } from "@/components/admin/shell";

// Read per request: the snapshot is the first thing the attendant sees,
// and the stream takes over from there, across every tab.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await readSnapshot();
  return <AdminShell initial={snapshot}>{children}</AdminShell>;
}
