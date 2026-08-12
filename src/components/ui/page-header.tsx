import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
}

/**
 * Shared page header: a pinned title with a "← Back to Dashboard" link.
 *
 * Used by the calculator pages (compound-interest, mortgage-comparison,
 * rent-vs-buy). Extracts the layout that was previously duplicated verbatim
 * across those routes.
 */
export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            ← Back to Dashboard
          </Link>
        </div>
        {description && (
          <p className="text-sm text-gray-600 mt-2 max-w-3xl">{description}</p>
        )}
      </div>
    </header>
  );
}
