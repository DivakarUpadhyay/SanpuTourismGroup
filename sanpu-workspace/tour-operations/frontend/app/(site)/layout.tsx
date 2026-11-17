"use client";
import { CustomerShell } from "@sanpu/web";
import { HeaderSearch } from "@/components/header-search";
export default function SiteLayout({ children }: { children: React.ReactNode }) { return <CustomerShell search={<HeaderSearch />}>{children}</CustomerShell>; }
