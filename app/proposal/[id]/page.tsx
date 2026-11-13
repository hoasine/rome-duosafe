import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProposalDetail } from "@/components/proposal-detail";

async function ProposalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <ProposalDetail proposalId={BigInt(id)} />;
}

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="shell claim"><p>Loading proposal…</p></main>}>
      <ProposalRoute params={params} />
    </Suspense>
  );
}
