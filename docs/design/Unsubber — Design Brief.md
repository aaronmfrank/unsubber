# Unsubber — Design Brief

For design exploration in Claude Design, Figma Make or any other tool. Attach this file plus the screenshots in `docs/design/screenshots/`. Built against version 0.7.0 (milestone 7).

## How to use this

1. Refresh the screenshots: `npm run screenshots` (about a minute). Every screen and state is captured in light and dark at iPhone size, plus three desktop views.
2. Give the tool this brief, the screenshots for the area you're exploring, and one of the prompts at the end.
3. Bring back changes in the handoff format below: a token table, type changes, and per-component notes on annotated screenshots. Everything visual in the app is driven by a handful of CSS variables, so a token table drops straight in; full mockups have to be translated by hand.
4. After the changes are in, rerun `npm run screenshots` and compare.

## The product in brief

Unsubber turns a Gmail inbox into a deck of cards, one per sender. Swipe left to unsubscribe, right to keep, up to save for later. Unsubscribes queue up and go out when you confirm. Senders who keep emailing after the 10-business-day grace period come back stamped REPEAT OFFENDER, and each further left swipe escalates: retry, email, manual link, Gmail Block filter, report spam.

- **User:** one person, triaging hundreds of senders in a sitting.
- **Where:** an iPhone home-screen web app, used one-handed, and desktop Chrome with arrow keys.
- **Feel:** fast, calm and a little satisfying, like stamping and posting a stack of letters. Not a dashboard.

## Design principles (current)

- **Postal metaphor.** Unwanted mail gets cancelled like a stamp. The app icon is a postage stamp with red cancellation waves.
- **Boldness in one place: the stamp.** The UNSUBSCRIBE drag overlay and the REPEAT OFFENDER stamp share one treatment: cancel red, extra-wide heavy caps, rotated about 6°, a double rule, a slightly rough ink edge. Everything else stays quiet.
- **Direction is clear before you let go.** A label fades in as the card moves and reaches full strength at the commit point (30% of the card's width, or height for up).
- **Words, never color alone.** Every action, badge and status has text.
- **Sentence case everywhere.** The stamp is the only all-caps text.
- **Actions keep their names.** The button says "Unsubscribe from 12", the toast says "Unsubscribed from 12".

## Current visual system

### Color tokens

Each role needs a light and a dark value. Contrast is WCAG 2.x against the card surface; text needs 4.5:1 (3:1 for 24px+ or 19px+ bold).

| Role | Light | Dark | Used for | Contrast on card (light / dark) |
| --- | --- | --- | --- | --- |
| Paper | `#F6F7F9` | `#131822` | Page background | — |
| Card | `#FFFFFF` | `#1C2330` | Cards, sheets, nav | — |
| Ink | `#1C2433` | `#E8EBF0` | Body text | 15.6 / 13.2 |
| Ink muted | `#5A6475` | `#A1A9B7` | Secondary text | 6.0 / 6.7 |
| Post blue | `#2C55C9` | `#4F73D8` | Keep, links, method badges, focus ring, active tab | 6.5 / **3.6** |
| Cancel red | `#C2352B` | `#D75349` | Unsubscribe, stamp, queue button, errors | 5.5 / **3.9** |
| Ochre | `#C98A12` | `#EBA623` | Later | **2.9** / 7.5 |
| Rule | `#D7DBE2` | `#2E3644` | Borders, dividers | — |

White text on filled buttons: Post blue 6.5 / **4.4**, Cancel red 5.5 / **4.0**. Bold values fail AA for normal-size text.

### Type

- **Family:** Archivo, variable, self-hosted with width (62–125) and weight axes. Body text uses normal width; the stamp uses width 125, weight 800.
- **Scale:** Caption 13/18, Body 15/22, Lead 17/24, Title 22/28, Display 28/34.
- **Weights in use:** 400, 600 (labels, buttons), 700 (titles), 800 (stamp).

### Shape, elevation, motion

- Card radius 12px, 1px Rule border, no shadow at rest; a soft shadow only while dragging. The next card peeks 8px below.
- Buttons 44px tall, 12px radius. Badges are pills.
- Swipes follow the finger with a slight rotation and throw off-screen in 0.3s. With reduced motion they fade in 150ms.
- No icon set. Text glyphs only: ← ↑ → on action buttons, ↻ for Check mail, ✕ to dismiss.

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
| Sender card | Name (Title), address (muted), "47 emails, last on Nov 9", newest subject (Lead semibold) and snippet (3 lines), method badge, "Tap for preview". | 05 |
| Drag overlays | Left: the UNSUBSCRIBE stamp. Right: "Keep" in a blue outlined box. Up: "Later" in an ochre outlined box. Opacity follows drag distance. | 06, 07, 08 |
| Preview | Expands in place: full snippet, three newest subjects with dates, "Open in Gmail". | 09 |
| Repeat offender card | Red detail line ("Tried one-click on Oct 2. 6 emails since."), a hint naming the next step, and the REPEAT OFFENDER stamp in the empty lower part of the card. The left button shows the step ("Retry", "Email", "Block"). | 10 |
| Action buttons | Three equal outlined buttons under the card: ← Unsubscribe (red text), ↑ Later (ochre), Keep → (blue). Position counter "1 of 318" below. | 05 |
| Deck tabs | Main, Later, Re-review, each with a count, plus ↻ Check mail on the right. | 05 |
| Queue bar | A full-width filled red "Unsubscribe from 12" (disabled "Queue is empty" when there are none) and an outlined Undo. | 05 |
| Confirm sheet | A bottom sheet on phone, a centered dialog on desktop. Title, breakdown ("5 one-click, 1 email, 2 need you"), an explainer, a scrolling list with each sender's method and a Remove link, a progress bar while running, then Cancel and the red confirm button. | 13, 14, 31 |
| Toast | Floats above the tab bar. Summary text with an inline link ("2 need you."). The error variant has a red border and doesn't auto-dismiss. | 15, 16 |
| Manual row | Name, address, count, reason badge (Link / No link found), Open link buttons (one per link, with hostname), Mark done, then Block and Report spam. | 17 |
| Settings sections | Bordered cards with a heading, a short explainer and actions: Mail (scanned range, Scan older mail with progress), Decks (Reset Later), Move to another device (Export, Import), About this build, Sign-in checks (collapsed), This device (Clear data and rescan, Sign out). | 18, 18b, 32 |
| History row | Name, address, status badge (Unsubscribed muted, Repeat offender red, Blocked ink), a one-line standing ("Grace period until Nov 25", "6 emails after the grace period, last on Nov 10", "Blocked on Nov 5. Tracking stopped."). Tap to expand an attempt timeline: date, method, result, and the failure reason or link host. | 19, 19b |
| Filter chips | Pills with counts (All 6, Unsubscribed 3, Repeat offenders 1, Blocked 2). Selected is filled ink. | 19, 19c |
| Search field | 44px, rounded, card surface. | 19 |
| Banners | Sign-in expired (red border, Sign in again) and Update ready (Reload). | 20, 21 |
| Nav | Bottom tab bar, text only: Deck, Manual (count), History, Settings. Active tab in blue. On desktop a left rail with the wordmark. | all |
| Buttons | Primary (filled blue), Danger (filled red), Secondary (outlined), Quiet (text link). | all |

## Screens and states

Screenshots are named `NN-name-light.png` / `NN-name-dark.png`.

| # | Screen / state | Purpose | Notes |
| --- | --- | --- | --- |
| 01 | Sign in | First run | Icon, wordmark, one-line pitch, Sign in with Google, privacy line. |
| 02 | Sign in, returning | Every app open | "Continue as aaron@…", "Use a different account". The token lives in memory, so this shows on every open. |
| 03 | Scan progress | First 90-day scan, 1–5 minutes | Phase title, detail line, progress bar. |
| 04 | Scan paused | Gmail rate limit | Auto-resumes with a countdown; Resume now. |
| 05 | Deck: Main | Core loop | See components. |
| 06–08 | Deck: dragging left / right / up | Direction feedback | The stamp versus the quieter Keep and Later boxes. |
| 09 | Deck: preview | Peek before deciding | Expanded card. |
| 10 | Deck: repeat offender | Escalation | Stamp, red detail line, next-step hint and button label. |
| 11 | Deck: Re-review | Revisit keeps | Adds "N emails since you kept it". |
| 12 | Deck: empty | Main cleared | Dashed placeholder with a next-step line. |
| 13–14 | Confirm sheet, idle and running | The only place real actions happen | Must feel deliberate, not scary. |
| 15–16 | Toast: summary and error | Result of a commit or sync | |
| 17 | Manual queue | Senders needing a click | |
| 18 | Settings | Mail, Decks, Move to another device, About, Sign-in checks, This device | Partly developer-facing for now. |
| 18b | Settings: scanning older mail | Progress inline in the Mail section | |
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

### Screens still to design

- **Filter sheet (milestone 8).** The down swipe opens a sheet to filter a sender instead of unsubscribing: Skip the inbox, Mark as read, Apply label. It remembers the last choice. The drag-down overlay needs a fourth label and color ("Filter").
- **Sudden death (deferred).** A toggle that fires each unsubscribe three seconds after the swipe, with an undo toast and a page tint so the mode is unmistakable.

## Known issues and open questions

Starting points, not decisions.

1. **Contrast failures.** Light ochre text (2.9:1) fails, so "Later" labels and the Later overlay are hard to read. Dark blue and red text on cards (3.6 and 3.9) fail for small text such as method badges, the repeat offender line and links. White on the dark-mode filled buttons fails (4.4 and 4.0).
2. **Blue means two things.** Post blue is Keep, but it's also links, the active tab, the focus ring and the One-click and Email badges. A blue badge on a card you're about to unsubscribe from reads as "keep".
3. **The red queue button is always on screen.** It competes with the stamp ("boldness in one place"), and disabled it reads as an active pink button (05, 12).
4. **Card density.** The card has a lot of empty space below the snippet. Is the sender or the subject the hero? Should the count be bigger? Could the card show a sparkline or the three subjects without tapping?
5. **Overlay asymmetry.** The UNSUBSCRIBE stamp is rich, while Keep and Later are plain outlined boxes that look like form fields. Intentional hierarchy, or should they share a family?
6. **Two rows of tabs on phone.** Deck tabs at the top and the app tab bar at the bottom. The bottom bar is text only, with no icons or active indicator beyond color.
7. **Glyphs as icons.** ← ↑ → ↻ ✕ are font characters. A small, consistent icon set might read better.
8. **Desktop is a stretched phone.** Lots of unused space; this could hold a queue sidebar, a keyboard legend or the preview beside the card.
9. **Identity.** Beyond the app icon and the stamp there's no brand moment: no wordmark on the deck, and the empty states are plain.
10. **Confirm sheet copy is a wall of text.** The explainer paragraph could be structured, such as one line per method.
11. **Repeat offender card is busy.** Stamp, red line and hint all compete. Which one carries it?

## What to explore

Pick one per round.

- **A. Palette refresh.** Keep the four semantic roles, fix every contrast failure, and separate Keep from link and badge blue. Deliver both light and dark.
- **B. Card redesign.** Hierarchy, density, method badge, repeat offender treatment and the empty card.
- **C. Stamp art direction.** Variations on the rubber stamp: ink texture, double rule, postmark circle, cancellation waves. It must work at 22px caps on a 360px card and as the app icon.
- **D. Navigation.** Combine or rethink the deck tabs and the app tab bar; icons; where Check mail lives.
- **E. Desktop layout.** Use the width without losing the one-card focus.
- **F. History.** Redesign the first pass (19–19d, 33) using the open questions above.
- **G. New screens.** The filter sheet, then sudden death if it comes back.

## Handoff format

Bring changes back in this shape so they map straight onto the code.

**1. Token table**: every role, both modes, with contrast checked. Add a role only if it's genuinely new (such as `--filter` for the down swipe).

```text
Role          Light     Dark      Notes
paper         #……       #……
card          #……       #……
ink           #……       #……
ink-muted     #……       #……
keep          #……       #……       (today: post blue)
unsubscribe   #……       #……       (today: cancel red; also the stamp)
later         #……       #……       (today: ochre)
link/accent   #……       #……       (new if separated from keep)
rule          #……       #……
```

**2. Type**: font family (variable, open license), scale steps and weights, and the stamp's width and weight.

**3. Component deltas**: per component, what changes (size, weight, color role, spacing, border, radius, shadow), ideally as an annotated screenshot with the screenshot number.

**4. Out of scope for a round**: new features, new screens other than those listed, sender logos, photography, and gradients or heavy shadows as a general style.

## Prompts

### Claude Design

> I'm designing a phone-first web app called Unsubber. The attached brief describes the product, the current visual system (tokens, type, components), the hard constraints, and every screen, and the screenshots show the current build in light and dark. This round, explore **[A. Palette refresh]**. Give me three distinct directions that keep the postal "cancellation stamp" idea and the rule that the stamp is the only loud element. For each direction: a full token table in light and dark with WCAG contrast for every text pairing, plus redesigns of screenshots 05 (deck), 06 (unsubscribe drag), 10 (repeat offender) and 13 (confirm sheet). Fix the known contrast issues, and stop the One-click and Email badges sharing Keep's color. Stay within the constraints section. Finish with a token table in the brief's handoff format for your recommended direction.

### Figma Make

> Build a clickable prototype of Unsubber's deck screen at 390×844 from the attached brief and screenshots 05–12. One card stack centered, max 400px wide; three action buttons under it; a position counter; a queue bar with "Unsubscribe from 12" and Undo; a bottom tab bar (Deck, Manual, History, Settings). Use these tokens as variables: [paste token table]. Font: Archivo, variable (width 62–125). Make the card draggable left, right and up, with the overlay label fading in by distance: UNSUBSCRIBE uses the stamp treatment (red, width 125, weight 800, rotated −6°, double rule, rough edge); Keep and Later are quieter. Add a light and dark mode toggle. Then explore **[B. Card redesign]**: two alternatives for the card's hierarchy and density, using the same data.

### History (Claude Design or Figma Make)

> Redesign the History screen of Unsubber, a phone-first app that unsubscribes you from email senders and tracks whether they stop. The attached brief covers the visual system and constraints; screenshots 19, 19b, 19c, 19d and 33 show the current first pass in light and dark. History's job is to answer "did it work?": which unsubscribes stuck, who came back after the 10-business-day grace period, and how far each escalation went (one-click, email, manual link, Block filter, report spam). Keep the same data per sender: status, a standing line, and the attempt timeline. Keep filters by status and search. Explore: (1) a summary at the top that tells the success story, (2) a clearer success state for senders who went quiet, (3) a more compact way to show the escalation path than a timeline, and (4) a desktop list-detail layout at 1280×800. Use the existing tokens, unless you're also doing the palette round. The stamp stays reserved for repeat offenders on the deck, so don't use it here. Deliver phone light and dark plus one desktop view, then component notes in the brief's handoff format.

## Regenerating screenshots

`npm run screenshots` renders `dev/screens.html` with fictional sample data. No Gmail is involved, and it uses its own port, so your real data is untouched. Pass a filter to redo a subset, for example `npm run screenshots -- deck`. Each scenario is a `?screen=` value in `dev/screens.tsx`; add one there when a new screen or state appears.
