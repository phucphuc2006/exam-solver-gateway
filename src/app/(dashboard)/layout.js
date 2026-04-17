import DashboardLayout from "@/shared/components/layouts/DashboardLayout";

export default async function DashboardRootLayout({ children }) {
  let initialSidebarData = null;

  try {
    const { getSidebarBootstrapData } = await import("@/lib/dashboardBootstrap");
    initialSidebarData = await getSidebarBootstrapData();
  } catch {
    initialSidebarData = null;
  }

  return (
    <DashboardLayout initialSidebarData={initialSidebarData}>
      {children}
    </DashboardLayout>
  );
}

