import { getTrading212DashboardData } from "@/lib/trading212";

export async function GET() {
  const data = await getTrading212DashboardData();
  return Response.json(data);
}
