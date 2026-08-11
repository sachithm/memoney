/**
 * Shared Tailwind class strings for form controls.
 *
 * `balance-form.tsx`, `income-form.tsx`, `expense-form.tsx` and
 * `manual-entries-manager.tsx` all rendered near-identical input styling;
 * centralising it keeps the forms consistent and removes ~8 duplicated
 * class literals from the bundle.
 */

export const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export const SELECT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export const SLIDER_CLASSES =
  "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb";
