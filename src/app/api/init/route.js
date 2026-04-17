export async function GET() {
  const [{ ensureAppInitialized }, { ensureOutboundProxyInitialized }, { initConsoleLogCapture }] = await Promise.all([
    import("@/lib/initCloudSync"),
    import("@/lib/network/initOutboundProxy"),
    import("@/lib/consoleLogBuffer"),
  ]);

  initConsoleLogCapture();
  await Promise.all([
    ensureAppInitialized(),
    ensureOutboundProxyInitialized(),
  ]);

  return new Response("Initialized", { status: 200 });
}
