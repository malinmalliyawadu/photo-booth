import { readSnapshot } from "@booth/db";
import { Slideshow } from "@/components/slideshow";

export const dynamic = "force-dynamic";

export default async function SlideshowPage() {
  const snapshot = await readSnapshot();
  return <Slideshow initial={snapshot} />;
}
