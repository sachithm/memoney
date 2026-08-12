import TakeHomeSalaryCalculator from "@/components/take-home-salary-calculator";

export const metadata = {
  title: "Take Home Salary Calculator",
  description:
    "Calculate your net pay after UK Income Tax and National Insurance. Enter your salary in any frequency (hourly, daily, monthly, or annual) and see a full breakdown of tax-free allowances, tax bands, and NIC deductions.",
};

export default function TakeHomeSalaryPage() {
  return <TakeHomeSalaryCalculator />;
}
