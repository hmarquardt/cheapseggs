/**
 * Chemistry Check question bank — editorial content, not a validated instrument.
 *
 * Manifests are versioned and editorially fixed. Depths are nested sets (25 ⊂ 50 ⊂ 100)
 * built from per-dimension prefixes, so expanding an assessment never introduces a
 * dynamically chosen question and never depends on the other participant's answers.
 *
 * Every question here is non-explicit and part of the base deck. A separate, versioned
 * intimate supplemental deck is future work; nothing in this file is displayed or
 * reused for a restricted adult scope.
 */

export const CHEMISTRY_BANK_VERSION = "chemistry-2026-11-19.v1";
export const CHEMISTRY_QUESTION_VERSION = 1;

export type ChemistryDimensionId =
  | "goals"
  | "lifestyle"
  | "communication"
  | "values"
  | "affection"
  | "intimacy"
  | "adventure"
  | "humor";

export type ChemistryDepth = 25 | 50 | 100;

export interface ChemistryChoice {
  id: string;
  label: string;
}

export interface ChemistryQuestion {
  id: string;
  version: number;
  dimension: ChemistryDimensionId;
  prompt: string;
  kind: "single" | "multi";
  /** Presentation only: `scale` renders an ordered row. Answer semantics stay explicit. */
  layout: "list" | "scale";
  choices: readonly ChemistryChoice[];
  help?: string;
  /** Intimacy-dimension questions default to private-only disclosure. */
  intimate: boolean;
}

export interface ChemistryDimension {
  id: ChemistryDimensionId;
  title: string;
  blurb: string;
  /** Fixed, generic conversation starters — never derived from someone's answers. */
  starters: readonly string[];
}

export const DIMENSIONS: readonly ChemistryDimension[] = [
  {
    id: "goals",
    title: "Relationship goals",
    blurb: "Commitment, pace and what you hope this becomes.",
    starters: [
      "What does a good month together look like in practice?",
      "Where would you like this to be in three months — and what would make you slow down?",
    ],
  },
  {
    id: "lifestyle",
    title: "Lifestyle and habits",
    blurb: "Schedules, social energy, money and daily routines.",
    starters: [
      "Which ordinary weeknight habit of yours would a partner notice first?",
      "What does a Sunday that recharges you look like?",
    ],
  },
  {
    id: "communication",
    title: "Communication and conflict",
    blurb: "Contact, disagreement, space and repair.",
    starters: [
      "When one of you goes quiet, what usually helps?",
      "What is the smallest repair that works after a disagreement?",
    ],
  },
  {
    id: "values",
    title: "Values and future expectations",
    blurb: "Priorities, family, principles and the things you would not trade away.",
    starters: [
      "Which value would you want someone to see you act on, not just state?",
      "Where do your family's expectations differ from your own?",
    ],
  },
  {
    id: "affection",
    title: "Affection and emotional connection",
    blurb: "How you show care, receive it and ask for space.",
    starters: [
      "How do you prefer affection on a low-energy day?",
      "What makes a small gesture feel genuine rather than performative?",
    ],
  },
  {
    id: "intimacy",
    title: "Intimacy expectations",
    blurb: "Comfort talking about intimacy, pacing and boundaries. Non-explicit.",
    starters: [
      "What helps you talk about intimacy without it feeling like a test?",
      "How would you like to check in when the pace changes?",
    ],
  },
  {
    id: "adventure",
    title: "Adventure and spontaneity",
    blurb: "Novelty, planning, travel and comfort with the unplanned.",
    starters: [
      "What is one low-stakes adventure you would both try this month?",
      "How do you each feel about plans that change at the last minute?",
    ],
  },
  {
    id: "humor",
    title: "Humor and personality",
    blurb: "Playfulness, teasing, social style and how you break the ice.",
    starters: [
      "What kind of joke reliably lands with you?",
      "When teasing goes wrong, what repairs it?",
    ],
  },
];

export const DEPTHS: readonly {
  depth: ChemistryDepth;
  name: string;
  tagline: string;
  description: string;
}[] = [
  {
    depth: 25,
    name: "Quick Check",
    tagline: "Initial attraction and expectations",
    description: "A short pass over every dimension. Good for a first conversation, not a verdict.",
  },
  {
    depth: 50,
    name: "A Closer Look",
    tagline: "A more substantial compatibility exploration",
    description:
      "More questions per dimension, including the smaller habits that get noticed later.",
  },
  {
    depth: 100,
    name: "The Full Conversation",
    tagline: "A deeper evaluation before committing to a relationship",
    description: "The whole bank. More coverage — still a conversation aid, not a prediction.",
  },
];

/** Editorial hypotheses, not validated scales. Prefix counts keep 25 ⊂ 50 ⊂ 100. */
export const DEPTH_ALLOCATION: Readonly<
  Record<ChemistryDimensionId, Readonly<Record<ChemistryDepth, number>>>
> = {
  goals: { 25: 4, 50: 7, 100: 13 },
  lifestyle: { 25: 3, 50: 7, 100: 13 },
  communication: { 25: 3, 50: 6, 100: 13 },
  values: { 25: 3, 50: 6, 100: 13 },
  affection: { 25: 3, 50: 6, 100: 12 },
  intimacy: { 25: 3, 50: 6, 100: 12 },
  adventure: { 25: 3, 50: 6, 100: 12 },
  humor: { 25: 3, 50: 6, 100: 12 },
};

type ChoiceTuple = readonly [id: string, label: string];

function makeQuestion(
  dimension: ChemistryDimensionId,
  id: string,
  prompt: string,
  choices: readonly ChoiceTuple[],
  kind: "single" | "multi" = "single",
  options: { layout?: "scale"; help?: string } = {},
): ChemistryQuestion {
  return {
    id,
    version: CHEMISTRY_QUESTION_VERSION,
    dimension,
    prompt,
    kind,
    layout: options.layout ?? "list",
    choices: choices.map(([choiceId, label]) => ({ id: choiceId, label })),
    intimate: dimension === "intimacy",
    ...(options.help ? { help: options.help } : {}),
  };
}

// ------------------------------------------------------------------ goals (13)

const GOALS: readonly ChemistryQuestion[] = [
  makeQuestion(
    "goals",
    "sometime-how-soon",
    "When you say “we should go out sometime,” how soon is sometime?",
    [
      ["this-week", "This week, ideally"],
      ["this-month", "Within a month"],
      ["no-rush", "When the stars align"],
      ["polite", "Honestly, I was being polite"],
    ],
  ),
  makeQuestion("goals", "hoping-for", "What are you hoping this connection becomes?", [
    ["few-dates", "A few good dates"],
    ["steady-if-fits", "Something steady, if it fits"],
    ["open-long-term", "Open to long-term"],
    ["figuring-out", "Still figuring that out"],
  ]),
  makeQuestion("goals", "labels", "How do you feel about labels like “dating” or “partner”?", [
    ["never", "Keep them far away"],
    ["eventually", "Nice once they're earned"],
    ["early", "Early and clear, please"],
    ["before-second", "I like knowing before the second date"],
  ]),
  makeQuestion("goals", "check-ins", "If a relationship needs a check-in, when should it happen?", [
    ["first-wobble", "At the first wobble"],
    ["monthly", "On a regular rhythm"],
    ["when-asked", "Only when someone asks"],
    ["not-my-style", "Formal check-ins aren't my style"],
  ]),
  makeQuestion("goals", "shared-time", "How do you picture sharing time with a partner?", [
    ["separate", "Mostly separate lives"],
    ["fixed-nights", "A few fixed nights a week"],
    ["most-free-time", "Most of our free time together"],
    ["joined", "Joined at the calendar"],
  ]),
  makeQuestion(
    "goals",
    "commitment-meaning",
    "What does commitment mean to you, first and foremost?",
    [
      ["exclusivity", "Exclusivity"],
      ["showing-up", "Showing up consistently"],
      ["shared-plan", "Building a shared plan"],
      ["define-together", "Something we define together"],
    ],
  ),
  makeQuestion(
    "goals",
    "what-are-we",
    "How do you want to handle the “what are we?” conversation?",
    [
      ["direct-soon", "Directly and soon"],
      ["natural-moment", "Wait for a natural moment"],
      ["follow-lead", "I'll follow their lead"],
      ["avoid", "I avoid it, honestly"],
    ],
  ),
  makeQuestion(
    "goals",
    "next-few-years",
    "How important is it that a partner shares your plans for the next few years?",
    [
      ["not-important", "Not important"],
      ["nice", "Nice if it happens"],
      ["fairly", "Fairly important"],
      ["essential", "Essential"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("goals", "friends-family", "How do you feel about meeting friends and family?", [
    ["early-often", "Early and often"],
    ["few-months", "After a few months"],
    ["serious-only", "Only when it's serious"],
    ["depends", "It really depends on the person"],
  ]),
  makeQuestion("goals", "pace", "What pace feels right at the start?", [
    ["slow-burn", "A slow burn"],
    ["steady", "Steady and consistent"],
    ["fast", "Fast, then see what happens"],
    ["week-permitting", "Whatever the week allows"],
  ]),
  makeQuestion(
    "goals",
    "want-more-of",
    "If this works, what would you like more of?",
    [
      ["weeknights", "Ordinary weeknights"],
      ["trips", "Trips and plans"],
      ["project", "A shared project"],
      ["routine", "A quiet routine"],
      ["chaos", "A little spontaneous chaos"],
    ],
    "multi",
  ),
  makeQuestion("goals", "living-someday", "How do you feel about living arrangements someday?", [
    ["together", "Living together"],
    ["separate-close", "Separate places, close by"],
    ["depends", "It depends on the relationship"],
    ["not-yet", "Not thinking that far ahead"],
  ]),
  makeQuestion("goals", "going-well", "How do you know a relationship is going well?", [
    ["laughing", "We laugh a lot"],
    ["repair", "We handle problems well"],
    ["choosing", "We keep choosing each other"],
    ["space", "We still have separate lives"],
  ]),
];

// -------------------------------------------------------------- lifestyle (13)

const LIFESTYLE: readonly ChemistryQuestion[] = [
  makeQuestion("lifestyle", "ideal-saturday", "Your ideal Saturday: adventure, couch, or both?", [
    ["adventure", "Out and doing something"],
    ["couch", "Couch and snacks"],
    ["both", "Both, in that order"],
    ["wildcard", "A wildcard I haven't tried"],
  ]),
  makeQuestion(
    "lifestyle",
    "alone-time",
    "How much alone time keeps you feeling like yourself?",
    [
      ["very-little", "Very little"],
      ["some", "A little each day"],
      ["regular", "A regular block of it"],
      ["a-lot", "A lot, unapologetically"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("lifestyle", "waking-up", "When do you usually get up?", [
    ["early", "Early, happily"],
    ["before-nine", "Reluctantly before nine"],
    ["noon", "Noon is a rumour"],
    ["depends", "Depends on the night before"],
  ]),
  makeQuestion("lifestyle", "nights-out", "How do you feel about a partner's nights out?", [
    ["happy", "Happy for them"],
    ["join", "I'd rather join"],
    ["heads-up", "Fine with a heads-up"],
    ["prefer-not", "I'd prefer a partner who stays in"],
  ]),
  makeQuestion("lifestyle", "phone", "What's your relationship with your phone?", [
    ["nearby", "Always nearby"],
    ["bursts", "Checked in bursts"],
    ["face-down", "Mostly face down"],
    ["forget", "I forget it exists"],
  ]),
  makeQuestion(
    "lifestyle",
    "tidy",
    "How tidy is your place, honestly?",
    [
      ["relaxed", "Relaxed, let's say"],
      ["lived-in", "Lived-in but tidy"],
      ["mostly", "Mostly tidy"],
      ["very", "Very tidy"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("lifestyle", "unplanned-money", "What happens to money you didn't plan to spend?", [
    ["save", "It gets saved"],
    ["small-treat", "A small treat"],
    ["big-thing", "One slightly big thing"],
    ["ask-tomorrow", "Ask me tomorrow"],
  ]),
  makeQuestion("lifestyle", "smoking", "Smoking, vaping, or neither?", [
    ["neither", "Neither"],
    ["occasionally", "Occasionally"],
    ["regularly", "Regularly"],
    ["rather-not-date", "I'd rather not date it"],
  ]),
  makeQuestion("lifestyle", "sleep-space", "How do you feel about sharing a bed to sleep?", [
    ["together", "Prefer together"],
    ["separate", "Prefer separate"],
    ["depends", "Depends on the night"],
    ["own-space", "Need my own space sometimes"],
  ]),
  makeQuestion("lifestyle", "social-battery", "What's your ideal social battery for a weekend?", [
    ["one-big", "One big thing"],
    ["few-small", "Two or three small things"],
    ["mostly-home", "Mostly home"],
    ["depends-who", "Entirely depends who's there"],
  ]),
  makeQuestion("lifestyle", "calendar", "How do you handle your calendar?", [
    ["planned", "Planned weeks ahead"],
    ["roughly", "Roughly planned"],
    ["wing", "I wing it"],
    ["three", "Three calendars and a prayer"],
  ]),
  makeQuestion("lifestyle", "pets", "How do pets fit into your life?", [
    ["family", "I have them; they're family"],
    ["love-not-own", "Love them, don't own any"],
    ["no", "Allergic or prefer none"],
    ["open", "Open to whatever"],
  ]),
  makeQuestion(
    "lifestyle",
    "sleep-schedule",
    "How do you feel about a partner's different sleep schedule?",
    [
      ["adapt", "Fine, we adapt"],
      ["prefer-similar", "I'd prefer similar"],
      ["friction", "It's a real friction point"],
      ["never-thought", "Never thought about it"],
    ],
  ),
];

// ---------------------------------------------------------- communication (13)

const COMMUNICATION: readonly ChemistryQuestion[] = [
  makeQuestion(
    "communication",
    "annoyed",
    "When you're annoyed, do you talk immediately or cool off first?",
    [
      ["immediately", "Talk about it immediately"],
      ["cool-off", "Cool off, then talk"],
      ["depends-size", "Depends how big it is"],
      ["go-quiet", "Go quiet and hope it passes"],
    ],
  ),
  makeQuestion("communication", "apology", "What does a good apology sound like to you?", [
    ["heard", "“I hear you”"],
    ["specific", "“I'm sorry, specifically for…”"],
    ["changed", "Changed behaviour"],
    ["space", "Time and space"],
  ]),
  makeQuestion(
    "communication",
    "contact-cadence",
    "How often do you like to hear from someone in a new relationship?",
    [
      ["rarely", "Rarely; quality over quantity"],
      ["daily-light", "Once a day, lightly"],
      ["check-ins", "A few check-ins a day"],
      ["all-day", "A running conversation all day"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("communication", "silence", "How do you handle a partner's silence?", [
    ["give-space", "Give them space"],
    ["check-once", "Check in once"],
    ["worry", "Worry a little"],
    ["assume-worst", "Assume the worst, then pretend not to"],
  ]),
  makeQuestion("communication", "repair", "What's your repair move after a fight?", [
    ["joke", "A well-timed joke"],
    ["hug", "A hug"],
    ["long-talk", "A long talk"],
    ["snack-nap", "A snack and a nap"],
  ]),
  makeQuestion("communication", "feedback", "How direct do you want feedback?", [
    ["unfiltered", "Unfiltered"],
    ["gentle-clear", "Gentle but clear"],
    ["writing", "In writing, please"],
    ["self-notice", "Let me notice it myself"],
  ]),
  makeQuestion("communication", "asking", "What's harder: saying what you need or asking for it?", [
    ["saying", "Saying it"],
    ["asking", "Asking for it"],
    ["both", "Both, honestly"],
    ["neither", "Neither; I'm annoyingly direct"],
  ]),
  makeQuestion("communication", "texting", "How do you feel about texting during the day?", [
    ["running", "Love a running chat"],
    ["few", "A few check-ins"],
    ["logistics", "Logistics only"],
    ["call", "I'd rather call"],
  ]),
  makeQuestion("communication", "plans-change", "When plans change, what helps?", [
    ["tell-soon", "Tell me as soon as you know"],
    ["options", "Give me options"],
    ["adapt", "I'll adapt"],
    ["snacks", "Bring snacks as compensation"],
  ]),
  makeQuestion(
    "communication",
    "money-talk",
    "How do you want to handle disagreements about money?",
    [
      ["separate", "Keep finances separate"],
      ["shared", "Mostly shared"],
      ["case-by-case", "Talk it through case by case"],
      ["avoid", "Avoid it until it becomes a problem"],
    ],
  ),
  makeQuestion("communication", "reassurance", "What do you do when you need reassurance?", [
    ["ask", "Ask directly"],
    ["hints", "Drop hints"],
    ["wait", "Wait to be noticed"],
    ["self", "Reassure myself first"],
  ]),
  makeQuestion(
    "communication",
    "processing-time",
    "How do you feel about a partner needing a lot of processing time?",
    [
      ["respect", "Fine; I respect it"],
      ["deadline", "I need some idea of when"],
      ["anxious", "It makes me anxious"],
      ["depends-issue", "Depends on the issue"],
    ],
  ),
  makeQuestion("communication", "hard-news", "How do you prefer to receive difficult news?", [
    ["straight", "Straight away"],
    ["thought-through", "After they've thought it through"],
    ["in-person", "In person"],
    ["message", "In a message, so I can react privately"],
  ]),
];

// ---------------------------------------------------------------- values (13)

const VALUES: readonly ChemistryQuestion[] = [
  makeQuestion(
    "values",
    "treat-people",
    "What matters most in how you treat people?",
    [
      ["honesty", "Honesty"],
      ["kindness", "Kindness"],
      ["reliability", "Reliability"],
      ["curiosity", "Curiosity"],
    ],
    "multi",
  ),
  makeQuestion(
    "values",
    "beliefs",
    "How do you feel about a partner's religious or spiritual beliefs?",
    [
      ["share", "I'd want to share mine"],
      ["different", "Different is fine"],
      ["private", "It's private"],
      ["matters", "It matters more than people think"],
    ],
  ),
  makeQuestion("values", "big-decisions", "How do you make big decisions?", [
    ["gut", "Gut first"],
    ["research", "List and research"],
    ["talk", "Talk it out"],
    ["sleep", "Sleep on it for a week"],
  ]),
  makeQuestion("values", "family-role", "What role should family play in a relationship?", [
    ["central", "Central"],
    ["important-separate", "Important but separate"],
    ["chosen", "Chosen family counts most"],
    ["little", "As little as possible"],
  ]),
  makeQuestion(
    "values",
    "children",
    "How do you feel about children?",
    [
      ["want", "I want them"],
      ["dont-want", "I don't want them"],
      ["open", "Open either way"],
      ["not-alone", "Not a decision I'd make alone"],
    ],
    "single",
    { help: "Skipping this question is always allowed." },
  ),
  makeQuestion("values", "money-value", "How do you think about money as a value?", [
    ["security", "Security first"],
    ["generosity", "Generosity"],
    ["experiences", "Experiences over things"],
    ["freedom", "Freedom over savings"],
  ]),
  makeQuestion("values", "politics", "How do you feel about a partner's political views?", [
    ["align", "They must align"],
    ["differ", "We can differ respectfully"],
    ["avoid", "I'd rather not discuss it"],
    ["depends", "Depends on the issue"],
  ]),
  makeQuestion("values", "loyalty", "What does loyalty mean to you?", [
    ["defend", "Defending me in public"],
    ["honesty", "Honesty in private"],
    ["choosing", "Choosing us over convenience"],
    ["all", "All of it, obviously"],
  ]),
  makeQuestion("values", "promises", "How do you treat a promise you can no longer keep?", [
    ["renegotiate", "Renegotiate early"],
    ["apologise", "Apologise and adapt"],
    ["gnaws", "It gnaws at me until it's fixed"],
    ["size", "Depends how big it was"],
  ]),
  makeQuestion(
    "values",
    "community",
    "How important is community or volunteering to you?",
    [
      ["not", "Not at all"],
      ["occasionally", "Occasionally"],
      ["regular", "A regular part of my life"],
      ["central", "Central"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion(
    "values",
    "belief-change",
    "How do you feel about a partner changing their beliefs over time?",
    [
      ["welcome", "Welcome it"],
      ["worried", "Worried it changes us"],
      ["depends-belief", "Depends on the belief"],
      ["talk", "I'd want to talk it through"],
    ],
  ),
  makeQuestion(
    "values",
    "never-compromise",
    "What would you never compromise on?",
    [
      ["honesty", "Honesty"],
      ["safety", "Physical safety"],
      ["freedom", "Personal freedom"],
      ["family-duty", "Family duty"],
      ["independence", "Financial independence"],
    ],
    "multi",
  ),
  makeQuestion("values", "traditions", "How do you want to handle traditions you don't share?", [
    ["blend", "Blend them"],
    ["favourites", "Pick the favourites"],
    ["skip", "Skip them"],
    ["alternate", "Alternate years"],
  ]),
];

// ------------------------------------------------------------- affection (12)

const AFFECTION: readonly ChemistryQuestion[] = [
  makeQuestion("affection", "glad-to-see", "How do you show someone you're glad to see them?", [
    ["words", "Words"],
    ["touch", "Touch"],
    ["plan", "A plan"],
    ["food", "Food"],
  ]),
  makeQuestion("affection", "receive", "How do you like to receive affection?", [
    ["words", "Words"],
    ["touch", "Touch"],
    ["time", "Time"],
    ["favours", "Favours"],
  ]),
  makeQuestion(
    "affection",
    "public",
    "How do you feel about public affection?",
    [
      ["private", "Private only"],
      ["a-little", "A little is lovely"],
      ["comfortable", "Comfortable"],
      ["all-in", "All in"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("affection", "hand-hold", "What's your default when someone holds your hand?", [
    ["squeeze", "Squeeze back"],
    ["seen", "Feel quietly seen"],
    ["awkward", "Get a bit awkward"],
    ["sometimes", "Only sometimes"],
  ]),
  makeQuestion(
    "affection",
    "evening-closeness",
    "How much physical closeness do you want on a normal evening?",
    [
      ["little", "Very little"],
      ["some", "Some, here and there"],
      ["regular", "Regular closeness"],
      ["a-lot", "A lot of it"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion(
    "affection",
    "feelings-talk",
    "How do you feel about a partner's need to talk about feelings?",
    [
      ["bring-it", "Bring it on"],
      ["small-doses", "Small doses"],
      ["doing", "Prefer doing something together"],
      ["notice", "I need some notice"],
    ],
  ),
  makeQuestion(
    "affection",
    "emotional-safety",
    "What helps you feel emotionally safe?",
    [
      ["consistency", "Consistency"],
      ["being-asked", "Being asked"],
      ["space", "Being left alone sometimes"],
      ["honesty", "Honesty, even when it's awkward"],
    ],
    "multi",
  ),
  makeQuestion("affection", "cuddling-sleep", "How do you feel about cuddling to sleep?", [
    ["essential", "Essential"],
    ["a-while", "Nice for a while"],
    ["too-warm", "Too warm"],
    ["depends", "Depends on the night"],
  ]),
  makeQuestion("affection", "touch-stressed", "How do you feel about touch when you're stressed?", [
    ["grounds", "It grounds me"],
    ["ask", "Ask first"],
    ["space", "I need space"],
    ["depends", "Depends on the stress"],
  ]),
  makeQuestion("affection", "tired-language", "What's your love language when you're tired?", [
    ["quiet-hug", "A quiet hug"],
    ["dinner", "Someone else handles dinner"],
    ["conversation", "A good conversation"],
    ["leave-me", "Leave me be for a bit"],
  ]),
  makeQuestion(
    "affection",
    "different-style",
    "How do you feel about a partner's different affection style?",
    [
      ["learn", "Happy to learn it"],
      ["middle", "Meet in the middle"],
      ["worried", "It worries me"],
      ["depends-different", "Depends how different"],
    ],
  ),
  makeQuestion(
    "affection",
    "care-without-words",
    "How do you say “I care” without saying it?",
    [
      ["details", "Remembering details"],
      ["showing-up", "Showing up"],
      ["small-gifts", "Small gifts"],
      ["fixing", "Fixing things"],
    ],
    "multi",
  ),
];

// -------------------------------------------------------------- intimacy (12)

const INTIMACY: readonly ChemistryQuestion[] = [
  makeQuestion(
    "intimacy",
    "when-to-talk",
    "How early do you want to talk about intimacy?",
    [
      ["early", "Pretty early"],
      ["naturally", "When it comes up naturally"],
      ["after-trust", "After trust builds"],
      ["show-dont-tell", "I'd rather show than discuss"],
    ],
    "single",
    { help: "Non-explicit. Answers stay private unless you choose to summarize them." },
  ),
  makeQuestion("intimacy", "planning", "How do you feel about planning intimacy?", [
    ["planning-sexy", "Planning can be appealing"],
    ["spontaneous", "Spontaneity or nothing"],
    ["mix", "A mix of both"],
    ["need-know", "I need to know what's coming"],
  ]),
  makeQuestion(
    "intimacy",
    "comfortable-discussing",
    "What helps you feel comfortable discussing expectations?",
    [
      ["direct", "A direct conversation"],
      ["humour", "Humour"],
      ["writing", "Writing it down"],
      ["time", "Time to think"],
    ],
    "multi",
  ),
  makeQuestion("intimacy", "mismatched-pace", "How do you handle a mismatched pace?", [
    ["talk", "Talk about it"],
    ["compromise", "Compromise"],
    ["resolve", "Let it resolve itself"],
    ["worry", "Worry quietly"],
  ]),
  makeQuestion(
    "intimacy",
    "intimacy-check-ins",
    "How do you feel about check-ins during intimate moments?",
    [
      ["essential", "Essential"],
      ["natural", "Natural if it fits"],
      ["mood", "It can break the mood"],
      ["depends-us", "Depends on us"],
    ],
  ),
  makeQuestion("intimacy", "taking-it-slow", "What does “taking it slow” mean to you?", [
    ["weeks", "A few weeks"],
    ["months", "A few months"],
    ["not-time", "It isn't about time"],
    ["whatever-agreed", "Whatever we agree on"],
  ]),
  makeQuestion(
    "intimacy",
    "privacy",
    "How do you feel about a partner's privacy around intimacy?",
    [
      ["private", "Private, always"],
      ["close-friends", "Share with close friends"],
      ["open-book", "Open book"],
      ["depends", "Depends on the situation"],
    ],
  ),
  makeQuestion(
    "intimacy",
    "boundaries-first",
    "How important is discussing boundaries before anything happens?",
    [
      ["unnecessary", "Unnecessary"],
      ["sometimes", "Sometimes"],
      ["important", "Important"],
      ["essential", "Essential"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("intimacy", "safer-no", "What would make you feel safer to say no?", [
    ["allowed", "Knowing it's always allowed"],
    ["practice", "Practising the words"],
    ["codeword", "A light-hearted codeword"],
    ["nothing", "Nothing; I'm very good at it"],
  ]),
  makeQuestion("intimacy", "laughing", "How do you feel about laughing during intimacy?", [
    ["yes", "Yes, please"],
    ["sometimes", "Sometimes"],
    ["self-conscious", "I'd feel self-conscious"],
    ["depends", "Depends on the moment"],
  ]),
  makeQuestion(
    "intimacy",
    "warm-up",
    "How do you feel about a partner who needs more warm-up than you?",
    [
      ["happy", "Happy to take the time"],
      ["impatient", "Impatient sometimes"],
      ["talk", "Something we'd talk about"],
      ["never-thought", "Never thought about it"],
    ],
  ),
  makeQuestion(
    "intimacy",
    "desire-difference",
    "How do you want to handle a difference in desire?",
    [
      ["talk-openly", "Talk openly"],
      ["accept", "Accept it as it is"],
      ["professional", "See a professional together"],
      ["problem", "It would be a problem"],
    ],
  ),
];

// ------------------------------------------------------------- adventure (12)

const ADVENTURE: readonly ChemistryQuestion[] = [
  makeQuestion(
    "adventure",
    "trip-two-days",
    "How do you feel about a trip planned two days in advance?",
    [
      ["yes", "Yes, immediately"],
      ["price", "If the price is right"],
      ["notice", "I prefer a month's notice"],
      ["emergency", "That's not a trip, that's an emergency"],
    ],
  ),
  makeQuestion(
    "adventure",
    "new-restaurant",
    "How do you feel about trying a new restaurant every week?",
    [
      ["yes", "Every week"],
      ["occasionally", "Every so often"],
      ["favourites", "I have my favourites"],
      ["someone-else", "Only if someone else chooses"],
    ],
  ),
  makeQuestion("adventure", "surprise", "What's your idea of a good surprise?", [
    ["small", "A small one"],
    ["big", "A big one"],
    ["stress", "Surprises stress me out"],
    ["food", "Surprise me with food"],
  ]),
  makeQuestion(
    "adventure",
    "never-done",
    "How do you feel about an activity you've never done before?",
    [
      ["sign-up", "Sign me up"],
      ["watch", "Let me watch first"],
      ["depends-height", "Depends on the height"],
      ["coats", "I'll hold the coats"],
    ],
  ),
  makeQuestion("adventure", "travel-style", "How do you like to travel?", [
    ["itinerary", "Detailed itinerary"],
    ["loose", "Loose plan"],
    ["one-thing", "Book one thing"],
    ["locals", "Whatever the locals say"],
  ]),
  makeQuestion(
    "adventure",
    "weeknight-plans",
    "How do you feel about spontaneous plans during the week?",
    [
      ["always", "Always up for it"],
      ["sometimes", "Sometimes"],
      ["friday", "Friday only"],
      ["calendar-no", "My calendar says no"],
    ],
  ),
  makeQuestion("adventure", "lost", "How do you handle getting lost?", [
    ["adventure", "It's an adventure"],
    ["directions", "Ask for directions"],
    ["panic", "Quietly panic"],
    ["phone", "Phones exist for a reason"],
  ]),
  makeQuestion(
    "adventure",
    "comfort-zone",
    "How do you feel about a partner with a very different comfort zone?",
    [
      ["expand", "We expand each other"],
      ["separate", "Separate adventures are fine"],
      ["dont-push", "I don't want to be pushed"],
      ["depends-comfort", "Depends on the thing"],
    ],
  ),
  makeQuestion("adventure", "fears", "Heights, water or small spaces?", [
    ["all-fine", "All fine"],
    ["one-no", "One of them, no thanks"],
    ["depends-fear", "Depends how high or deep"],
    ["supervise", "I'll supervise from here"],
  ]),
  makeQuestion(
    "adventure",
    "no-plan-weekend",
    "How do you feel about a weekend with no plan?",
    [
      ["uneasy", "Uneasy"],
      ["some-plan", "Better with a rough idea"],
      ["fine", "Happy with it"],
      ["blissful", "Blissful"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("adventure", "hosting", "How do you feel about hosting?", [
    ["love", "Love it"],
    ["small", "Small groups only"],
    ["someone-else", "Someone else's turn"],
    ["ice", "I'll bring ice"],
  ]),
  makeQuestion("adventure", "own-hobby", "How do you feel about a hobby you don't share?", [
    ["encouraging", "Encouraging"],
    ["curious", "Curious about it"],
    ["jealous", "Slightly jealous of the time"],
    ["shared", "I'd prefer shared hobbies"],
  ]),
];

// ----------------------------------------------------------------- humor (12)

const HUMOR: readonly ChemistryQuestion[] = [
  makeQuestion(
    "humor",
    "flirting",
    "Is flirting an art form, a competitive sport, or a skill you're still developing?",
    [
      ["art", "An art form"],
      ["sport", "A competitive sport"],
      ["developing", "Still developing"],
      ["all-three", "All three on a good day"],
    ],
  ),
  makeQuestion("humor", "joke-badly", "When a joke lands badly, what happens?", [
    ["laugh-self", "I laugh at myself"],
    ["explain", "I explain it"],
    ["move-on", "I move on"],
    ["commit", "I commit harder"],
  ]),
  makeQuestion(
    "humor",
    "teasing",
    "How much teasing feels affectionate?",
    [
      ["none", "None, thanks"],
      ["gentle", "A gentle amount"],
      ["regular", "A regular thing"],
      ["a-lot", "A lot of it"],
    ],
    "single",
    { layout: "scale" },
  ),
  makeQuestion("humor", "group-chat", "Who are you in a group chat?", [
    ["joke-machine", "The joke machine"],
    ["quiet", "The quiet one"],
    ["planner", "The planner"],
    ["on-read", "The one who leaves it on read"],
  ]),
  makeQuestion(
    "humor",
    "funny-kind",
    "What kind of humour gets you every time?",
    [
      ["wordplay", "Wordplay"],
      ["absurd", "The absurd"],
      ["dry", "Dry delivery"],
      ["physical", "Physical comedy"],
      ["dark-ish", "A little dark"],
    ],
    "multi",
  ),
  makeQuestion(
    "humor",
    "funnier-partner",
    "How do you feel about a partner who is funnier than you?",
    [
      ["thrilled", "Thrilled"],
      ["competitive", "Competitive"],
      ["fine", "Fine with it"],
      ["everyone", "Let's be honest, everyone is"],
    ],
  ),
  makeQuestion("humor", "butt-of-joke", "How do you feel about being the butt of a joke?", [
    ["fine-known", "Fine if I know you"],
    ["not-public", "Not in public"],
    ["depends-joke", "Depends on the joke"],
    ["no", "Absolutely not"],
  ]),
  makeQuestion("humor", "odd-humour", "How do you handle someone's odd sense of humour?", [
    ["ask", "Ask about it"],
    ["match", "Match it"],
    ["not-for-me", "Decide it's not for me"],
    ["back-away", "Nod and back away slowly"],
  ]),
  makeQuestion("humor", "first-meeting", "What's your energy on a first meeting?", [
    ["chatty", "Warm and chatty"],
    ["observant", "Quietly observant"],
    ["nervous-talker", "Nervous talker"],
    ["depends-day", "Depends on the day"],
  ]),
  makeQuestion("humor", "silly-traditions", "How do you feel about silly traditions?", [
    ["invent", "Invent them"],
    ["tolerate", "Tolerate them"],
    ["avoid", "Avoid them"],
    ["christmas", "Only at Christmas"],
  ]),
  makeQuestion("humor", "break-ice", "How do you break the ice?", [
    ["question", "A good question"],
    ["joke", "A joke"],
    ["compliment", "A compliment"],
    ["wait", "I wait to be spoken to"],
  ]),
  makeQuestion("humor", "not-funny", "What do you do when you disagree about what's funny?", [
    ["different-joke", "Find a different joke"],
    ["keep-at-it", "Keep at it"],
    ["judge", "Judge silently"],
    ["laugh-anyway", "Laugh anyway"],
  ]),
];

// ------------------------------------------------------- bank and manifests

const QUESTIONS_BY_DIMENSION: Readonly<Record<ChemistryDimensionId, readonly ChemistryQuestion[]>> =
  {
    goals: GOALS,
    lifestyle: LIFESTYLE,
    communication: COMMUNICATION,
    values: VALUES,
    affection: AFFECTION,
    intimacy: INTIMACY,
    adventure: ADVENTURE,
    humor: HUMOR,
  };

/**
 * Fixed round-robin order over the whole bank. A manifest is a per-dimension prefix
 * filter of this order, so manifests nest and never depend on a participant.
 */
export const CHEMISTRY_QUESTIONS: readonly ChemistryQuestion[] = (() => {
  const ordered: ChemistryQuestion[] = [];
  const longest = Math.max(
    ...DIMENSIONS.map((dimension) => QUESTIONS_BY_DIMENSION[dimension.id].length),
  );
  for (let index = 0; index < longest; index += 1) {
    for (const dimension of DIMENSIONS) {
      const question = QUESTIONS_BY_DIMENSION[dimension.id][index];
      if (question) ordered.push(question);
    }
  }
  return ordered;
})();

export function manifestId(depth: ChemistryDepth): string {
  return `${CHEMISTRY_BANK_VERSION}/${depth}`;
}

/** Questions of a depth in editorial order. Sets are nested: 25 ⊂ 50 ⊂ 100. */
export function manifestQuestions(depth: ChemistryDepth): readonly ChemistryQuestion[] {
  const selected = new Set<string>();
  for (const dimension of DIMENSIONS) {
    const count = DEPTH_ALLOCATION[dimension.id][depth];
    for (const question of QUESTIONS_BY_DIMENSION[dimension.id].slice(0, count)) {
      selected.add(question.id);
    }
  }
  return CHEMISTRY_QUESTIONS.filter((question) => selected.has(question.id));
}

export const MANIFESTS: Readonly<
  Record<
    ChemistryDepth,
    { id: string; depth: ChemistryDepth; questions: readonly ChemistryQuestion[] }
  >
> = {
  25: { id: manifestId(25), depth: 25, questions: manifestQuestions(25) },
  50: { id: manifestId(50), depth: 50, questions: manifestQuestions(50) },
  100: { id: manifestId(100), depth: 100, questions: manifestQuestions(100) },
};

export function questionById(id: string, depth: ChemistryDepth): ChemistryQuestion | null {
  return MANIFESTS[depth].questions.find((question) => question.id === id) ?? null;
}

export function questionsForDimension(
  dimension: ChemistryDimensionId,
  depth: ChemistryDepth,
): readonly ChemistryQuestion[] {
  return MANIFESTS[depth].questions.filter((question) => question.dimension === dimension);
}

export const QUESTION_COUNT = CHEMISTRY_QUESTIONS.length;
