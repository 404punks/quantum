import { Suspense } from "react";
import { ProveView } from "@/components/prove-view";

export default function Page() {
  return (
    <Suspense>
      <ProveView />
    </Suspense>
  );
}
