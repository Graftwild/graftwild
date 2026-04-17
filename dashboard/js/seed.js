// ═══════════════════ SEED DATA ═══════════════════
// Bump SEED_VERSION to force-wipe deals/outreach/revenue and re-seed on next page load.
// Ideas, IG Questions, and Templates are never wiped by a version bump.

const SEED_VERSION = '10';

function seedSampleData() {
  // ── Real active deals (sourced from Gmail, April 3 2026) ────────────────
  save(KEYS.deals, [
    {
      id: uid(), brand: 'HatorTempt', type: 'sponsored post', value: 250,
      status: 'signed', deadline: '2026-04-14',
      contact: 'Natascha Gerrbo — collab@hatortempt.com',
      deliverables: '1 reel (30–60 sec) Surf & Turf product + 1 story mentioning giveaway + affiliate link in Linktree for 2 months',
      notes: 'DRAFT SUBMITTED Mar 31 via Google Drive. Invoice sent same day. Followed up Apr 2 — NO RESPONSE as of Apr 3. Natascha said no rush, go live in April. $150 reel + $50 story + 20% commission. Storefront: https://jo.my/stryder_storefront | Product: https://jo.my/stryder_surf_turf. Via The Go North Group (natascha.gerrbo@thegonorthgroup.com). ACTION: Follow up again if no reply by Apr 7.',
      updated: '2026-03-27T12:00:00.000Z' // Natascha last replied Mar 27 — silent since (draft + invoice sent Mar 31, follow-up Apr 2, no response)
    },
    {
      id: uid(), brand: 'Scratch & Peck Feeds', type: 'sponsored post', value: 375,
      status: 'negotiating', deadline: '',
      contact: 'Scout Foster — Scout@scratchandpeck.com',
      deliverables: '1 dedicated video featuring organic feed (chick starter + layer mash), IG Reel + TikTok cross-post',
      notes: 'Products in hand: chick starter crumble bundle + layer mash arrived. Scout offered $250 + 10% commission (Apr 1) — justified by product bundle sent. Stryder countered at $375 (Apr 1), addressed wheat positioning: audience cares most about organic/non-GMO/soy-free, not wheat-free. AWAITING SCOUT REPLY as of Apr 3. Feed contains wheat. 18 laying hens + chicks coming. ACTION: Follow up if no reply by Apr 6.',
      updated: '2026-04-01T21:13:44.000Z' // Counter sent Apr 1 — awaiting Scout reply
    },
    {
      id: uid(), brand: 'Birdfy (Netvue)', type: 'sponsored post', value: 500,
      status: 'signed', deadline: '2026-04-30',
      contact: 'Netvue creator team — creator@netvue.com',
      deliverables: '1 dedicated Instagram Reel + TikTok cross-post featuring new 4K smart bird feeder launch',
      notes: 'SIGNED at $500. Payment: 40% upfront ($200) once confirmed, 60% ($300) after posting. Product shipment arranged Apr 2 — tracking link pending from Monica. Includes usage rights: social, website, co-branded IG ads. ACTION: Await tracking / product arrival before shooting.',
      updated: '2026-04-02T12:58:13.000Z' // Shipping arranged Apr 2 — awaiting tracking/product
    },
    {
      id: uid(), brand: "Roosty's", type: 'whitelisting', value: 200,
      status: 'completed', deadline: '2026-05-01',
      contact: 'Diana Balciunaite — diana@roostys.co',
      deliverables: '1-month whitelisting access for Flock Armor Chili Mix reel (181K views) + video file shared to Drive',
      notes: '✅ PAYMENT RECEIVED Apr 2 — $200 gross / $191.02 net via PayPal (FLAT INVESTMENT LIMITED, HK). TX: 5VP33900FN298791T. Reel uploaded to Drive, whitelisting access granted. Apr 2: Diana asked about bundle options — Stryder sent rates: 1 Video $500 / 2 Video Bundle $900 / 3 Video Bundle + Story $1,200. AWAITING DIANA REPLY on bundle. Reel stats: 181K views, 7.6K likes, 790 shares, 9,300+ interactions.',
      updated: '2026-04-02T16:31:00.000Z'
    },
    {
      id: uid(), brand: 'Eaton Pet & Pasture', type: 'sponsored post', value: 400,
      status: 'signed', deadline: '2026-04-21',
      contact: 'Madison Parkhurst — madison@eatonpetandpasture.com',
      deliverables: '1 fully produced reel posted on IG + cross-posted to TikTok',
      notes: 'SIGNED Apr 2 at $400 (Stryder met from $500 as good faith). Affiliate code LIVE: GRAFTWILD (20% off first orders) + referral link: https://eatonpetandpasture.com/discount/GRAFTWILD. Commission: 5% via Refersion Unified Payments. ACTION: (1) Set up Refersion payment account — see https://support.refersion.com/en/articles/5819978-getting-started-with-unified-payments-affiliates. (2) Shoot content ASAP — most ready deal, products in hand.',
      updated: '2026-04-03T16:03:25.000Z' // Affiliate code received today Apr 3
    },
  ]);

  // ── Outreach ─────────────────────────────────────────────────────────────
  save(KEYS.outreach, [
    {
      id: uid(), name: 'Tobiah (Founder)', brand: 'Tobiah',
      platform: 'email', email: 'tobiahwellness@gmail.com',
      status: 'in talks', date: '2026-04-02',
      link: 'https://apps.apple.com/us/app/tobiah/id6758317358',
      notes: 'Inbound Apr 1. Hormone health app — scans products/food for endocrine disruptors, microplastics, heavy metals. FDA/CDC recall alerts. 18yo self-funded founder. Apr 2: Founder confirmed interested but $500 tight. Stryder proposed call to explore equity/rev-share or creative partnership. Apr 3: Tobiah available this afternoon — Stryder said he\'s slammed, proposed Monday afternoon (Apr 6). AWAITING time confirmation. ACTION: Confirm Monday call time.',
      updated: new Date().toISOString()
    },
    {
      id: uid(), name: 'Jocelyn / Partnerships Team', brand: 'Grubbly Farms',
      platform: 'email', email: 'hello@grubblyfarms.com',
      status: 'replied', date: '2026-03-28',
      link: 'https://www.instagram.com/grubblyfarms/',
      notes: 'Stryder pitched paid partnership Mar 28. Customer Care replied directing to Ambassador Program application form. Need to fill out form or escalate directly to partnerships team for a paid deal.',
      updated: new Date().toISOString()
    },
    {
      id: uid(), name: 'Kelli', brand: 'Rooster Booster',
      platform: 'email', email: 'kelli@roosterboosterproducts.com',
      status: 'contacted', date: '2026-03-28',
      link: '',
      notes: 'Stryder pitched partnership Mar 28. No reply yet.',
      updated: new Date().toISOString()
    },
    {
      id: uid(), name: 'Sales Team', brand: 'Happy Hen Treats',
      platform: 'email', email: 'sales@happyhentreats.com',
      status: 'contacted', date: '2026-03-28',
      link: '',
      notes: 'Stryder pitched paid partnership Mar 28. No reply yet.',
      updated: new Date().toISOString()
    },
    {
      id: uid(), name: 'Sydney P', brand: 'Pecking Order',
      platform: 'email', email: 'sydneyp@redriv.com',
      status: 'replied', date: '2026-03-26',
      link: '',
      notes: 'Sydney reached out. Stryder replied expressing interest Mar 26. Awaiting next steps.',
      updated: new Date().toISOString()
    },
    {
      id: uid(), name: 'Karter B', brand: 'Quakey Feather Hatchery',
      platform: 'email', email: 'kb@quakyfeathers.com',
      status: 'in talks', date: '2026-03-01',
      link: '',
      notes: 'UT-based hatchery. Wants to send Silkies later in the year. Thread active, loosely agreed. Follow up to set a timeline.',
      updated: new Date().toISOString()
    },
  ]);

  // ── Revenue ───────────────────────────────────────────────────────────────
  save(KEYS.revenue, [
    {
      id: uid(), source: "Roosty's", category: 'brand deal',
      amount: 200,
      date: '2026-04-02',
      notes: "Whitelisting fee — 1-month access to Flock Armor Chili Mix reel (181K views). Paid by FLAT INVESTMENT LIMITED (Roosty's parent co., HK) via PayPal. Gross $200 · PayPal fee $8.98 · Net $191.02. TX ID: 5VP33900FN298791T.",
      updated: new Date().toISOString()
    },
  ]);

  // Content ideas — only initialize on a truly fresh install (no key exists at all).
  // NEVER overwrite on version bumps — user-created ideas must survive reseeds.
  if (localStorage.getItem(KEYS.ideas) === null) save(KEYS.ideas, []);

  // Saved signals — start empty on fresh install only
  if (localStorage.getItem(KEYS.igq) === null) save(KEYS.igq, []);
}

// ═══════════════════ INIT ═══════════════════

// Force-reset deals/outreach/revenue/igq when SEED_VERSION changes.
if (localStorage.getItem('gw_seed_v') !== SEED_VERSION) {
  localStorage.removeItem(KEYS.deals);
  localStorage.removeItem(KEYS.outreach);
  localStorage.removeItem(KEYS.revenue);
  localStorage.removeItem(KEYS.igq);
  localStorage.setItem('gw_seed_v', SEED_VERSION);
}

// Seed real data on first visit (or after a version reset clears the keys)
// Only check the three keys that get wiped — ideas/igq/templates are preserved and would
// cause hasData to stay true even after a version bump cleared deals/outreach/revenue.
const hasData = [KEYS.deals, KEYS.outreach, KEYS.revenue].some(k => load(k).length > 0);
if (!hasData) seedSampleData();

// ─── One-off additions (injected by ID, never duplicated) ───
// NOTE: patchItems removed — ideas added via the dashboard are permanent and
// will no longer be re-injected after deletion. Seed the full ideas list via
// seedSampleData() if you need a clean reset (bump SEED_VERSION and add ideas there).
/*
(function patchItems() {
  const ideas = load(KEYS.ideas);
  const chicken = {
    id: 'i-chicken-01',
    title: 'Before you get chickens, you need to know this',
    source: 'own idea',
    platform: 'multi-platform',
    priority: 'high',
    status: 'idea',
    tags: 'chickens, homestead, beginner, relatable, funny',
    notes: `HOOK (0–3s)
Shot: Extreme close-up of a chicken blinking directly at camera, still and judgmental.
VO: "Before you get backyard chickens... you need to know this."
Text overlay: "Before you get chickens 🐔" — hold 2 seconds, then cut hard.

─────────────────────────────────────
BEAT 1 — A couple isn't enough (3–8s)
Shot: Side-by-side cut — tiny coop with 2 chickens → same yard, chaos, 20 chickens everywhere.
VO: "You think two is enough. It's not. Nobody stops at two. Nobody."
Text overlay: "just a couple... right 😐"

─────────────────────────────────────
BEAT 2 — You will fall in love (8–14s)
Shot: Person sitting in the yard, chicken walks over and settles into their lap. Person looks at camera with a helpless shrug.
VO: "You will fall genuinely, embarrassingly in love with them. Like, cancel-your-plans-to-sit-with-the-chickens in love."
Text overlay: "they have PERSONALITIES 😭"

─────────────────────────────────────
BEAT 3 — The eggs (14–20s)
Shot: Crack a store-bought egg next to a backyard egg. Side by side in the pan — pale yellow vs. deep orange yolk. Close-up on the orange yolk.
VO: "And the eggs. The yolk is so dark orange you'll never touch a store egg again. I'm serious. It's ruined for you."
Text overlay: "store egg vs. backyard egg 🍳"

─────────────────────────────────────
BEAT 4 — You'll prefer them to people (20–25s)
Shot: Looking out the kitchen window at chickens in the yard while holding coffee. Slow smile. Maybe a quick cut to phone notifications being ignored.
VO: "You'll find yourself choosing the chickens over plans. Over Netflix. Over people. And honestly? Fair."
Text overlay: "better company than most humans 🤷"

─────────────────────────────────────
BEAT 5 — The fluffy ones (25–32s)
Shot: Quick cuts — Silkie being held (extra dramatic fluff close-up), a Cochin with feathered feet waddling, then a hand holding a blue egg and a green egg from Easter Eggers.
VO: "Then you discover Silkies — the fluffy ones — and suddenly you need the fluffy ones. And the ones with feathered feet. And the ones that lay blue eggs. And the green ones."
Text overlay: "they lay COLORED EGGS?? 💚🩵"

─────────────────────────────────────
PAYOFF (32–38s)
Shot: Wide shot of a beautiful full flock free-ranging in golden hour light. Creator walks into frame, looks at camera.
VO: "So yes. Get the chickens. Just don't say I didn't warn you."
Text overlay: "you've been warned 🐔"

─────────────────────────────────────
CTA (38–40s)
VO: "Drop your flock size in the comments — let me know how it started."
Text overlay: "how many do you have? 👇"

─────────────────────────────────────
PRODUCTION NOTES:
- Shoot on a sunny morning — golden hour if possible, chickens are most active
- Use natural sound under VO (clucking, scratching) — don't mute it
- VO tone: dry, knowing, slightly amused — like you're warning a friend
- Music: something light and acoustic, low in the mix, just texture
- Caption hook should match the VO hook exactly
- Post timing: morning on a weekday (Tue–Thu tends to perform for homestead content)
- Tag: #backyardchickens #homestead #chickensoftiktok #backyardfarm #homesteading
- Strong save/share candidate — people will send this to whoever is about to get chickens`,
    updated: new Date().toISOString(),
  };

  if (!ideas.find(d => d.id === chicken.id)) {
    save(KEYS.ideas, [...ideas, chicken]);
  }

  const slowMorning = {
    id: 'i-slow-morning-01',
    title: 'My version of a slow morning ft. jumping bridge',
    source: 'own idea',
    platform: 'instagram reel',
    priority: 'high',
    status: 'scripted',
    tags: 'lifestyle, outdoors',
    hooks: '',
    notes: '',
    updated: new Date().toISOString(),
  };

  const ideasAfterChicken = load(KEYS.ideas);
  if (!ideasAfterChicken.find(d => d.id === slowMorning.id)) {
    save(KEYS.ideas, [...ideasAfterChicken, slowMorning]);
  }
})();
*/

// ─── Restore ideas that were wiped by the seedSampleData bug (pre-fix) ───
// Each idea is injected by stable ID — safe to run on every load, never duplicates.
(function restoreIdeas() {
  const ideas = load(KEYS.ideas);

  const boat = {
    id: 'i-chicken-boat-01',
    title: 'Taking my chicken on the boat',
    source: 'own idea',
    platform: 'instagram reel',
    priority: 'high',
    status: 'idea',
    tags: 'chickens, lifestyle, florida, outdoors, funny',
    notes: '',
    updated: new Date().toISOString(),
  };

  if (!ideas.find(d => d.id === boat.id)) {
    save(KEYS.ideas, [...ideas, boat]);
  }
})();

renderOverview();
