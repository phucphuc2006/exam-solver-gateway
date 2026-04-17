"use client";

import dynamic from "next/dynamic";
import { CardSkeleton } from "@/shared/components/Loading";

const EndpointPageClient = dynamic(() => import("./EndpointPageClient"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

export default function EndpointPageShell() {
  return <EndpointPageClient />;
}
