import { Suspense } from "react";
import { CoinSkeleton, CoinView } from "@/components/coin-view";

/** Quantum launches: same page, its own address. */
export default function Page({ params }: PageProps<"/coin/q/[mint]">) {
  return (
    <Suspense fallback={<CoinSkeleton />}>
      <Coin params={params} />
    </Suspense>
  );
}

async function Coin({ params }: { params: PageProps<"/coin/q/[mint]">["params"] }) {
  const { mint } = await params;
  return <CoinView mint={mint} quantumRoute />;
}
