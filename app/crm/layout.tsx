import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prompt CRM",
  description: "Sales pipeline & deal management",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen w-screen overflow-hidden bg-slate-50">{children}</div>;
}
