import { Suspense } from "react";
import { CoinSkeleton, CoinView } from "@/components/coin-view";

// Reading params is request-time data; resolve it inside Suspense so navigation stays instant.
export default function Page({ params }: PageProps<"/coin/[mint]">) {
  return (
    <Suspense fallback={<CoinSkeleton />}>
      <Coin params={params} />
    </Suspense>
  );
}

async function Coin({ params }: { params: PageProps<"/coin/[mint]">["params"] }) {
  const { mint } = await params;
  return <CoinView mint={mint} />;
}
