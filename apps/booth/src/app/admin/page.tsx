import { readSnapshot } from "@booth/db";
import { AdminPanel } from "@/components/admin/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const snapshot = await readSnapshot();
  return <AdminPanel initial={snapshot} />;
}
