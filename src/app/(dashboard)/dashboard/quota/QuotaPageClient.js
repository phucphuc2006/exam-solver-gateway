"use client";

import dynamic from "next/dynamic";
import { CardSkeleton } from "@/shared/components/Loading";

const ProviderLimits = dynamic(() => import("../usage/components/ProviderLimits"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

export default function QuotaPageClient() {
  return <ProviderLimits />;
}
