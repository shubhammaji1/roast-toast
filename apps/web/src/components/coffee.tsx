"use client";
import Link from "next/link";
import { Coffee, ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type Idea, type CommunityConfig } from "@roast/domain";
import { api } from "@/lib/api";
import { useApp } from "./providers";

export const coffeeSignupUrl = "https://buymeacoffee.com/signup";
export function CoffeeLink({
  idea,
  className = "",
  compact = false,
}: {
  idea: Idea;
  className?: string;
  compact?: boolean;
}) {
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => api<CommunityConfig>("/community-settings"),
  });
  if (config?.coffeeEnabled === false) return null;
  if(!idea.buyMeACoffeeUrl) return <Link className={className} href={`/ideas/${idea.id}?tab=support`} aria-label={`Buy Me a Coffee: support options for ${idea.title}`}><Coffee size={17}/><span>{compact?'Coffee':'Buy me a coffee'}</span></Link>;
  return (
    <a
      className={className}
      href={idea.buyMeACoffeeUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Buy a coffee for ${idea.author.name} on Buy Me a Coffee (opens in a new tab)`}
    >
      <Coffee size={17} />
      <span>{compact ? "Coffee" : "Buy me a coffee"}</span>
      <ArrowUpRight size={13} />
    </a>
  );
}
export function CoffeeSupport({ idea }: { idea: Idea }) {
  const { me } = useApp();
  const own = me?.user?.id === idea.authorId;
  return (
    <section className="external-support">
      <Coffee size={40} strokeWidth={1.3} />
      <span className="eyebrow">ENCOURAGEMENT, DIRECT TO THE CREATOR</span>
      <h2>
        {idea.buyMeACoffeeUrl
          ? "Good ideas deserve a coffee."
          : "A thoughtful roast is welcome, too."}
      </h2>
      <p>
        {idea.buyMeACoffeeUrl
          ? "Support this creator on their own Buy Me a Coffee page. Payments, amounts, and any account requirements are handled there."
          : "This creator hasn’t shared a Buy Me a Coffee link. You can still help with useful feedback."}
      </p>
      {idea.buyMeACoffeeUrl&&<CoffeeLink idea={idea} className="button coffee-button" />}
      {!idea.buyMeACoffeeUrl && own && (
        <Link href={`/ideas/${idea.id}/edit`} className="button secondary">
          Add your Buy Me a Coffee link
          <ArrowUpRight size={15} />
        </Link>
      )}
      <p className="fine-print">
        Roast & Toast does not collect payment details, charge you, or verify
        support totals.
      </p>
    </section>
  );
}
