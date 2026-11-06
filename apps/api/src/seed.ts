import {
  IdeaModel,
  ProfileModel,
  RoastModel,
  Reaction,
  MilestoneModel,
  Improvement,
  Revision,
  Setting,
} from "./models.js";

export async function seedDemo({
  enabled = process.env.SEED_DEMO === "1",
}: { enabled?: boolean } = {}) {
  if (
    !enabled ||
    process.env.NODE_ENV === "production" ||
    (await Setting.exists({ key: "demo-seeded" }))
  )
    return;
  const people = [
    {
      userId: "demo-sam",
      name: "Sam Parker",
      username: "buildwithsam",
      color: "sage",
      bio: "Less stuff. More community. Building things that bring neighbors together.",
      skills: ["Community", "Product design"],
    },
    {
      userId: "demo-aisha",
      name: "Aisha Khan",
      username: "aishamakes",
      color: "peach",
      bio: "Designer, compulsive note-taker. Making small things for a slower internet.",
      skills: ["Design", "Frontend"],
    },
    {
      userId: "demo-leo",
      name: "Leo Chen",
      username: "leoinpublic",
      color: "lavender",
      bio: "Independent developer. One useful experiment at a time.",
      skills: ["TypeScript", "Engineering"],
    },
    {
      userId: "demo-maya",
      name: "Maya Patel",
      username: "mayabuilds",
      color: "yellow",
      bio: "Questioning the defaults. Currently thinking about better cities.",
      skills: ["Research", "Strategy"],
    },
  ];
  for (const p of people)
    await ProfileModel.updateOne(
      { userId: p.userId },
      { $setOnInsert: { ...p, demo: true } },
      { upsert: true },
    );
  const ideas = [
    {
      id: "000000000000000000000101",
      authorId: "demo-sam",
      title: "A tool library for your apartment building.",
      pitch:
        "You need a drill for 12 minutes. Your neighbor has one gathering dust. What if your building had a shared tool library instead of 40 identical toolboxes?",
      problem:
        "Tools are expensive, take up space, and are rarely used. Borrowing from neighbors can be awkward when you do not know who owns what.",
      solution:
        "A building-level lending library: a shared inventory, a simple booking calendar, and condition photos before and after every loan. Start with one building and a shelf in the lobby.",
      audience:
        "Apartment residents, building managers, and people who only occasionally need a drill.",
      category: "Local business",
      stage: "Getting roasted",
      cover: "tools",
      tags: ["Community", "Sustainability"],
      tone: "Honest",
    },
    {
      id: "000000000000000000000102",
      authorId: "demo-aisha",
      title: "Fieldnotes. A quieter corner of the internet.",
      pitch:
        "A tiny personal website that grows with your thoughts. No followers, no analytics, no algorithm. Just a beautiful place to think out loud.",
      problem:
        "Publishing platforms often turn writing into a performance. We need a low-pressure place to keep ideas without chasing engagement.",
      solution:
        "A simple notebook on your own domain. Post a thought, link a source, or share a work in progress. Export everything as Markdown.",
      audience:
        "Writers, designers, and anyone tired of optimizing their thoughts for a feed.",
      category: "Design",
      stage: "Building",
      cover: "fieldnotes",
      tags: ["Indie web", "Writing"],
      tone: "Light",
    },
    {
      id: "000000000000000000000103",
      authorId: "demo-leo",
      title: "An unsubscribe button for real-world junk mail.",
      pitch:
        "Take a photo of unwanted mail. We find the sender’s opt-out process and help you request removal. Your recycling bin deserves a break.",
      problem:
        "Every sender has a different opt-out process. Most people throw out the mail because removing themselves takes too much effort.",
      solution:
        "A directory of verified opt-out processes with a photo-assisted lookup. Users review and send their own requests; we never pretend an opt-out is guaranteed.",
      audience:
        "People who want less physical junk mail and fewer unnecessary paper deliveries.",
      category: "Tech",
      stage: "Validating",
      cover: "",
      tags: ["Less waste", "Everyday problems"],
      tone: "Honest",
    },
    {
      id: "000000000000000000000104",
      authorId: "demo-maya",
      title: "What if your commute came with a walking buddy?",
      pitch:
        "Match with someone heading the same way for the last 15 minutes of your commute. A little less scrolling. A little more human.",
      problem:
        "City commutes can be lonely, and people often want to walk more but do not have an easy way to find company.",
      solution:
        "Opt-in walking groups starting at public transit exits, with clear meeting points, group-only matching, and no live location sharing.",
      audience:
        "Urban commuters looking for a social, low-pressure way to walk the last mile.",
      category: "Life & living",
      stage: "Just an idea",
      cover: "walk",
      tags: ["Cities", "Community"],
      tone: "Savage",
    },
    {
      id: "000000000000000000000105",
      authorId: "demo-leo",
      title: "A tiny invoice tool that knows when to stop.",
      pitch:
        "Create an invoice. Send a reminder. Get paid. No CRM, no pipeline, no seventeen-tab dashboard. Built for freelancers who would rather do the work.",
      problem:
        "Many invoicing tools grow into complex accounting suites. Solo freelancers need a simple way to invoice without learning another business system.",
      solution:
        "A focused invoice editor, reusable client details, PDF export, and scheduled reminders. No mandatory payment processor.",
      audience:
        "Independent freelancers sending fewer than 20 invoices a month.",
      category: "Tech",
      stage: "Beta",
      cover: "",
      tags: ["Freelance", "Bootstrapped"],
      tone: "Honest",
    },
    {
      id: "000000000000000000000106",
      authorId: "demo-aisha",
      title: "Dinner with strangers. Everyone brings one ingredient.",
      pitch:
        "A neighborhood potluck with a creative constraint: bring one ingredient, cook something together. The menu is a surprise. So are the people.",
      problem:
        "Meeting neighbors can feel formal or awkward. Shared activities make those first conversations easier.",
      solution:
        "Host small opt-in dinners in community kitchens, share dietary requirements ahead of time, and let a volunteer cook plan around the ingredients.",
      audience:
        "Neighbors who enjoy food and want to meet people in a shared public space.",
      category: "Wild idea",
      stage: "Getting roasted",
      cover: "",
      tags: ["Food", "Offline"],
      tone: "Light",
    },
  ];
  for (const [i, item] of ideas.entries()) {
    const { id, ...idea } = item;
    const createdAt = new Date(Date.now() - (i + 1) * 3600000);
    await IdeaModel.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          ...idea,
          status: "published",
          visibility: "public",
          prototype: "",
          demo: true,
          createdAt,
        },
      },
      { upsert: true, timestamps: false },
    );
    await Revision.updateOne(
      { ideaId: id, revision: 1 },
      {
        $setOnInsert: {
          ideaId: id,
          authorId: idea.authorId,
          title: idea.title,
          pitch: idea.pitch,
          stage: idea.stage,
          revision: 1,
        },
      },
      { upsert: true },
    );
  }
  const roast = await RoastModel.create({
    ideaId: ideas[0].id,
    authorId: "demo-maya",
    tone: "Honest",
    critique:
      "Love the waste reduction. But the real product isn’t the tool library — it’s the conversation after someone breaks the drill.",
    suggestion:
      "Start with five low-cost tools and one building. Try a refundable deposit and condition photos before buying insurance.",
    punchline: "You’re building trust with a side of power tools.",
  });
  await RoastModel.create({
    ideaId: ideas[1].id,
    authorId: "demo-leo",
    tone: "Light",
    critique:
      "A calmer writing space sounds great. But the people who want no audience may already have a notes app.",
    suggestion:
      "Test whether owning a domain and an easy export are enough for five writers to switch. Let them bring existing notes.",
    punchline: "Make the quiet part worth paying for.",
  });
  await Improvement.create({
    ideaId: ideas[0].id,
    authorId: "demo-aisha",
    category: "Product",
    body: "Add a simple condition checklist with a photo when a tool is returned. It makes responsibility clear before there is a disagreement.",
    state: "Exploring",
  });
  for (const person of people) {
    if (person.userId !== "demo-sam")
      await Reaction.create({
        userId: person.userId,
        targetId: ideas[0].id,
        kind: "interest",
      });
    if (person.userId !== "demo-aisha")
      await Reaction.create({
        userId: person.userId,
        targetId: ideas[1].id,
        kind: "interest",
      });
  }
  await Reaction.create({
    userId: "demo-aisha",
    targetId: String(roast._id),
    kind: "helpful",
  });
  await MilestoneModel.create({
    ideaId: ideas[1].id,
    authorId: "demo-aisha",
    title: "Five conversations, one smaller idea.",
    body: "Demo journey: interviews suggested that a simple writing space and a reliable Markdown export mattered more than customization.",
    stage: "Validating",
  });
  await MilestoneModel.create({
    ideaId: ideas[1].id,
    authorId: "demo-aisha",
    title: "The first notebook is taking shape.",
    body: "Demo journey: working on the editor, export, and a single beautiful default theme.",
    stage: "Building",
  });
  await Setting.create({ key: "demo-seeded", value: true });
}
