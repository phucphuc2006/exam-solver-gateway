import { NextResponse } from "next/server";
import { getDefaultPricing } from "@/shared/constants/pricing.js";

export async function GET() {
  try {
    const defaultPricing = getDefaultPricing();
    return NextResponse.json(defaultPricing);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch default pricing" },
      { status: 500 },
    );
  }
}
