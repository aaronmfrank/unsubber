# Unsubber design handoff: soft paper, lime on ink

Date: 2026-11-12. For: Cursor (implementation). Source of truth: the Design canvas at https://claude.ai/code/artifact/64e4a300-9eae-45d5-8cda-fa54acf1cf1e. A frozen copy is in `design-source/project/`.

## 0. How to use this bundle

| File | What it is |
|---|---|
| `2026-11-12-tokens.css` | Light and dark CSS variables plus shape and size tokens. Drop in, then map to your existing variable names. |
| `2026-11-12-tokens.json` | Same values, machine-readable. |
| `icons/icon-dark.svg`, `icon-light.svg`, `glyph-dark.svg` | Master icon art, 512 viewBox. |
| PNG icon sizes | **Not generated.** My sandbox had no SVG rasteriser. Export them from the SVGs per the table in section 8 (for example `npx sharp-cli` or `rsvg-convert`). |
| `design-source/project/*.dc.html` | The boards. Read them for exact markup, spacing and inline styles. They are design-canvas files (`<x-dc>`, `{{holes}}`), not app code. Do not ship them. |

Which boards are current:

| Board | Screen | Status |
|---|---|---|
| `DeckV2` | 05 Deck | Final |
| `DragV2` | 06 Unsubscribe drag | Final |
| `OffenderV2` | 10 Repeat offender | Final (see 4.3) |
| `ConfirmV2` | 13 Confirm sheet | Final |
| `HistoryV2` | 19 History | Final (list and expanded states) |
| `Icon` | App icon | Final |
| `Colors` | Scheme comparison | Reference only. Lime on ink (A) was chosen. |
| `Main` | Tokens and contrast | **Outdated.** Shows the earlier ink-first palette. Use `tokens.css` instead. |
| `Deck`, `Drag`, `Offender`, `Confirm` | Ink-first row | Superseded by the V2 boards. |

I could not see the repo's existing CSS variable names. Section 2 gives the old-to-new mapping by role; match it to your names.

## 1. Direction in one paragraph

Soft paper background, white cards with generous radius, a dark floating pill nav, and lime (#D8F56A) as the single brand accent on ink. Red, blue and amber are reserved for the three triage actions (Unsubscribe, Keep, Later) and never used for chrome. Light and dark both ship. The lime stays the same in both themes.

## 2. Tokens

Use `tokens.css`. Values below are for reference.

| Token | Light | Dark | Use |
|---|---|---|---|
| paper | #F3F4EE | #0E1116 | Page background |
| card | #FFFFFF | #1A1F27 | Cards, sheets |
| chip | #E6E8DD | #242A34 | Tab track, back cards, icon buttons, Undo |
| ink | #14181F | #EDF0F4 | Body text |
| muted | #565C6C | #A6AEBB | Secondary text |
| rule | #DCDFD2 | #2A313C | Dividers, card borders |
| ctl | #8A93A3 | #6B7587 | Control outlines (needs 3:1) |
| accent | #D8F56A | #D8F56A | Active tab, active nav capsule |
| onaccent | #14181F | #0E1116 | Text on accent |
| tint | #EAF8B8 | #2E3A14 | Stat chips, review button fill |
| gline | #4E7A00 | #D8F56A | Review button border |
| gtext | #2F4A00 | #D8F56A | Review button text |
| unsub | #B4302A | #F0786D | Unsubscribe text, icon, stamp, errors |
| keep | #2C55C9 | #8BA6F2 | Keep text and icon |
| later | #8A5A00 | #EBA623 | Later text and icon |
| pill | #14181F | #232933 | Nav pill |
| pillactive / onpillactive | #D8F56A / #14181F | #D8F56A / #0E1116 | Active nav capsule |
| pillmuted | #B8BEC9 | #B3BAC7 | Inactive nav items |
| track / ontrack | #F8D9D5 / #8E241E | #3A2224 / #F4A199 | Slide-to-unsub track |
| knob / onknob | #B4302A / #FFFFFF | #F0786D / #121620 | Slide knob |

Role map from the earlier palette (names are mine, match to yours):

- Old unsubscribe red #C2352B / #D75349 becomes `unsub` #B4302A / #F0786D.
- Old keep blue becomes `keep` #2C55C9 / #8BA6F2. Used for Keep only. Links, badges, tabs and focus rings are now ink or accent, not blue.
- Old later amber #C98A12 (2.9:1, failed) becomes `later` #8A5A00 / #EBA623.
- Old red filled confirm button is gone. Confirm is now the slide control (section 4.4).

Contrast (WCAG 2.x), checked by script: all text pairings 4.5:1 or better; control outlines 3:1 or better (ctl on card is 3.1 light, 3.4 dark). Lime on ink and ink on lime both pass comfortably. Re-run a check if you change any value.

Type: Archivo variable (wdth 62 to 125, wght 100 to 900), loaded from Google Fonts or self-hosted. Sizes: card title 28/34 w700, tracking -0.01em; subject 17/24 w600; body 15/22; chip and caption 13/18 w600; nav label 12 (inactive) and 14 w700 (active); review button 16 w700. Stamp: wdth 125, wght 800, 28/32, tracking 0.04em, 4px double border in `unsub`, radius 6, rotated -6deg.

## 3. Shape and layout (390 x 844 reference)

Radii: card 28, History card 24, sheet 32, all controls pill (999). Design frame is 390 x 844. Use these as pixel references and convert to your layout system; the numbers are the intent.

Deck screens (05, 06), top to bottom:

1. Tabs: top 16, height 48. Segmented pill, track `chip`, 4px padding, items 40px tall. Active item `accent` fill, `onaccent` text, w700. Inactive `muted`, w600. Count beside label at 13px. Check-mail round button 48px at right, `chip` fill.
2. Counter ("1 of 10"): top 122, centered, 13px, `muted`. Moved up from below the deck.
3. Card stack: top 150, height 384, inset 16 each side. Back cards: inset 28 (offset +10) and inset 40 (offset +20), fills `paper` then `chip`, 1px `rule` border.
4. Actions: top 574. Four round 64px buttons in 80px label columns, spaced evenly: Unsubscribe, Later, Keep, Undo. Unsubscribe, Later, Keep: 2px border in role color, `card` fill, 26px icon. Undo: 1px `ctl` border, `chip` fill, 24px icon. Labels 13px w600 in role color (Undo in ink).
5. Review button: top 682, height 56, full width minus 16 inset. 2px `gline` border, `tint` fill, `gtext` label, 16px w700, arrow icon 18px. Label: "Review N to unsub". Hide entirely when N is 0 (the other elements do not shift).
6. Nav pill: bottom 20, inset 16, height 68, 6px padding, `pill` fill. Active item: `pillactive` capsule with icon and label inline, 14px w700. Inactive: icon over label, 12px w600, `pillmuted`.

Thumb zone (design note on the canvas): the card stack sits low, directly above the action row, not pinned under the tabs. Swipes start in the lower half, so card, actions and review button all sit in one-handed reach. Free space goes to the top. Applies to 05 and 06. Do not move the deck back up.

Drag state (06): the top card follows the finger. Reference frame shows `translateX(-130px) rotate(-8deg)` with origin 50% 100% and a `0 14px 30px rgba(20,28,45,0.18)` shadow. The UNSUBSCRIBE stamp appears on the dragged card and the Unsubscribe circle takes the `track` fill. Rightward drag mirrors this for Keep. Upward drag is Later.

## 4. Per-screen notes

### 4.1 05 Deck
As section 3. Interactive tweak on the board: `queueCount` (default 8) drives the review button and its label.

### 4.2 06 Drag
As section 3 plus the stamp. Queue default 8. Stamp text: UNSUBSCRIBE.

### 4.3 10 Repeat offender
Same chrome as 05. Taller card (430px, top 104) with the REPEAT OFFENDER stamp, actions still at 574. Left action is labelled "Retry". Queue default 0, so the review button is hidden. Known gap: the 430px card does not match the 05 thumb-zone geometry exactly. Decide in implementation whether to normalise it to 384 at top 150.

### 4.4 13 Confirm sheet
Sheet radius 32. The confirm action is a **slide control**, not a button: track `track` fill, knob `knob` with `onknob` glyph, label "Slide to unsub from N" in `ontrack`. Header has a round X button, aria-label "Cancel and go back", as the go-back path. Below: breakdown chips and tinted sender rows. The old solid red confirm button (`unsubfill`) is removed.

This slide is where the irreversible action happens. The review screen (the queue list that leads here) is not designed yet, see section 6.

### 4.5 19 History
Desktop-width board (1800 x 950) showing list and expanded rows (Coupon Cabinet, Spammy Deals, Ridgeline Outfitters, Stubborn Co, Brightside Bundle), light and dark. Same nav pill as 10 with History active. Filter chips: active is lime. Pill search field. Cards radius 24. The list stops 108px above the bottom so it never runs under the nav pill: keep a bottom inset of at least nav height + bottom offset + 20.

## 5. Behavior and accessibility requirements

Slide to unsub:
- Markup `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and an accessible name matching the visible label.
- Commit at 80% travel (my proposal, adjust if testing says otherwise). Release before that animates back.
- Keyboard: Right arrow or End moves the knob, Enter or Space on the focused slider triggers a confirm dialog or a "Press again to confirm" step. A slide-only control fails keyboard and screen-reader users, so an equivalent non-drag path is required.
- Respect `prefers-reduced-motion`: no spring, no tilt on the card, instant state change.
- Haptic on commit where available.

Deck:
- Swipe left, up, right map to Unsubscribe, Later, Keep. The round buttons are the non-gesture equivalents and must stay focusable with the aria-labels shown on the board.
- Undo is the fourth button, not a separate toast action. It is disabled when nothing can be undone.
- Review button hides at queue 0.
- Touch targets 44px minimum. All round buttons are 64px; nav items must stay at least 44px tall.
- Never convey action by color alone. Each action has an icon and a text label.

Theme: follow `prefers-color-scheme`, allow `data-theme` override. Set `<meta name="theme-color">` to `paper` for each theme.

Copy: "unsub" is used on tight controls (review button, slide label) while the action is named "Unsubscribe" elsewhere. This conflicts with the existing rule that an action keeps its name through the flow. Needs a product call: either accept "unsub" as the shared short form everywhere or revert to "Unsubscribe" on those two controls (the review button will need a shorter label such as "Review 8").

## 6. Not designed yet (do not invent; ask or reuse tokens)

- Review screen (queue list with the slide control).
- Desktop layouts for Deck, Drag, Offender, Confirm.
- Manual, Settings, scan progress, sign-in.
- Toast and banner.
- History empty and filtered states (19c, 19d) and the filter sheet.
- Sudden-death state.
- The stamp art round (restyle of the stamp artwork) was not done. The stamp is unchanged apart from using the new `unsub` red.

Where something is missing, build it from the tokens in section 2 and the shape rules in section 3 and flag it for design review.

## 7. Open items

1. `onknob` dark value is #121620, while other dark surfaces use #0E1116. Probably should be #0E1116. Harmless either way, decide and align.
2. "unsub" versus "Unsubscribe" copy (section 5).
3. Offender card height (4.3).
4. The 80% slide threshold is a proposal.
5. `Main.dc.html` still shows the old palette. Treat `tokens.css` as canonical.
6. I did not render the boards to images or run them in a browser. Visual checks have been by eye in the canvas only.

## 8. Icon export

Masters are 512 x 512 SVG with a 112 corner radius baked in.

| Output | Size | Source | Notes |
|---|---|---|---|
| `icon-512.png` | 512 | icon-dark.svg | PWA manifest, purpose "any" |
| `icon-192.png` | 192 | icon-dark.svg | PWA manifest |
| `apple-touch-icon.png` | 180 | icon-dark.svg | **Export without the rounded corners** (full-bleed square); iOS rounds it. Remove the `rx` on the first rect. |
| `maskable-512.png` | 512 | icon-dark.svg | Full-bleed ground, keep art inside the central 80% safe zone. The current art fits, but check. |
| `favicon.svg` / `favicon-32.png` | 32 | glyph-dark.svg | Heavier strokes survive small sizes. |
| tab or 22px UI glyph | 22 | glyph-dark.svg | |

`icon-light.svg` (lime ground) is an alternate, not wired to anything. Use it for marketing or a user-selectable icon only if asked.

Colors in the icon: ground #14181F, mail strokes #D8F56A, stamp #F0786D (dark) or #B4302A (light version). The stamp is empty on purpose: double rule, no lettering.

## 9. Acceptance

1. Add `tokens.css`, map to existing variable names, and confirm light and dark both render.
2. Rebuild screens 05, 06, 10, 13, 19 against the V2 boards.
3. Run `npm run screenshots` (the repo's existing script) and compare against the board renders at 390 x 844 in both themes. Differences of 1 to 2px from font rendering are fine; layout offsets are not.
4. Keyboard-only pass through the deck and the slide-to-unsub confirm.
5. Run a contrast check on any color you add.
6. Open the items in section 7 with design before merging.
