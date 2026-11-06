"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Flame, Save, Trash2 } from "lucide-react";
import {
  ideaSchema,
  stages,
  tones,
  type IdeaInput,
  type Detail,
  type Idea,
  type CommunityConfig,
  defaultCommunityConfig,
} from "@roast/domain";
import { ApiError, api, send } from "../lib/api";
import { coffeeSignupUrl } from "./coffee";
import { useApp } from "./providers";
import { Empty, ErrorState, Modal, Cover, Loading } from "./ui";

const defaults: IdeaInput = {
  creatorName: "",
  buyMeACoffeeUrl: "",
  title: "",
  pitch: "",
  problem: "",
  solution: "",
  audience: "",
  prototype: "",
  category: "Tech",
  stage: "Getting roasted",
  tone: "Honest",
  visibility: "public",
  status: "published",
  tags: [],
};
export function IdeaEditor({ id }: { id?: string }) {
  const { me, loading, guard } = useApp();
  if (loading) return <Loading />;
  if (!me?.user)
    return (
      <Empty title="It starts with a “what if”.">
        <button
          className="button primary"
          onClick={() => guard(() => window.location.reload())}
        >
          Retry browser session
        </button>
      </Empty>
    );
  return <EditorForm id={id} key={`${me.user.id}:${id || "new"}`} />;
}
function EditorForm({ id }: { id?: string }) {
  const { me, loading, guard, toast } = useApp();
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const desiredStatus = useRef("published");
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<CommunityConfig>("/community-settings"),
  });
  const draftKey = `rt:idea:v2:${me?.user?.id}`;
  const existing = useQuery({
    queryKey: ["idea", id],
    queryFn: () => api<Detail>(`/ideas/${id}`),
    enabled: Boolean(id && me?.user),
  });
  const form = useForm<z.input<typeof ideaSchema>, unknown, IdeaInput>({
    resolver: zodResolver(ideaSchema),
    defaultValues: defaults,
  });
  const {
    register: registerField,
    formState: { errors },
  } = form;
  // Keep native values controlled while account/draft data arrives. Avoid
  // attaching RHF's mutable uncontrolled ref callback across those resets.
  const register = (name: Exclude<keyof IdeaInput, "tags">) => {
    registerField(name);
    return {
      name,
      value: form.watch(name) ?? "",
      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) =>
        form.setValue(name, event.target.value as never, {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        }),
      onBlur: () =>
        form.setValue(name, form.getValues(name), { shouldTouch: true }),
    };
  };
  const coverImage = form.watch("coverImage");
  useEffect(() => {
    if (
      !id &&
      config.data &&
      !config.data.categories.includes(form.getValues("category"))
    )
      form.setValue("category", config.data.categories[0]);
  }, [config.data, id, form]);
  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.set("image", file);
      const result = await api<{ id: string }>("/media", {
        method: "POST",
        body,
      });
      form.setValue("coverImage", result.id, { shouldDirty: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  useEffect(() => {
    if (existing.data) {
      form.reset(
        {
          ...defaults,
          ...existing.data.idea,
          creatorName:
            existing.data.idea.creatorName || existing.data.idea.author.name,
        },
        { keepFieldsRef: true },
      );
      setTagsInput(existing.data.idea.tags.join(", "));
    } else if (!id) {
      try {
        const draft = localStorage.getItem(draftKey);
        if (draft) {
          const parsed = JSON.parse(draft);
          form.reset({ ...defaults, ...parsed }, { keepFieldsRef: true });
          setTagsInput(
            Array.isArray(parsed.tags)
              ? parsed.tags
                  .filter((tag: unknown) => typeof tag === "string")
                  .join(", ")
              : "",
          );
        }
      } catch {}
    }
  }, [existing.data, id, form, draftKey]);
  useEffect(() => {
    if (id) return;
    const subscription = form.watch((value) => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(value));
      } catch {}
    });
    return () => subscription.unsubscribe();
  }, [form, id, draftKey]);
  async function save(values: IdeaInput) {
    if (uploading || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        ...values,
        status: desiredStatus.current,
        ...(id ? { version: existing.data!.idea.version } : {}),
      };
      const idea = await send<Idea>(
        id ? `/ideas/${id}` : "/ideas",
        body,
        id ? "PATCH" : "POST",
      );
      if (!id)
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      await client.invalidateQueries({ queryKey: ["ideas"] });
      await client.invalidateQueries({ queryKey: ["idea", id] });
      toast(
        idea.status === "draft"
          ? "Draft saved. Take your time."
          : idea.status === "archived"
            ? "Idea archived. It’s off the table for now."
            : "Your idea is on the table. Let’s see where it goes.",
      );
      router.push(
        idea.status === "draft" || idea.status === "archived"
          ? "/my-ideas"
          : `/ideas/${idea.id}`,
      );
    } catch (e) {
      if (e instanceof ApiError)
        for (const [field, messages] of Object.entries(
          e.fields?.fieldErrors || {},
        ))
          if (field in ideaSchema.shape && messages?.[0])
            form.setError(field as keyof IdeaInput, {
              type: "server",
              message: messages[0],
            });
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!loading && !me?.user)
    return (
      <Empty title="It starts with a “what if”.">
        <button
          className="button primary"
          onClick={() => guard(() => window.location.reload())}
        >
          Retry browser session
        </button>
      </Empty>
    );
  if (existing.error) return <ErrorState error={existing.error} />;
  if (id && existing.isPending) return <Loading />;
  return (
    <div className="editor-page">
      <Link href={id ? `/ideas/${id}` : "/feed"} className="back-link">
        <ArrowLeft size={15} />
        Back to the table
      </Link>
      <header className="editor-header">
        <span className="eyebrow">NO PITCH DECK. NO PERFECT ANSWERS.</span>
        <h1>
          {id ? "A better next version." : "What’s your big idea?"}
          <span> ↗</span>
        </h1>
        <p>
          {id
            ? "Show what changed. Every saved version becomes part of the journey."
            : "Half-baked is welcome here. Tell us what you’re thinking."}
        </p>
      </header>
      <div className="editor-layout">
        <form
          className="form idea-form"
          noValidate
          onSubmit={form.handleSubmit(save, () =>
            setError("Check the highlighted fields before saving your idea."),
          )}
        >
          <p className="notice">
            No login or sign-up needed. This browser keeps your editing access.
            Clearing its cookies removes that access.
          </p>
          <section>
            <span className="form-section-number">01 / THE PITCH</span>
            <label>
              Your name <span className="optional">optional</span>
              <input
                {...register("creatorName")}
                maxLength={60}
                placeholder="What should we call you?"
              />
              {errors.creatorName && (
                <span className="field-error" role="alert">
                  {errors.creatorName.message}
                </span>
              )}
            </label>
            <label>
              Give it a good title.
              <input
                {...register("title")}
                maxLength={140}
                placeholder="What if apartment buildings shared one tool library?"
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title && (
                <span className="field-error" role="alert">
                  {errors.title.message}
                </span>
              )}
            </label>
            <label>
              The short version.
              <textarea
                {...register("pitch")}
                rows={4}
                maxLength={1000}
                placeholder="The problem, the idea, and why anyone should care. A few sentences will do."
                aria-invalid={Boolean(errors.pitch)}
              />
              {errors.pitch && (
                <span className="field-error" role="alert">
                  {errors.pitch.message}
                </span>
              )}
            </label>
            <div className="form-columns">
              <label>
                Where does it fit?
                <select {...register("category")}>
                  {(
                    config.data?.categories || defaultCommunityConfig.categories
                  ).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                How far along is it?
                <select {...register("stage")}>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="creator-support-fields" id="creator-support">
            <span className="form-section-number">02 / BUY ME A COFFEE</span>
            <label>
              Your Buy Me a Coffee link{" "}
              <span className="optional">optional</span>
              <input
                {...register("buyMeACoffeeUrl")}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoComplete="url"
                spellCheck={false}
                placeholder="https://buymeacoffee.com/yourname"
                maxLength={500}
                aria-describedby="coffee-link-help"
                aria-invalid={Boolean(errors.buyMeACoffeeUrl)}
              />
              {errors.buyMeACoffeeUrl && (
                <span className="field-error" role="alert">
                  {errors.buyMeACoffeeUrl.message}
                </span>
              )}
            </label>
            <p className="fine-print" id="coffee-link-help">
              Supporters can pay you on your own Buy Me a Coffee page. You can
              publish without a link.
            </p>
            <a
              className="text-link"
              href={coffeeSignupUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Create a Buy Me a Coffee account <ArrowUpRight size={15} />
            </a>
            <p className="fine-print">
              Create your account in the new tab, then come back and paste your
              page URL here. Your draft stays in this browser.
            </p>
          </section>
          <section>
            <span className="form-section-number">
              03 / A LITTLE MORE CONTEXT
            </span>
            <label>
              Show the idea{" "}
              <span className="optional">
                optional · JPEG, PNG or WebP · under 2 MB
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => uploadImage(e.target.files?.[0])}
              />
            </label>
            {uploading && (
              <p className="fine-print" role="status">
                Preparing your image…
              </p>
            )}
            {coverImage && (
              <div className="upload-preview">
                <Cover kind="" mediaId={coverImage} />
                <button
                  type="button"
                  className="quiet-link"
                  onClick={() => form.setValue("coverImage", undefined)}
                >
                  Remove image
                </button>
              </div>
            )}
            <label>
              What’s the problem?
              <textarea
                {...register("problem")}
                maxLength={3000}
                rows={3}
                placeholder="What do people struggle with today?"
              />
            </label>
            <label>
              How would your idea help?
              <textarea
                {...register("solution")}
                maxLength={3000}
                rows={3}
                placeholder="Walk us through your solution. Rough edges included."
              />
            </label>
            <label>
              Who’s it for?
              <input
                {...register("audience")}
                maxLength={500}
                placeholder="Be more specific than ‘everyone’."
              />
            </label>
            <label>
              Something to show? <span className="optional">optional</span>
              <input
                {...register("prototype")}
                type="url"
                placeholder="https://your-prototype.example"
              />
              {errors.prototype && (
                <span className="field-error" role="alert">
                  {errors.prototype.message}
                </span>
              )}
            </label>
            <label>
              Tags{" "}
              <span className="optional">up to five, separated by commas</span>
              <input
                name="tags"
                value={tagsInput}
                onChange={(e) => {
                  setTagsInput(e.target.value);
                  form.setValue(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    {
                      shouldDirty: true,
                      shouldValidate: form.formState.isSubmitted,
                    },
                  );
                }}
                placeholder="Community, sustainability, offline"
              />
              {errors.tags && (
                <span className="field-error" role="alert">
                  Use up to five tags, each under 25 characters.
                </span>
              )}
            </label>
          </section>
          <section>
            <span className="form-section-number">04 / SET YOUR TABLE</span>
            <label>
              How much heat are you inviting?
              <select {...register("tone")}>
                {tones.map((t) => (
                  <option key={t} value={t}>
                    {t} roast —{" "}
                    {t === "Light"
                      ? "gentle & encouraging"
                      : t === "Honest"
                        ? "straight & thoughtful"
                        : "sharp, never personal"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Who can find this?
              <select {...register("visibility")}>
                <option value="public">Public — on the community table</option>
                <option value="unlisted">
                  Unlisted — anyone with the link
                </option>
              </select>
            </label>
            <p className="fine-print">
              Unlisted ideas are accessible to anyone with the URL. Drafts are
              visible only to you. Publishing doesn’t guarantee
              intellectual-property protection.
            </p>
          </section>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {config.data && !config.data.publishingEnabled && (
            <p className="notice">
              New pitches are paused for a moment. You can still save a draft.
            </p>
          )}
          <div className="editor-actions">
            <button
              type="submit"
              className="button secondary"
              onClick={() => {
                desiredStatus.current = "draft";
              }}
              disabled={busy || uploading}
            >
              <Save size={16} />
              Save draft
            </button>
            <button
              type="submit"
              className="button primary"
              onClick={() => {
                desiredStatus.current = "published";
              }}
              disabled={
                busy || uploading || config.data?.publishingEnabled === false
              }
            >
              {busy
                ? "Saving…"
                : id
                  ? "Publish revision"
                  : "Put it on the table"}
              <ArrowUpRight size={17} />
            </button>
          </div>
          {id && (
            <div className="editor-danger">
              <button
                type="submit"
                className="quiet-link"
                disabled={busy || uploading}
                onClick={() => {
                  desiredStatus.current = "archived";
                }}
              >
                Archive idea
              </button>
              <button
                type="button"
                className="quiet-link danger"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={14} />
                Delete idea
              </button>
            </div>
          )}
        </form>
        <aside className="editor-note">
          <span className="asterisk">✳</span>
          <h2>
            A good pitch
            <br />
            starts a conversation.
          </h2>
          <p>
            You don’t have to have it all figured out. That’s why we’re here.
          </p>
          <ul>
            <li>Start with a real problem.</li>
            <li>Say who it’s for.</li>
            <li>Share what you’re unsure about.</li>
            <li>Leave room to change your mind.</li>
          </ul>
          <div>
            <Flame size={20} />
            <p>
              A roast is a gift.
              <br />
              Occasionally, a slightly spicy one.
            </p>
          </div>
          <span className="fine-print">
            New-idea drafts are recovered on this device. Use “Save draft” to
            store them securely for this browser.
          </span>
        </aside>
      </div>
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        title="Take this idea off the table?"
        description="Deleting hides this idea and its discussion from the community. This cannot be undone in the app."
      >
        <div className="form">
          <button
            className="button danger-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/ideas/${id}`, { method: "DELETE" });
                await client.invalidateQueries();
                router.push("/my-ideas");
                toast("Your idea has been removed.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                setDeleting(false);
              }
            }}
          >
            Delete idea
          </button>
          <button
            className="button secondary"
            onClick={() => setDeleting(false)}
          >
            Keep the idea
          </button>
        </div>
      </Modal>
    </div>
  );
}
