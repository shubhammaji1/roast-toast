"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIdeaReaction } from "@/lib/use-idea-reaction";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Flame,
  MessageCircle,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { type Idea } from "@roast/domain";
import { date } from "@/lib/api";
import { useApp } from "./providers";
import { Avatar, Cover, DemoLabel, Stage } from "./ui";
import { CoffeeLink } from "./coffee";

export function IdeaCard({
  idea,
  compact = false,
}: {
  idea: Idea;
  compact?: boolean;
}) {
  const { guard, toast } = useApp();
  const router = useRouter();
  const react = useIdeaReaction(idea.id);
  async function share() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/ideas/${idea.id}`,
      );
      toast("Link copied. Give this idea some company.");
    } catch {
      toast("Open the idea and copy its address to share it.");
    }
  }
  return (
    <article className={`idea-post ${compact ? "compact" : ""}`}>
      <header className="post-meta">
        <div className="creator">
          <Avatar person={idea.author} small />
          <div>
            <Link href={`/people/${idea.author.username}`}>
              {idea.author.name}
            </Link>
            <span>
              @{idea.author.username}
              <span className="meta-dot">·</span>
              {date(idea.createdAt)}
            </span>
          </div>
        </div>
        <div className="post-labels">
          {idea.demo && <DemoLabel />}
          <Stage stage={idea.stage} />
        </div>
      </header>
      <div
        className={`post-body ${(idea.cover || idea.coverImage) && !compact ? "with-cover" : ""}`}
      >
        <div>
          <span className="category-label">{idea.category}</span>
          <h2>
            <Link href={`/ideas/${idea.id}`}>{idea.title}</Link>
          </h2>
          <p>{idea.pitch}</p>
          {!compact && (
            <div className="post-tags">
              {idea.tags.map((tag) => (
                <Link href={`/explore?q=${encodeURIComponent(tag)}`} key={tag}>
                  #{tag.toLowerCase().replace(/\s+/g, "")}
                </Link>
              ))}
            </div>
          )}
        </div>
        {(idea.cover || idea.coverImage) && !compact && (
          <Link href={`/ideas/${idea.id}`} className="cover-link">
            <span className="sr-only">Read {idea.title}</span>
            <Cover kind={idea.cover} mediaId={idea.coverImage} />
          </Link>
        )}
      </div>
      <footer className="post-actions">
        <button
          className="roast-action"
          onClick={() =>
            guard(() => router.push(`/ideas/${idea.id}?tab=roasts&compose=1`))
          }
        >
          <Flame size={17} />
          <span>Roast it</span>
          <b>{idea.roastCount}</b>
        </button>
        <button
          className={idea.interested ? "selected" : ""}
          disabled={react.isPending}
          aria-pressed={idea.interested}
          onClick={() =>
            guard(() =>
              react.mutate({ kind: "interest", active: !idea.interested }),
            )
          }
        >
          {idea.interested ? <Check size={16} /> : <ThumbsUp size={16} />}
          <span>I’d use this</span>
          <b>{idea.interests}</b>
        </button>
        <CoffeeLink idea={idea} className="coffee-action" compact />
        <Link
          href={`/ideas/${idea.id}?tab=roasts`}
          className="comments-action"
          aria-label={`Read ${idea.roastCount} roasts`}
        >
          <MessageCircle size={17} />
        </Link>
        <div className="action-spacer" />
        <button
          aria-label={idea.saved ? "Unsave idea" : "Save idea"}
          aria-pressed={idea.saved}
          disabled={react.isPending}
          onClick={() =>
            guard(() => react.mutate({ kind: "bookmark", active: !idea.saved }))
          }
        >
          <Bookmark size={17} fill={idea.saved ? "currentColor" : "none"} />
        </button>
        <button aria-label="Share idea" onClick={share}>
          <Share2 size={16} />
        </button>
      </footer>
      {idea.status !== "published" && (
        <Link className="draft-strip" href={`/ideas/${idea.id}/edit`}>
          {idea.status === "draft"
            ? "Draft · Only you can see this"
            : "Archived · Hidden from the table"}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </article>
  );
}
