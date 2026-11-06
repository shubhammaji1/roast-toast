"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowUpRight, Coffee } from "lucide-react";
import { initials, type Profile } from "@roast/domain";
import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="35"
      viewBox="0 0 30 35"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 1c3 9-4 10-1 16 2-1 4-3 5-6 6 6 10 11 7 17-3 7-16 8-22 1C-1 22 3 17 8 12c-1 7 2 9 4 9C7 12 16 9 16 1Z"
        fill="currentColor"
      />
      <path
        d="M15 23c4 3 6 5 3 8-2 2-6 0-6-2 0-2 2-3 3-6Z"
        fill="var(--paper)"
      />
    </svg>
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="roast&toast. home">
      <BrandMark />
      <span>
        roast<span className="brand-amp">&</span>toast
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Avatar({
  person,
  small = false,
  linked = true,
}: {
  person: Pick<Profile, "name" | "username" | "color">;
  small?: boolean;
  linked?: boolean;
}) {
  const content = (
    <span
      className={`avatar ${person.color || "sage"} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
  return linked ? (
    <Link
      className="avatar-link"
      href={`/people/${person.username}`}
      aria-label={`${initials(person.name)} — ${person.name}'s profile`}
    >
      {content}
    </Link>
  ) : (
    content
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className={`dialog ${wide ? "wide" : ""}`}
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            const field = content.current?.querySelector<HTMLElement>(
              'input:not([type="checkbox"]), textarea, select',
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          <Dialog.Close className="icon-button close" aria-label="Close dialog">
            <X size={21} />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="muted dialog-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  title = "Nothing here yet.",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">✳</span>
      <h2>{title}</h2>
      <p>{children || "Someone has to go first. Pull up a chair."}</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>Something didn’t go through.</h2>
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton-list" aria-label="Loading ideas" role="status">
      {[1, 2, 3].map((i) => (
        <div className="skeleton" key={i}>
          <i />
          <b />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function Stage({ stage }: { stage: string }) {
  return (
    <span
      className={`stage ${["Building", "Beta", "Launched"].includes(stage) ? "progress" : ""}`}
    >
      <i />
      {stage}
    </span>
  );
}
export function DemoLabel() {
  return <span className="demo-label">DEMO IDEA</span>;
}
export function ToolArt() {
  return (
    <svg
      viewBox="0 0 330 180"
      fill="none"
      role="img"
      aria-label="Illustration of a drill, ruler and shared toolbox"
    >
      <path d="M20 148H310M34 158H295" stroke="#b7b8a3" strokeWidth="1" />
      <g transform="rotate(-9 110 95)">
        <path
          d="M50 56h94v47H50z"
          fill="#d5a63f"
          stroke="#292d26"
          strokeWidth="2.5"
        />
        <path
          d="M143 67h31v25h-31"
          fill="#30382f"
          stroke="#292d26"
          strokeWidth="2.5"
        />
        <path
          d="M174 77h36v6h-36"
          fill="#848c7b"
          stroke="#292d26"
          strokeWidth="2"
        />
        <path
          d="M81 104h29l-7 42H77z"
          fill="#d5a63f"
          stroke="#292d26"
          strokeWidth="2.5"
        />
        <path
          d="M72 143h41v13H72z"
          fill="#30382f"
          stroke="#292d26"
          strokeWidth="2.5"
        />
        <path
          d="M65 69h48M65 79h48M65 89h25"
          stroke="#292d26"
          strokeWidth="2"
        />
        <path d="M114 104v15h-12" stroke="#292d26" strokeWidth="2.5" />
      </g>
      <g transform="rotate(12 236 100)">
        <path
          d="M208 55h45v18h-45z"
          fill="#b57956"
          stroke="#292d26"
          strokeWidth="2"
        />
        <path
          d="M226 73h10v78h-10z"
          fill="#bb946d"
          stroke="#292d26"
          strokeWidth="2"
        />
        <path
          d="M205 48h51v10h-51z"
          fill="#677564"
          stroke="#292d26"
          strokeWidth="2"
        />
      </g>
      <path
        d="M268 37h15v112h-15z"
        fill="#e6d4a4"
        stroke="#292d26"
        strokeWidth="2"
      />
      <path
        d="M268 50h9m-9 10h5m-5 10h9m-9 10h5m-5 10h9m-9 10h5m-5 10h9m-9 10h5m-5 10h9"
        stroke="#292d26"
      />
      <path
        d="M24 35l4-8m5 17 8-2m-18-4-8-4"
        stroke="#697760"
        strokeWidth="2"
      />
      <text
        x="32"
        y="174"
        fill="#5a644f"
        fontSize="8"
        fontFamily="monospace"
        letterSpacing="2"
      >
        LESS OWNING. MORE BORROWING.
      </text>
    </svg>
  );
}
export function Cover({
  kind,
  large = false,
  mediaId,
}: {
  kind: string;
  large?: boolean;
  mediaId?: string;
}) {
  if (mediaId)
    return (
      <div className={`idea-cover uploaded-cover ${large ? "large" : ""}`}>
        <Image
          src={`/api/v1/media/${mediaId}`}
          alt="Creator’s idea illustration"
          width={1400}
          height={1000}
          unoptimized
        />
      </div>
    );
  return (
    <div className={`idea-cover cover-${kind} ${large ? "large" : ""}`}>
      {kind === "tools" ? (
        <ToolArt />
      ) : kind === "fieldnotes" ? (
        <>
          <span className="fieldnotes-word">
            fieldnotes<span>↗</span>
          </span>
          <span className="cover-caption">A little room to think.</span>
          <span className="fieldnotes-lines" />
        </>
      ) : (
        <>
          <span className="walk-drawing">
            ↗<br />↗
          </span>
          <span className="cover-caption">Take the long way home.</span>
        </>
      )}
    </div>
  );
}
export function SmallLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function CoffeeGlyph() {
  return (
    <div className="coffee-glyph">
      <Coffee size={54} strokeWidth={1.2} />
      <span>
        Good ideas.
        <br />
        <em>Great company.</em>
      </span>
    </div>
  );
}
