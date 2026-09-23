import { Zap } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
      <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-bolt">
        <Zap className="size-4 fill-current" strokeWidth={2.5} />
      </span>
      {APP_NAME}
    </Link>
  );
}
