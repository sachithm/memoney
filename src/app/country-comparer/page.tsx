import CountryComparer from "@/components/country-comparer";

export const metadata = {
  title: "Country Comparer",
  description:
    "Compare the cost of living between two countries. Enter income, tax rate, housing, living and recreational costs, and see how much you'd save each month and year.",
};

export default function CountryComparerPage() {
  return <CountryComparer />;
}
