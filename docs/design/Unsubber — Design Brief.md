# Unsubber — Design Brief

For design exploration in Claude Design, Figma Make or any other tool. Attach this file plus the screenshots in `docs/design/screenshots/`. Built against version 0.8.0: every milestone (sudden death was dropped), on the 2026-11-12 design handoff, "soft paper, lime on ink". The handoff and its implementation notes are in `screenshots/2026-11-12-unsubber-design-handoff/`.

## How to use this

1. Refresh the screenshots: `npm run screenshots` (about a minute). Every screen and state is captured in light and dark at iPhone size, plus a short-phone deck and four desktop views.
2. Give the tool this brief, the screenshots for the area you're exploring, and one of the prompts at the end.
3. Bring back changes in the handoff format below: a token table, type changes, and per-component notes on annotated screenshots. Everything visual in the app is driven by a handful of CSS variables, so a token table drops straight in; full mockups have to be translated by hand.
4. After the changes are in, rerun `npm run screenshots` and compare.

## The product in brief

Unsubber turns a Gmail inbox into a deck of cards, one per sender. Swipe left to unsubscribe, right to keep, up to save for later. Unsubscribes queue up and go out when you confirm. Senders who keep emailing after the 10-business-day grace period come back stamped REPEAT OFFENDER, and each further left swipe escalates: retry, email, manual link, Gmail Block filter, report spam.

- **User:** one person, triaging hundreds of senders in a sitting.
- **Where:** an iPhone home-screen web app, used one-handed, and desktop Chrome with arrow keys.
- **Feel:** fast, calm and a little satisfying, like stamping and posting a stack of letters. Not a dashboard.

## Design principles (current)

- **Postal metaphor.** Unwanted mail gets cancelled like a stamp. The app icon is a stack of lime envelopes on ink with an empty red stamp across them.
- **Lime is the one brand accent.** It marks the active tab, active nav item and selected chips, always on ink or with ink text. Red, blue and amber belong only to the three triage actions (Unsubscribe, Keep, Later) and are never chrome.
- **Boldness in one place: the stamp.** UNSUBSCRIBE (drag) and REPEAT OFFENDER share one treatment: unsub red, width 125 weight 800 caps, 4px double rule, rotated −6°, a slightly rough ink edge.
- **Thumb zone.** The card, the four round actions and the review button sit in the lower half, in one-handed reach. Free space goes to the top.
- **Direction is clear before you let go.** The stamp or label fades in as the card moves, reaching full strength at the commit point (30% of width, or height for up), and the matching round button lights up.
- **Words, never color alone.** Every action, badge and status has text, and every action has an icon too.
- **Sentence case everywhere.** The stamp is the only all-caps text.
- **Actions keep their names.** "Review 8 to unsubscribe", "Slide to unsubscribe from 8", then "Unsubscribed from 8".

## Current visual system

### Color tokens

The values live in `src/index.css`; the source of truth is the handoff's `2026-11-12-tokens.css`. Every role has a light and a dark value; lime is the same in both. Contrast is WCAG 2.x: text needs 4.5:1, control outlines 3:1.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| paper | `#F3F4EE` | `#0E1116` | Page background, sheet rows, preview panel |
| card | `#FFFFFF` | `#1A1F27` | Cards, sheets |
| chip | `#E6E8DD` | `#242A34` | Tab track, back card, icon buttons, Undo, breakdown chips |
| ink | `#14181F` | `#EDF0F4` | Body text, links, focus ring, Blocked badge |
| muted | `#565C6C` | `#A6AEBB` | Secondary text |
| rule | `#DCDFD2` | `#2A313C` | Dividers, card borders |
| ctl | `#8A93A3` | `#6B7587` | Control outlines (method badge, secondary buttons, search) |
| accent / onaccent | `#D8F56A` / `#14181F` | `#D8F56A` / `#0E1116` | Active tab, active nav capsule, selected chips |
| tint | `#EAF8B8` | `#2E3A14` | Count chip on the card, review button fill |
| gline / gtext | `#4E7A00` / `#2F4A00` | `#D8F56A` / `#D8F56A` | Review button border and text; progress bars and success text |
| unsub | `#B4302A` | `#F0786D` | Unsubscribe icon and label, stamp, errors |
| keep | `#2C55C9` | `#8BA6F2` | Keep only |
| later | `#8A5A00` | `#EBA623` | Later only |
| inkfill / oninkfill | `#1B1F2A` / `#FFFFFF` | `#E8EBF0` / `#0E1116` | Primary buttons |
| pill, pillactive, pillmuted | `#14181F`, `#D8F56A`, `#B8BEC9` | `#232933`, `#D8F56A`, `#B3BAC7` | Floating nav pill |
| track / ontrack | `#F8D9D5` / `#8E241E` | `#3A2224` / `#F4A199` | Slide-to-unsubscribe track and label; lit Unsubscribe circle |
| knob / onknob | `#B4302A` / `#FFFFFF` | `#F0786D` / `#0E1116` | Slide knob |

All text pairings pass in both themes. One known failure: `ctl` on `paper` is 2.8:1 in light; see known issues.

### Type

- **Family:** Archivo, variable, self-hosted with width (62–125) and weight axes.
- **Sizes:** card title and page titles 28/34 w700, tracking −0.01em; subject 17/24 w600; body 15/22; chips and captions 13/18 w600; nav labels 12 (inactive) and 14 w700 (active); review button 16 w700.
- **Stamp:** width 125, weight 800, 28/32 (22 on the offender card), tracking 0.04em.

### Shape, elevation, motion

- **Radii:** card 28, History and list cards 24, sheet 32, sheet rows 18; every control is a pill.
- **Deck geometry (390×844):** tabs at top 16; counter about 28px above the card; card 384 tall (offender 430, open preview up to 560), anchored above the actions so it grows upward; two back layers at +10 and +20; four 64px round actions at 574; review button 56px at 682; nav pill 68px at bottom 20.
- **Elevation:** no shadow at rest. While dragging, `0 14px 30px rgba(20,28,45,0.18)`; floating toasts and banners get a softer shadow.
- **Motion:** the card tilts around its bottom edge, about 8° at 130px, and throws off-screen in 0.3s. With reduced motion there is no tilt and no springs, and exits are 150ms fades.
- **Icons:** a small stroke set from the boards: arrows, undo, refresh, close, search and four nav icons.

## Hard constraints

Designs can change anything except these.

- **Phone first.** One column, card stack at most 400px wide. iPhone safe areas top and bottom. At 900px and wider the bottom tab bar becomes a left rail and the column stays centered.
- **Touch and keyboard parity.** Every action works by swipe, button and key (arrows, Space for preview, Z for undo). Touch targets at least 44px.
- **Four semantic roles** must stay distinct in light and dark: unsubscribe (destructive), keep (affirmative), later (defer), neutral. Each needs a text-safe and a fill-safe value at AA.
- **The stamp stays the single loud element** and the only all-caps text. Its look can change; its uniqueness shouldn't.
- **No email content beyond text.** No HTML, images or logos from emails; remote images are tracking pixels. Sender logos would need a separate privacy-safe source, so treat them as out of scope.
- **Web tech.** CSS variables plus Tailwind. Colors must be expressible as tokens, fonts must be open-licensed, variable and self-hostable, and there are no native iOS components.
- **Reduced motion** must have a calm equivalent for every animation.

## Components

| Component | Notes | Seen in |
| --- | --- | --- |
| Sender card | Name (28 bold), address (muted), count chip on tint, subject, three-line snippet, method badge (ctl outline), "Tap for preview". | 05 |
| Drag feedback | Left: the UNSUBSCRIBE stamp hangs off the card's right edge and the Unsubscribe circle fills with `track`. Right and up show "Keep" and "Later" in the stamp's shape and their own color (sentence case, clean edge), and their circles take a light tint. | 06, 07, 08 |
| Preview | The card grows upward. Snippet, then the three newest subjects in a `paper` panel, then "Open in Gmail". | 09 |
| Repeat offender card | 430px. Red detail line, a one-line hint ("Left to retry one-click, right to forgive."), and the REPEAT OFFENDER stamp above the badge row. The left action reads "Retry", "Email", "Block" and so on. | 10 |
| Round actions | Unsubscribe, Later, Keep: 64px, 2px role-color ring on card, 26px icon, role-color label. Undo: chip fill, ctl ring, ink label; disabled when there's nothing to undo. | 05 |
| Deck tabs | A segmented pill on a chip track; active is lime. A round 48px Check mail button on the right. | 05 |
| Review button | "Review 8 to unsubscribe →": tint fill, 2px gline border, gtext label. Hidden when the queue is empty; its space stays so nothing shifts. | 05b |
| Confirm sheet | 32px radius. Title with a round close button ("Cancel and go back"), breakdown chips, one explainer line per method present plus "This can't be undone.", sender rows on paper with the method and a Remove link, then the slide control. | 13, 14, 31 |
| Slide to unsubscribe | Track, knob and label. Confirms past 80% travel. Keyboard: arrows move it, then Enter twice ("Press Enter again to unsubscribe from 8"). While running it becomes a progress track. | 13, 14 |
| Toast | Floats above the nav pill: 24px radius, soft shadow. Inline link "2 need you." An error has a red border and stays until dismissed. | 15, 16 |
| Manual row | 24px card, name 17 bold, reason badge, pill Open link buttons with hostname, Mark done, then Block and Report spam in unsub red. | 17 |
| Settings sections | 24px cards: Mail, Decks, Appearance (System, Light or Dark), Move to another device, About this build, Sign-in checks (collapsed), This device. | 18, 18b, 32 |
| History row | 24px card; name 17 bold; badge (Repeat offender red, Blocked ink, Unsubscribed ctl); address; standing line. Expanding shows the timeline on paper, with Failed in red. | 19, 19b |
| Filter chips | 40px pills with counts; active is lime. | 19, 19c |
| Search field | A 52px pill with a search icon and ctl border. | 19 |
| Banners | Sign-in expired (red border) and Update ready (Reload). | 20, 21 |
| Nav pill | Floating dark pill. The active item is a lime capsule with icon and label inline; inactive items show the icon over the label. Manual shows a lime count badge. On desktop it's a vertical pill rail. | all |
| Buttons | Primary (inkfill), Secondary (card with ctl outline), Chip (chip fill), Quiet (underlined ink). All pills. | all |

## Screens and states

Screenshots are named `NN-name-light.png` / `NN-name-dark.png`.

| # | Screen / state | Purpose | Notes |
| --- | --- | --- | --- |
| 01 | Sign in | First run | Icon, wordmark, one-line pitch, Sign in with Google, privacy line. |
| 02 | Sign in, returning | Every app open | "Continue as aaron@…", "Use a different account". The token lives in memory, so this shows on every open. |
| 03 | Scan progress | First 90-day scan, 1–5 minutes | Phase title, detail line, progress bar. |
| 04 | Scan paused | Gmail rate limit | Auto-resumes with a countdown; Resume now. |
| 05 | Deck: Main | Core loop | See components. |
| 05b | Deck with a queue | Review button showing | |
| 05c | Deck on a short phone | 375×667 compact layout | Not on the boards. |
| 05d | Deck while older mail loads | Background loading after the quick 30-day first scan | Status chip above the counter. Not on the boards. |
| 06–08 | Deck: dragging left / right / up | Direction feedback | Stamp and lit circle; Keep and Later labels. |
| 09 | Deck: preview | Peek before deciding | Expanded card. |
| 09b | Deck: dragging down | Filter swipe | Ink "Filter" label. |
| 09c | Filter sheet | Skip the inbox, Mark as read, Apply a label | Built from tokens. |
| 10 | Deck: repeat offender | Escalation | Stamp, red detail line, next-step hint and button label. |
| 11 | Deck: Re-review | Revisit keeps | Adds "N emails since you kept it". |
| 12 | Deck: empty | Main cleared | Dashed placeholder with a next-step line. |
| 13–14 | Confirm sheet, idle and running | The only place real actions happen | Must feel deliberate, not scary. |
| 14b | Confirm sheet with a filter | Mixed queue | "Unsubscribe from 3, filter 1". |
| 15–16 | Toast: summary and error | Result of a commit or sync | |
| 17 | Manual queue | Senders needing a click | |
| 18 | Settings | Mail, Decks, Move to another device, About, Sign-in checks, This device | Partly developer-facing for now. |
| 18b | Settings: scanning older mail | Progress inline in the Mail section | |
| 18c | Settings while the last 90 days load | Scan older mail waits | |
| 19 | History | Every unsubscribed, repeat-offender and blocked sender, newest activity first | Filter chips, search, rows. |
| 19b | History: row expanded | Attempt timeline for one sender | Shows a failed attempt in red. |
| 19c | History: filtered | Repeat offenders only | |
| 19d | History: empty | Before any unsubscribe | |
| 20 | Sign-in expired | Token expired mid-session | |
| 21 | Update banner | New version waiting | |
| 30–33 | Desktop: deck, confirm sheet, settings, history | 1280×800 | Left rail. |

### History (built in milestone 7, first pass)

History answers "did it work?". It's where you check that unsubscribes stuck, see who came back, and see how far each escalation went.

- **Content per sender:** name, address, status, and a standing line that changes with status:
  - Unsubscribed, in grace: "Unsubscribed on Nov 8. Grace period until Nov 22."
  - Unsubscribed, past grace: "Unsubscribed on Oct 17. Quiet since the grace period ended Oct 29."
  - Repeat offender: "6 emails after the grace period, last on Nov 10."
  - Blocked: "Blocked on Nov 5. Tracking stopped." or "Reported as spam on Nov 9."
- **Attempt timeline:** one line per attempt, oldest first: date, method (One-click, Unsubscribe email, Link you opened, Block filter, Reported spam), result (Sent, Sent unconfirmed, Failed, Done by you), plus the failure reason or link host.
- **Controls:** filter chips with counts, and search by name or address.
- **Sort:** most recent activity first.
- **Open questions for design:**
  - Should "quiet since the grace period" read as a success, for example a small check or a "Worked" label?
  - Should the repeat offender row link back to its stamped card in Main?
  - Is a timeline the right shape for attempts, or is a compact "1C → Email → Block" chain better?
  - Would a summary at the top tell the story better? For example "42 unsubscribed, 39 quiet, 3 came back", or a success rate.
  - Desktop could use a list-detail layout, with the list on the left and the timeline on the right.

### Filter swipe (built in milestone 8 from tokens, not designed)

A down swipe keeps the sender but files their mail out of the way with a Gmail filter.

- **Ways in:** a down drag (an ink "Filter" label fades in), the Down arrow, or a **Filter** chip (↓ Filter) at the right of the card's bottom row.
- **Filter sheet:** a bottom sheet with title "Filter {name}", the address, a short explainer, three toggle rows on paper (Skip the inbox, Mark as read, Apply a label, with a lime check circle when on), a label field, and a primary **Queue filter** button.
- **Queue and commit:** filters join the review queue. The review button reads "Review N queued", the confirm sheet title follows the mix ("Unsubscribe from 3, filter 1"), rows read "Filter: skip inbox, read, label", and the toast says "Filtered N."
- **History:** a Filtered chip and badge, the row "Filtered on Nov 12: skips the inbox, marked as read, labeled …", and **Remove filter** in the expanded row.
- **Open questions for design:** does Filter deserve a role color, or is ink right? Is a chip on the card the right non-gesture route, or should the action row change? Could the sheet offer presets (Receipts, Social, Newsletters)?

## Known issues and open questions

Starting points, not decisions. The 2026-11-12 handoff resolved the old palette, contrast, blue-overload, queue-button and icon issues.

1. **`ctl` on `paper` is 2.8:1 in light.** The Undo button and History search sit straight on paper. A light `ctl` around `#828B9B` passes on both surfaces.
2. **Built from tokens, never designed:** the filter swipe (chip, overlay, sheet, Filtered History row), the Keep and Later drag labels, the desktop rail and layouts, the short-phone deck, the open preview, Manual, Settings, scan, sign-in, toasts and banners. These need a design review pass.
3. **The stamp art round wasn't done.** The stamp only changed color and gained a true double rule.
4. **The review screen** is the confirm sheet. The handoff says the review screen isn't designed yet, but the queue list with the slide control on ConfirmV2 covers it.
5. **Desktop is still a stretched phone.** There's room for a queue sidebar, a keyboard legend or the preview beside the card.
6. **History open questions** from the first pass (above) still apply. HistoryV2 restyled the screen but kept its structure.
7. **Empty states are plain.** The empty deck is a dashed outline with a line of text.

## What to explore

Pick one per round.

- **A. Design review of the token-built screens** (Manual, Settings, scan, sign-in, toasts, desktop), and the `ctl` fix.
- **B. Stamp art direction.** Ink texture, double rule, postmark circle. It must work at 22–28px caps on a 358px card and as the app icon's empty stamp.
- **C. Desktop layout.** Use the width without losing the one-card focus.
- **D. History, round two.** A success summary, a "worked" state for quiet senders, and a compact escalation chain.
- **E. Filter swipe.** Design the filter sheet, its chip and overlay, and the Filtered History row (09b, 09c, 14b, 19).

## Handoff format

Bring changes back in this shape so they map straight onto the code.

**1. Token table**: only the tokens you change, both modes, with contrast checked. Use the names in the token table above, such as `ctl`, `tint` or `unsub`. Add a token only if it's genuinely new, such as `filter` for the down swipe.

```text
Token         Light     Dark      Notes
ctl           #……       #……       (why it changed)
```

**2. Type**: font family (variable, open license), scale steps and weights, and the stamp's width and weight.

**3. Component deltas**: per component, what changes (size, weight, color role, spacing, border, radius, shadow), ideally as an annotated screenshot with the screenshot number.

**4. Out of scope for a round**: new features, new screens other than those listed, sender logos, photography, and gradients or heavy shadows as a general style.

## Prompts

### Claude Design: design review of the token-built screens

> I'm designing Unsubber, a phone-first web app. The attached brief describes the product, the current visual system ("soft paper, lime on ink"), the hard constraints and every screen. The screenshots show the current build in light and dark. Several screens were built from the tokens without being designed: Manual (17), Settings (18, 18b, 32), scan progress (03, 04), sign-in (01, 02), toasts (15, 16), banners (20, 21), the short-phone deck (05c), the open preview (09), the Keep and Later drag labels (07, 08) and desktop (30–33). Review them against the designed screens (05, 06, 10, 13, 19) and propose fixes that bring them in line, without new tokens unless needed. Also fix known issue 1, `ctl` on `paper` at 2.8:1. Deliver redesigned phone screens in light and dark, then component notes and any token changes in the brief's handoff format.

### Figma Make: deck prototype

> Build a clickable prototype of Unsubber's deck at 390×844 from the attached brief and screenshots 05–10. Follow the deck geometry in "Shape, elevation, motion" and the tokens in the brief. Font: Archivo, variable (width 62–125). The card drags left, right and up; the UNSUBSCRIBE stamp fades in by distance and the matching round button lights up. Include the four round actions, the review button and the floating nav pill, plus a light and dark toggle. Then explore **[pick a direction]**, using the same data.

### History (Claude Design or Figma Make)

> Redesign the History screen of Unsubber, a phone-first app that unsubscribes you from email senders and tracks whether they stop. The attached brief covers the visual system and constraints; screenshots 19, 19b, 19c, 19d and 33 show the current HistoryV2 build in light and dark. History's job is to answer "did it work?": which unsubscribes stuck, who came back after the 10-business-day grace period, and how far each escalation went (one-click, email, manual link, Block filter, report spam). Keep the same data per sender: status, a standing line, and the attempt timeline. Keep filters by status and search. Explore: (1) a summary at the top that tells the success story, (2) a clearer success state for senders who went quiet, (3) a more compact way to show the escalation path than a timeline, and (4) a desktop list-detail layout at 1280×800. Use the existing tokens. The stamp stays reserved for repeat offenders on the deck, so don't use it here. Deliver phone light and dark plus one desktop view, then component notes in the brief's handoff format.

## Regenerating screenshots

`npm run screenshots` renders `dev/screens.html` with fictional sample data. No Gmail is involved, and it uses its own port, so your real data is untouched. Pass a filter to redo a subset, for example `npm run screenshots -- deck`. Each scenario is a `?screen=` value in `dev/screens.tsx`; add one there when a new screen or state appears.
