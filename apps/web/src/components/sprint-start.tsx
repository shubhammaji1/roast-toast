"use client";

import { useState } from "react";
import type { Idea } from "@roast/domain";
import { send } from "@/lib/api";
import { Modal } from "./ui";

export function SprintStart({
  idea,
  onStarted,
}: {
  idea: Idea;
  onStarted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    targetCustomer: idea.audience || "",
    hypothesis: "",
    experiment: "",
    successCriteria: "",
  });
  return (
    <>
      <button
        className="button primary"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Start a seven-day sprint
      </button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        title="One idea. Seven days. One decision."
        description="Choose one risky assumption and a small test. Your seven-day clock starts when you save this plan."
      >
        <form
          className="form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await send(`/ideas/${idea.id}/experiments`, {
                hypothesis: values.hypothesis,
                experiment: values.experiment,
                successCriteria: values.successCriteria,
                sprint: { targetCustomer: values.targetCustomer },
              });
              setOpen(false);
              setValues({
                targetCustomer: idea.audience || "",
                hypothesis: "",
                experiment: "",
                successCriteria: "",
              });
              onStarted();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            <strong>Days 1–2:</strong> sharpen your pitch and seek relevant
            feedback.
            <br />
            <strong>Days 3–6:</strong> run your test with potential customers.
            <br />
            <strong>Day 7:</strong> record evidence and decide what comes next.
          </p>
          <label>
            Who is your target customer?
            <textarea
              required
              minLength={5}
              maxLength={500}
              rows={2}
              value={values.targetCustomer}
              onChange={(e) =>
                setValues({ ...values, targetCustomer: e.target.value })
              }
              placeholder="Independent salon owners who manage bookings by phone"
            />
          </label>
          <label>
            What is your riskiest assumption?
            <input
              required
              minLength={8}
              maxLength={240}
              value={values.hypothesis}
              onChange={(e) =>
                setValues({ ...values, hypothesis: e.target.value })
              }
              placeholder="Salon owners will try an online booking tool."
            />
          </label>
          <label>
            What small test will you run?
            <textarea
              required
              minLength={12}
              maxLength={1500}
              rows={3}
              value={values.experiment}
              onChange={(e) =>
                setValues({ ...values, experiment: e.target.value })
              }
              placeholder="Show a booking prototype to five salon owners and ask them to try it."
            />
          </label>
          <label>
            What measurable result would count as success?
            <input
              required
              minLength={5}
              maxLength={300}
              value={values.successCriteria}
              onChange={(e) =>
                setValues({ ...values, successCriteria: e.target.value })
              }
              placeholder="Three of five owners agree to a real booking trial."
            />
          </label>
          <p className="fine-print">
            This plan and its results share your idea’s visibility. Feedback is
            community-led; starting a sprint does not book reviewers. Keep
            customer details anonymous.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Starting…" : "Start my seven days"}
          </button>
        </form>
      </Modal>
    </>
  );
}
