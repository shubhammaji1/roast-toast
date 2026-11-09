import { repository } from "./repository.js";

export const ProfileModel = repository("profiles", {
  bio: "",
  skills: [],
  website: "",
  private: false,
  color: "sage",
  demo: false,
  role: "member",
  suspended: false,
  anonymous: false,
});
export const VisitorSession = repository("visitor_sessions");
export const IdeaModel = repository("ideas", {
  buyMeACoffeeUrl: "",
  problem: "",
  solution: "",
  audience: "",
  tags: [],
  cover: "",
  prototype: "",
  demo: false,
});
export const Revision = repository("idea_revisions");
export const RoastModel = repository("roasts", {
  acknowledged: false,
  hidden: false,
});
export const Reply = repository("replies");
export const Reaction = repository("reactions");
export const Improvement = repository("improvements", { state: "Suggested" });
export const MilestoneModel = repository("milestones", {
  selfReported: true,
  kind: "update",
});
export const Collaboration = repository("collaborations", { state: "pending" });
export const Notification = repository("notifications");
export const Report = repository("reports", { state: "open" });
export const Block = repository("blocks");
export const Audit = repository("audit_logs");
export const ModerationAction = repository("moderation_actions");
export const Appeal = repository("appeals", { state: "open" });
// Historical support records remain exportable; new payments occur on Buy Me a Coffee.
export const CoffeeOrder = repository("coffee_orders");
export const PaymentEvent = repository("payment_events");
export const EmailMessage = repository("email_messages", { delivered: false });
export const Setting = repository("settings");
export const Media = repository("media");
