import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  redirect(`/markets/${encodeURIComponent(`${decodeURIComponent(fixtureId)}:match_winner`)}`);
}
