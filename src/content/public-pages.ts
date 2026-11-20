import type { PublicPath } from "../config/site";

export interface PublicPage {
  path: PublicPath;
  title: string;
  description: string;
  heading: string;
  image: "default" | "wheel" | "date-night" | "chemistry" | "recipes" | "secret-menu";
  body: string;
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    title: "CheapSeggs — Cheap Seggs. Priceless Memories.",
    description:
      "Playful discovery for consenting adults. Explore the CheapSeggs public preview and our plans for date-night games, private matching and Chemistry Check.",
    heading: "Cheap Seggs. Priceless Memories.",
    image: "default",
    body: "",
  },
  {
    path: "/wheel/",
    title: "Wheel of Misfortune — Adult Discovery Game Plans | CheapSeggs",
    description:
      "Meet the planned Wheel of Misfortune: a playful discovery wheel with personal boundaries, accessible results and distinct discovery, solo and mutual modes.",
    heading: "The Wheel of <em>Misfortune.</em>",
    image: "wheel",
    body: `<p class="pill">PLAYABLE NOW · FREE · NO ACCOUNT</p><p>A spin supplies an idea to discuss. It never supplies permission to do it. The Wheel of Misfortune is our flagship: a theatrical little game for consenting adults who want a more interesting conversation starter.</p><p><a class="button button-small" href="/play/">Spin the wheel</a></p><h2>Three modes, three clear meanings</h2><ul><li><strong>Discovery (live):</strong> consider an idea together. Discuss it, pass on it, or leave it for another evening.</li><li><strong>Solo Exploration (planned):</strong> privately explore your own curiosity without automatically sharing it.</li><li><strong>Mutual Mischief (planned):</strong> future shared play restricted to ideas independently approved YES by both partners. Maybe means discuss.</li></ul><h2>Your boundaries set the menu</h2><p>Heat, experimentation, energy, time, environment and supplies narrow the selection. Exclusions and specific category opt-ins stay separate, so a higher heat setting can never override a boundary. If your limits leave nothing, the wheel says so and offers no invented alternative.</p><h2>Delight without pressure</h2><p>The result is chosen on our server before the animation starts, and every result is readable as a list. Reduced-motion settings get the answer instantly, sound is off until you enable it, and the whole thing works from a keyboard. There are no bets, cash prizes, penalties for passing or intimate tasks anyone owes another person.</p><p>Every result names its category, heat, duration and any preparation, accessibility notes and house rules. What you do with it is entirely up to you.</p>`,
  },
  {
    path: "/date-night/",
    title: "Date Night Machine — Personalized Evening Plans | CheapSeggs",
    description:
      "Explore the planned Date Night Machine: coherent evenings shaped around mood, time, energy and supplies, with optional steps and boundaries respected.",
    heading: "Tonight's special:<br/><em>whatever you both want.</em>",
    image: "date-night",
    body: `<p class="pill">PLANNED · GENERATOR NOT AVAILABLE YET</p><p>A good evening needs more than a handful of unrelated dares. The Date Night Machine is designed to turn your mood, time and ingredients into a coherent plan.</p><h2>A recipe, not a random pile</h2><p>The planned flow moves from atmosphere and warm-up into compatible activities, optional alternatives and a finale or reconnection. Each part stays optional. Low-energy and seated alternatives belong on the menu too.</p><h2>Bring what you actually have</h2><p>Choose a time budget, private setting, available supplies and preparation you are comfortable with. Heat and experimentation are separate choices. If nothing fits, the generator should say so instead of quietly relaxing your exclusions.</p><h2>Shared plans need fresh agreement</h2><p>Future partner plans will use independently approved interests and recheck them when you open a saved recipe. A saved plan is not permanent consent. Accounts, generation and saved experiences are not enabled in this public preview.</p>`,
  },
  {
    path: "/chemistry/",
    title: "Chemistry Check — Pre-Date Compatibility Plans | CheapSeggs",
    description:
      "Learn about planned 25, 50 and 100-question pre-date assessments, independent invitations, acceptance-based alignment and mutually approved category summaries.",
    heading: "A little less guessing<br/><em>before the first date.</em>",
    image: "chemistry",
    body: `<p class="pill">PLANNED · ASSESSMENTS NOT AVAILABLE YET</p><p>Chemistry Check is designed for two adults who already have initial romantic interest and want to explore expectations before meeting or starting a relationship. You will not need to be an established couple.</p><h2>25, 50 or 100 questions</h2><p>The planned dimensions are relationship goals, lifestyle, communication, values, affection, sexual compatibility, adventure, and humor/personality. Skipping will always be available. Intimate topics will require specific opt-in.</p><h2>Different answers can work together</h2><p>Your own answer and the answers you accept from another person are different things. Chemistry Check is planned to consider acceptance and importance, with explicit dealbreakers evaluated separately from weighted alignment.</p><h2>An invitation is not a relationship</h2><p>Accepting an assessment invitation will not create a couple, reveal private responses or grant access to either account. Both people must independently approve a specific result-sharing scope. Withdrawal and expiration will end future access.</p><h2>Private answers, careful summaries</h2><p>The initial design favors optional category-level summaries instead of individual sexual answers or private dealbreaker details. Even a summary reveals some information, so sharing will require an informed choice. General-answer reuse will also be optional and confirmed per assessment.</p><p>This will be a conversation aid, not a scientifically validated prediction, a safety check or consent to intimate activity. No responses are being collected now.</p>`,
  },
  {
    path: "/secret-menu/",
    title: "The Secret Menu — Private Partner Discovery Plans | CheapSeggs",
    description:
      "Understand the planned Secret Menu: independent private preferences, YES/YES shared discovery, revocable relationships and clear limits on disclosure.",
    heading: "Private curiosity.<br/><em>Mutual possibilities.</em>",
    image: "secret-menu",
    body: `<p class="pill">PLANNED · PRIVATE MATCHING DISABLED</p><p>The Secret Menu is a planned space for each partner to privately consider activities and interests. The goal is to share possibilities you both welcome without showing a partner your private response sheet.</p><h2>Four responses, one eligibility rule</h2><p>YES, MAYBE / discuss, NO and Hard NO have different meanings. Only current YES/YES approvals will automatically qualify for a shared pool. A maybe is not consent, and a purchase cannot override a boundary.</p><h2>Independent people, revocable relationships</h2><p>Each person will use their own account. Joining, sharing, leaving and deleting will be explicit actions. A relationship will not create a standing right to private answers or future intimate activity.</p><h2>What matching necessarily reveals</h2><p>A shared positive result reveals some shared interest. We cannot promise to eliminate every inference or erase screenshots. The design limits probing, negative labels, partner progress and result counts, with fresh checks after changes or withdrawal.</p><p>Authentication, encrypted private storage and deletion controls must be implemented and reviewed before this feature accepts real answers. It is not available in the current preview.</p>`,
  },
  {
    path: "/recipes/",
    title: "Romance Cookbook — Date-Night Recipe Plans | CheapSeggs",
    description:
      "A preview of the planned Romance Cookbook: curated date-night themes with ingredients, preparation, optional steps and accessible alternatives.",
    heading: "Good chemistry,<br/><em>by the recipe.</em>",
    image: "recipes",
    body: `<p class="pill">PLANNED · CURATED COLLECTION IN DEVELOPMENT</p><p>Part saucy recipe book, part evening inspiration. The Romance Cookbook is planned to bring themed experiences together with clear ingredients, preparation and optional progression.</p><h2>A tiny non-explicit sample</h2><ul><li><strong>Set the soundtrack:</strong> choose one song each to give the evening a mood. A quiet shared pause works too.</li><li><strong>Compliments, on the house:</strong> take turns sharing something you appreciate. Say it, write it, or sign it. Passing is welcome.</li><li><strong>The living-room slow dance:</strong> invite a dance, try seated movement, or simply listen together. Ask before touch.</li></ul><h2>What a full recipe will include</h2><p>Each planned recipe has a theme, duration, difficulty, heat, supplies, preparation, boundaries and compatibility conditions. Substitutions must fit the same boundaries as the original step.</p><p>These three sample ideas are available in the public lounge. Full recipes, personalized generation, saved collections and paid packs are not yet available.</p>`,
  },
  {
    path: "/about/",
    title: "About CheapSeggs — Playful Discovery, Thoughtful Boundaries",
    description:
      "Why CheapSeggs exists: playful adult discovery with a retro lounge personality, independent choices and a privacy-conscious engineering approach.",
    heading: "The joke is the packaging.<br/><em>The care is real.</em>",
    image: "default",
    body: `<p>CheapSeggs is being built for consenting adults who want to discover what they both fancy and make more memorable evenings together. Think retro motel neon, a tiny game-show stage and a romance cookbook with a sense of humor.</p><h2>Entertainment and chemistry</h2><p>This is not a therapy service, a relationship diagnosis, a dating directory or a promise of compatibility. The product aims to make curiosity enjoyable while keeping passing, changing your mind and stopping part of the experience.</p><h2>What is live today</h2><p>The free guest Discovery wheel is playable in <a href="/play/">the lounge</a>: a reviewed non-explicit catalog, your own heat and category limits, and server-side selection you cannot bias from the browser. Public feature explanations and three non-explicit sample ideas are also available. There is no account registration, private questionnaire, partner invitation or payment.</p><h2>How we build trust</h2><p>Private workflows stay closed until their authentication, authorization, storage and deletion controls are ready. We do not claim end-to-end encryption. Optional public-site analytics require your choice and exclude intimate answers, results and private URLs; the lounge emits no analytics. Guest wheels keep their short-lived state in memory and on a 24-hour server TTL, never as a preference profile.</p><p>Development is maintained in the <a href="https://github.com/hmarquardt/cheapseggs" rel="noopener noreferrer">CheapSeggs repository</a>. Use public issues only for non-sensitive technical feedback; do not post intimate or personal information there.</p>`,
  },
  {
    path: "/privacy/",
    title: "Privacy & Discretion — CheapSeggs Public Preview",
    description:
      "How the CheapSeggs public preview handles optional CFLab analytics, browser preferences, technical delivery and planned private workflows.",
    heading: "Your business.<br/><em>Your boundaries.</em>",
    image: "default",
    body: `<p class="lede">This notice describes the current public release. Updated November 20, 2026.</p><h2>No accounts, no answers, no intimate history</h2><p>There is no registration, authentication session, stored questionnaire response, private preference, intimate history or checkout in this release. The lounge's adult acknowledgement and settings stay in memory and reset when you reload. The acknowledgement is not age verification.</p><h2>What a spin stores</h2><p>The Discovery wheel needs a short-lived guest record so a repeat or double-tapped spin returns the same idea, and so you can avoid seeing the same idea twice. That record contains a random session identifier kept only in browser memory, a one-way digest of your settings, the chosen idea's public catalog identifier, the catalog version and expiry times. It does <strong>not</strong> contain your heat level, exclusions, opt-ins, answers or any activity you chose to perform. Nothing is written to cookies, local storage or session storage.</p><p>Guest records expire after 24 hours and are deleted in small batches as later requests arrive. Clearing the session in the lounge, or simply waiting a day, removes them; you can also clear your browser data. Deleting the record cannot unsee something you already read.</p><h2>Optional public-site analytics</h2><p>Analytics is off unless you choose Allow analytics. A small first-party client sends an allowlisted public-page path, pageview or supported event name and a random event identifier to CFLab Analytics at analytics.aismallbizguru.com. It sends no questionnaire answers, sexual interests, dealbreakers, recipe contents, partner identifiers, private paths, query strings, campaign parameters, referrer, cookies or persistent visitor/session identifier.</p><p>CFLab processes network information to receive requests and prevent abuse, and derives coarse browser/device and country/region information. It does not store a full IP address or raw user-agent under its current collector contract. This site's raw-event retention is seven days; aggregate reports follow CFLab's existing aggregate retention. These counts are not a count of unique people. The lounge at <code>/play/</code> and future private routes never send automatic analytics pageviews, so spins and settings are not measured there.</p><p>Your optional choice is stored as granted or denied in local storage, without an identifier. Turn it off with the controls below or clear site storage. Do Not Track and Global Privacy Control override permission.</p><h2>Delivery and security</h2><p>Cloudflare hosts the site and processes requests to deliver pages, HTTPS and abuse protection. Application request logging is disabled; we do not intentionally log personal query strings or private content. No email delivery, payment processor or external model receives data from this release. We cannot describe network delivery as anonymous or promise that a service provider processes no technical data.</p><h2>Before private features open</h2><p>The planned service will need independent identities, explicit disclosure controls, bounded retention and verified deletion. Application processing may calculate approved matches; no end-to-end encryption claim is made. Chemistry Check participation will be separate from couple membership and sexual consent. A new notice and appropriate market/legal review are required before those features collect real responses.</p><h2>Contact and feedback</h2><p>The <a href="https://github.com/hmarquardt/cheapseggs" rel="noopener noreferrer">project repository</a> provides non-sensitive technical feedback and current development information. Do not submit intimate answers or personal privacy records to public issues. A dedicated private support channel must be established before private customer workflows open.</p>`,
  },
  {
    path: "/terms/",
    title: "Terms of Use — CheapSeggs Public Preview",
    description:
      "Terms for the current CheapSeggs public preview: adults only, optional participation, no live accounts or purchases, and clear limits on planned features.",
    heading: "A few <em>house rules.</em>",
    image: "default",
    body: `<p class="lede">Public release terms. Updated November 20, 2026.</p><h2>Adults only, participation optional</h2><p>CheapSeggs is intended for consenting adults aged 18 and older. Do not use the service to pressure another person, disregard a boundary, exploit anyone or involve minors. An idea, spin, assessment, purchase or relationship never constitutes consent to an intimate act.</p><h2>Current functionality</h2><p>The current release offers a free guest Discovery wheel with a non-explicit reviewed catalog, plus public explanations and a lounge preview. Private preferences, partner matching, Chemistry Check assessments, accounts and purchases remain planned. No money is charged and there is no subscription or real-money gambling.</p><h2>Limits of the content</h2><p>Content is entertainment and general inspiration. It is not medical, therapeutic, legal, safety or predictive compatibility advice. Use your judgment and communicate directly. No particular experience or relationship outcome is promised.</p><h2>Privacy and changes</h2><p>Read the <a href="/privacy/">privacy notice</a> for the current data practices and optional analytics. New private or paid services will require their own clearly disclosed terms, working controls and applicable review before launch. Availability and preview content may change.</p><h2>Feedback</h2><p>Use the <a href="https://github.com/hmarquardt/cheapseggs/issues" rel="noopener noreferrer">public repository issues</a> only for non-sensitive technical feedback. Never post private answers, account credentials or intimate information. These terms do not waive rights that applicable law does not allow to be waived.</p>`,
  },
];
