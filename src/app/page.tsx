import Link from "next/link";

export const metadata = {
  title: "memoney",
  description:
    "Personal finance calculators and tools. Track your net worth, compare rent vs buy, and model compound interest.",
};

/** A single card in the Financial Tools grid. */
interface ToolCard {
  title: string;
  description: string;
  href: string;
}

const TOOLS: ToolCard[] = [
  {
    title: "Net worth tracker",
    description:
      "Connect your banks and Trading 212, or add balances by hand. See your net worth, assets vs. liabilities, income and expenses, and how they grow over time.",
    href: "/net-worth-tracker",
  },
  {
    title: "Compound Interest Calculator",
    description:
      "Visualize how compound interest grows your investments over time. Plot invested contributions vs. interest earned with a line chart.",
    href: "/compound-interest",
  },
  {
    title: "Mortgage Comparison Calculator",
    description:
      "Compare keeping your deposit invested vs. using it as a deposit on a leveraged property. See how mortgage rate and property appreciation affect your wealth over time.",
    href: "/mortgage-comparison",
  },
  {
    title: "Rent vs Buy Comparison",
    description:
      "Compare your net worth if you rent and invest vs. buy with a mortgage and invest the rest. See how rates, appreciation, and maintenance costs affect which strategy wins.",
    href: "/rent-vs-buy",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">memoney</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personal finance calculators and tools.
          </p>
        </div>
      </header>

      {/* Financial Tools */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Financial Tools
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <div
              key={tool.href}
              className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {tool.title}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{tool.description}</p>
              <Link
                href={tool.href}
                className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
              >
                Open →
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
