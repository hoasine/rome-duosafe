import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SafeDetail } from "@/components/safe-detail";

async function SafeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <SafeDetail safeId={BigInt(id)} />;
}

export default function SafePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="shell claim"><p>Loading safe…</p></main>}>
      <SafeRoute params={params} />
    </Suspense>
  );
}
