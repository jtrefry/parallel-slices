# Parallel Slices system diagram prompt

Use this single prompt to generate the main technical overview image for the
Parallel Slices README. Generate a new image from scratch. Do not edit, extend,
or use an earlier generated image as a reference. Save the approved image as
`docs/assets/parallel-slices-pipeline-overview.png`.

```text
Create a spacious, architecture-neutral technical infographic for Parallel Slices, an open-source AI coding system. Use a warm off-white 3:2 landscape canvas, flat vector line art, large readable type, modest rounded cards, small consistent icons, and generous whitespace. Keep every connector and label inside a 6% safe area. Do not draw people, robots, cakes, source-code screenshots, factories, vendor logos, framework logos, or cloud logos.

VISIBLE TITLE
Plan the Product. Build It in Parallel Slices.

VISIBLE SUBTITLE
Each finished worker slice enters root verification immediately while sibling workers continue; integration remains serial.

Render only visible labels explicitly written below. Do not render instruction headings or row names.

TOP ROW

Use exactly four top-row columns. Column two contains two equal cards stacked vertically within the same horizontal x-range: PRODUCT PLAN above and ARCHITECTURE PACKAGE directly below. Their left edges, right edges, width, border weight, and heading size match. ARCHITECTURE PACKAGE must never appear to the right of PRODUCT PLAN as a fifth column. Column three is AI COMPILES FOR EXECUTION. Column four is OPTIMIZED SLICE MAP.

PRODUCT DIRECTION
Requirements · AI Product Discovery

PRODUCT PLAN
Requirements · Decisions · Acceptance Evidence · Non-Goals
HUMAN APPROVED

No implementation before Product Plan approval

ARCHITECTURE PACKAGE
Repository Shape · Contracts · Quality Floors

AI COMPILES FOR EXECUTION
Approved plan + architecture → optimized slices

OPTIMIZED SLICE MAP
Slices · Dependencies · Worker-Owned Paths · Root-Owned Evidence · Resource Locks · Gates

Inside the existing OPTIMIZED SLICE MAP card, add one very small muted blue-gray capability cue along its bottom edge: two or three overlapping outline reviewer avatars followed by the micro-caption MULTI-AGENT PLAN REVIEW AVAILABLE. Keep the cue visually secondary to the map title and contents. It subtly indicates that the phase supports multi-agent review without presenting that capability as another required diagram node; it is not another card, decision, or flow step, and it has no connector. Do not enlarge or reposition the map card to accommodate it.

Connect PRODUCT DIRECTION only to PRODUCT PLAN. PRODUCT PLAN and ARCHITECTURE PACKAGE each have a separate short right-pointing arrow into one vertical merge bar immediately to their right. That merge bar has one arrow into AI COMPILES FOR EXECUTION. The compiler points to OPTIMIZED SLICE MAP.

OPTIMIZED SLICE MAP has exactly one outgoing blue connector. It starts at the map's bottom-center, descends only to the empty horizontal gap between the top and middle rows, turns left and travels across that empty gap until directly above ROOT CONTROLLER, then turns downward and ends with one arrowhead visibly touching ROOT CONTROLLER's top-center border. It may not stop in empty space or point toward the streaming caption, worker lanes, worker connectors, or serial card.

MIDDLE ROW

Use a disciplined horizontal grid. ROOT CONTROLLER occupies approximately x=2%–15%. Three narrow equal worker columns occupy x=17%–62%. Reserve x=66%–94% for the plain streaming caption and the right-side completion flow. All three worker columns have the same top and bottom positions.

Place ROOT CONTROLLER at far left:

ROOT CONTROLLER
Orchestrates only · Selects Ready Slices
Dependencies clear · Paths compatible · Locks available
Verifies each finished candidate from Git evidence

ROOT CONTROLLER forks into three equal isolated worker columns arranged side by side through one slim blue scheduling-distributor bar. Render the following visible heading centered inside that bar:

READY SLICES — RUN CONCURRENTLY

The distributor bar is a meaningful scheduling fan-out node, not a queue, candidate holding set, completion barrier, shield, socket, or endpoint marker. Extend the bar leftward so its left end is directly above ROOT CONTROLLER's top-right corner. One short blue connector leaves ROOT CONTROLLER's top-right border, rises into the distributor bar's bottom-left edge, and ends with its arrowhead touching the bar. ROOT CONTROLLER's right edge has no outgoing connector. Exactly three short vertical blue arrows leave the distributor bar's bottom edge and end with plain arrowheads touching the top-center border of SLICE A, SLICE B, and SLICE C. Do not draw any direct arrow from ROOT CONTROLLER only to SLICE A. Keep the map-to-root arrow on a separate top-left point of ROOT CONTROLLER so it never touches this fan-out connector. All three workers visibly receive an input through the connected distributor bar.

Each column has this exact top-to-bottom sequence:

SLICE A
Scope Preflight ↓ Build + Tests ↓ Slice Gate + Self-Check ↓ Candidate Commit

SLICE B
Scope Preflight ↓ Build + Tests ↓ Slice Gate + Self-Check ↓ Candidate Commit

SLICE C
Scope Preflight ↓ Build + Tests ↓ Slice Gate + Self-Check ↓ Candidate Commit

Give each SLICE A, SLICE B, and SLICE C heading one small thin horizontal rectangular feature-slice icon. The icon is a shallow rectangular slab with straight parallel top and bottom edges, short vertical sides, and three subtle stacked layers inside the same rectangular silhouette. Use the same proportions and orientation for all three icons. Never represent a slice as a circle, pie chart, round disc, radial segment, or circle with a missing wedge.

Fresh context · Isolated worktree · One scoped feature

STREAMING OPTIMIZATION

Do not join the three worker columns. Do not draw ROOT-VERIFIED CANDIDATES, a finite holding set, a queue, or a batch barrier. Align the three Candidate Commit cards on one baseline. Place SERIAL QUALITY + INTEGRATION completely below them with its top border extending underneath all three candidates.

Do not draw connector ports, sockets, shields, shield outlines, badges, pentagons, tabs, plugs, endpoint markers, or any other objects where arrows meet ROOT CONTROLLER or SERIAL QUALITY + INTEGRATION. The last segment of every connector is a bare line followed by one ordinary triangular arrowhead touching the destination card border directly, with no enclosing shape.

Draw exactly three short, separate, straight vertical teal connectors:

- A starts at Candidate Commit A's bottom-center and descends to the left serial-card top endpoint.
- B starts at Candidate Commit B's bottom-center and descends to the center serial-card top endpoint.
- C starts at Candidate Commit C's bottom-center and descends to the right serial-card top endpoint.

The three vertical shafts are parallel and widely separated. Each connector has exactly one plain arrowhead touching only its assigned point on the top border of SERIAL QUALITY + INTEGRATION. No two worker connectors may touch, merge, cross, share a vertical shaft, share a horizontal segment, or feed a common line. The entire gap from each Candidate Commit card to the serial-card border is free of text and icons. The plain streaming caption has no border and no connector may originate from or touch the caption.

Render this plain unboxed caption in the reserved right-side column, never between the candidates and serial card:

EACH FINISHED CANDIDATE ADVANCES IMMEDIATELY
Sibling workers continue · No Ready Set wait

Each candidate can advance as soon as its tracked worker gate has passed and its candidate checkpoint and commit are ready. The root verifies and integrates one dependency-eligible candidate at a time; it never waits for A, B, and C to finish together.

BOTTOM ROW

Place one wide green card across the lower left and center, approximately x=5%–68%, completely below all three Candidate Commit cards. Its closed rounded-rectangle border has no arrowheads and never becomes a connector:

SERIAL QUALITY + INTEGRATION

Inside the green card, show one left-to-right sequence. Use one card per item with a small line icon:

ROOT VERIFY ON ARRIVAL
Passed worker gate · Candidate checkpoint · Clean single commit · Exact base, subject, and paths

APPLY CANDIDATE
Dependencies accepted · Atomic serial claim · Exact patch · No commit yet

INTEGRATED QUALITY PIPELINE
Re-run the declared gate

INDEPENDENT REVIEW
Check behavior and scope

Within this existing review item, add two tiny overlapping outline reviewer avatars and the muted micro-caption MULTI-AGENT SLICE REVIEW AVAILABLE. Treat them only as a subtle capability cue, not as a new process card or step. Do not widen the item, alter the sequence, or add a connector.

QUALITY + REVIEW PASS?

The pass/fail diamond is inside the right side of the green card. Its YES arrow points right to:

ACCEPT SLICE COMMIT
Record durable evidence

Render this caption along the bottom inside the green card:

Verify, apply, gate, review, and accept one finished candidate at a time

The pass/fail diamond's NO arrow is one continuous vertical red line pointing straight down. Center the retry card directly beneath the diamond on the same vertical centerline. The red arrowhead overlaps the retry card's top border by a few pixels, leaving no ivory gap. Render NO once beside the line.

FRESH RETRY — SAME SLICE
New worktree · Same manifest · Latest accepted base · Maximum 3 fresh retries

After 3 rejected corrections: FAILED

The retry card has exactly one incoming red connector from QUALITY + REVIEW PASS? and exactly one outgoing red connector. The outgoing connector starts at the retry card's bottom-left corner, descends first into a dedicated ivory corridor below the green serial card, then turns left without an arrowhead. It travels all the way left through that bottom corridor, turns upward at x=4% in the outer gutter, and rises completely to the left of the serial card. At the height of ROOT CONTROLLER's lower-left border, it turns right and ends with its only plain red arrowhead touching that border directly. Never draw a short left-pointing arrow from the retry card at the card's own height. Draw no port or endpoint object.

The red retry route must not touch, enter, terminate on, or run along the border of SERIAL QUALITY + INTEGRATION. It must not point to APPLY CANDIDATE or any worker connector. Render this caption beside it:

Only the failed slice retries; accepted slices stay accepted

After ACCEPT SLICE COMMIT, draw one arrow labeled:

SLICE ACCEPTED · RECOMPUTE READINESS

This arrow points only to the mandatory decision diamond immediately to the right of the green serial card:

MORE SLICES RUNNING OR REMAIN?

Its YES arrow forms the only large outer green loop. The loop descends to the bottom safety corridor, travels all the way left below the retry and serial cards, turns upward at x=2% in the far-left outer gutter, and rises to the left of the red route. At the height of ROOT CONTROLLER's upper-left border, it turns right and ends with its only plain green arrowhead touching that border directly at a point separated from the red retry arrow. Draw no port or endpoint object. It has no arrowhead in the middle of the bottom segment or at either turn. Label it:

NEXT READY SLICES

The red and green return routes never touch, merge, cross, or change colors. Their plain arrowheads touch two separate points on the left border of ROOT CONTROLLER with no shapes between the arrowheads and the card.

Place MORE SLICES RUNNING OR REMAIN? outside the serial card around x=73%–80%. Place FINAL GOAL AUDIT immediately to its right around x=82%–96% at exactly the same vertical center. The diamond's right-pointing NO arrow is one short perfectly horizontal deep-green line ending with its arrowhead touching the audit card's left-center border and points only to:

FINAL GOAL AUDIT
Once after all slices are accepted
Requirements · Preservation · Gates · Reviews · Release Evidence · State · Non-Goals

The printed NO label, connector line, and arrowhead from MORE SLICES RUNNING OR REMAIN? are deep green because no remaining slices is successful completion, not failure. This connector must never be red, orange, pink, or berry, and it must never bend downward into GOAL COMPLETE.

Place GOAL COMPLETE directly below FINAL GOAL AUDIT. FINAL GOAL AUDIT has exactly one incoming deep-green arrow from the NO output of MORE SLICES RUNNING OR REMAIN? and exactly one outgoing deep-green vertical arrow from its bottom-center into the top-center of:

GOAL COMPLETE
One goal branch · Separate slice commits · One PR when GitHub-enabled

Local: MILESTONE_FINISHED · GitHub: PULL_REQUEST_READY after CI is green

Delivery is architecture-owned and separately authorized

GOAL COMPLETE has exactly one incoming connector, from FINAL GOAL AUDIT. Draw no direct connector from MORE SLICES RUNNING OR REMAIN?, ACCEPT SLICE COMMIT, a worker lane, a worker connector, or the retry card to GOAL COMPLETE.

COLOR SAFETY

- Soft red is used only for the QUALITY + REVIEW PASS? NO failure arrow, FRESH RETRY — SAME SLICE, its return arrow, and their failure labels.
- Every successful main-flow connector is blue, teal, deep green, or charcoal.
- The MORE SLICES RUNNING OR REMAIN? NO connector, FINAL GOAL AUDIT connector, and GOAL COMPLETE connector are deep green, never red.

EXACT FLOW CHECK

- Product Direction points only to Product Plan; Product Plan and Architecture Package merge only into compilation.
- Optimized Slice Map points only to Root Controller.
- The small multi-agent review cues stay inside Optimized Slice Map and Independent Review. They are capability annotations only, with no connectors, added nodes, added columns, or layout expansion.
- Root Controller forks into three concurrent isolated side-by-side worker columns.
- The slim READY SLICES scheduling-distributor bar has one incoming arrow from Root Controller and three outgoing plain arrows, one into each of A, B, and C; it is not a floating heading underline or a completion barrier.
- Every worker-lane slice icon is a thin rectangular layered slab; no worker slice uses a circular or wedge-shaped icon.
- The worker lanes never join. Each Candidate Commit independently enters Serial Quality + Integration through a plain arrowhead touching a different top-border point as soon as it finishes. No endpoint objects are drawn.
- No worker output points to MORE SLICES RUNNING OR REMAIN?, Final Goal Audit, or Goal Complete.
- Serial processing is one dependency-eligible candidate at a time: verify, atomically claim and apply, gate, review, accept.
- QUALITY + REVIEW PASS? YES reaches Accept Slice Commit; NO reaches only Fresh Retry.
- Fresh Retry returns directly to the lower-left border of Root Controller with a plain red arrowhead and has no line to the serial card.
- Accept Slice Commit reaches only MORE SLICES RUNNING OR REMAIN?.
- MORE SLICES RUNNING OR REMAIN? YES returns directly to a separate upper-left point on Root Controller with a plain green arrowhead; NO reaches only Final Goal Audit.
- Neither return route may stop in blank space below Root Controller; both must visibly touch the controller border.
- Final Goal Audit sits between the no-more-slices decision and Goal Complete. No connector bypasses it.
```
