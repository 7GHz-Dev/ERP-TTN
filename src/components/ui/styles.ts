import clsx from "clsx";

export const btn = {
  base: "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap",
  size: { sm: "h-8 px-2.5", md: "h-10 px-3.5", lg: "h-11 px-4 text-base" },
  tone: {
    primary: "bg-blue-800 text-white hover:bg-blue-900 shadow-sm",
    accent: "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-sm",
    secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    danger: "bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50",
  },
};

export function button(tone: keyof typeof btn.tone = "secondary", size: keyof typeof btn.size = "md", extra?: string) {
  return clsx(btn.base, btn.size[size], btn.tone[tone], extra);
}

export const input =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-700 focus:outline-none sm:text-sm disabled:bg-slate-50 disabled:text-slate-500";

export const label = "mb-1 block text-sm font-medium text-slate-700";
