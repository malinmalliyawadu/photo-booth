import { readSnapshot } from "@booth/db";
import { Kiosk } from "@/components/kiosk/kiosk";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const snapshot = await readSnapshot();
  return <Kiosk initial={snapshot} />;
}
