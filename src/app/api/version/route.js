import { getVersionStatus } from "@/lib/versionStatus";

export async function GET() {
  return Response.json(await getVersionStatus());
}
