"use client";

import dynamic from "next/dynamic";
import { CardSkeleton } from "@/shared/components/Loading";

const DashboardOverviewClient = dynamic(() => import("./DashboardOverviewClient"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

export default function DashboardOverviewPageClient() {
  return <DashboardOverviewClient />;
}
