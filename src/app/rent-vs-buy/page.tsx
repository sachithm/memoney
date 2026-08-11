import RentVsBuyCalculator from "@/components/rent-vs-buy-calculator";

export const metadata = {
  title: "Rent vs Buy Comparison",
  description:
    "Compare net worth of renting and investing vs. buying a property with a mortgage. Vary starting investment, mortgage rate, term, property appreciation, stock returns, and maintenance costs.",
};

export default function RentVsBuyPage() {
  return <RentVsBuyCalculator />;
}
