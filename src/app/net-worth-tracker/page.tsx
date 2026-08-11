import { getInitialData } from "@/lib/dashboard-data";
import DashboardClient from "@/components/dashboard-client";

export const metadata = {
  title: "memoney — Net worth tracker",
  description:
    "Track your net worth over time with bank connections, Trading 212 holdings, and manual entries.",
};

export default async function NetWorthTrackerPage() {
  const data = await getInitialData();
  return <DashboardClient initialData={data} />;
}
