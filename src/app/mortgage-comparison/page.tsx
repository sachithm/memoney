import MortgageComparisonCalculator from "@/components/mortgage-comparison-calculator";

export const metadata = {
  title: "Mortgage Comparison Calculator",
  description:
    "Compare the value of keeping an investment vs. using it as a deposit toward a leveraged property. See how mortgage interest rate and property appreciation affect your wealth over time.",
};

export default function MortgageComparisonPage() {
  return <MortgageComparisonCalculator />;
}
