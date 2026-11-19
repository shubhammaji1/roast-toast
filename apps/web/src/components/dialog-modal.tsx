"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
export default function DialogModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  auth = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
  auth?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className={`dialog ${wide ? "wide" : ""} ${auth ? "auth-dialog" : ""}`}
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
          {auth && <div className="auth-brand"><span aria-hidden="true">✳</span> roast&amp;toast.</div>}
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
