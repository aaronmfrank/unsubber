# Implementation notes: soft paper, lime on ink

Shipped in version 0.7.1. Compare against the fresh screenshots in `docs/design/screenshots/` (05, 05b, 05c, 06–10, 13, 19–19d, 33).

## Section 7 open items

| # | Item | Decision |
| --- | --- | --- |
| 1 | `onknob` dark | Aligned to `#0E1116`, as ConfirmV2 already used. |
| 2 | "unsub" or "Unsubscribe" | Product call: **Unsubscribe** everywhere. Labels are "Review 8 to unsubscribe" and "Slide to unsubscribe from 8"; both fit at 390px. |
| 3 | Offender card height | Kept the board's 430px. Both cards end at y 534 (150 + 384, 104 + 430), so the stack is anchored to its bottom edge and the offender card grows upward; the action row never moves. To fit its content, the offender stamp is 22px, not 25, the snippet is two lines, and the hint is one line: "Left to retry one-click, right to forgive." |
| 4 | Slide threshold | 80%, as proposed. |
| 5 | `Main.dc.html` outdated | Ignored. `tokens.css` is canonical. |

## Built from tokens, needs design review

- **Keep and Later drag labels.** "Rightward drag mirrors this" was taken to mean the stamp's shape (4px double border, wide heavy type, rotated) in `keep` and `later`, in sentence case and without the rough ink edge, so UNSUBSCRIBE stays the only loud, all-caps element. The Keep and Later circles light up with a 14–16% tint of their role color mixed into `card`.
- **Desktop.** The nav pill becomes a vertical pill rail on the left at 900px and wider; the deck column stays centered.
- **Short phones.** Under 760px tall (iPhone SE, mini), the deck tightens: card padding 20, title 22px, a one-line snippet, and smaller gaps. Card content shrinks before anything else so the badge row stays visible. See 05c.
- **Open preview.** The card grows upward to up to 560px; the newest subjects sit in a `paper` panel.
- **Not-designed screens.** Manual, Settings, scan, sign-in, toast and banners now use the tokens: pills for every control, 24px cards, ink for links and primary buttons, `gline` for progress, `gtext` for success messages.
- **Appearance setting.** Settings has System, Light and Dark, which sets `data-theme` and updates `theme-color` to `paper`.
- **Manual count.** On the nav pill, a lime badge with the count sits on the Manual icon. The board shows no count.
- **Disabled Undo.** 40% opacity.

## Contrast

All text pairings pass 4.5:1 in both themes, including the added ones (muted on chip 5.4, gtext on tint 8.9, ontrack on the slider fill 4.8).

**One failure to fix in design:** `ctl` on `paper` is **2.8:1** in light (3.1 on card was checked). Two controls sit straight on `paper`: the Undo button and the History search field. A light `ctl` around `#828B9B` would pass on both surfaces. Left as designed until you confirm.

## Accessibility

- **Slide control.** `role="slider"` with value, value text and the visible label as its name. Arrow keys move the knob in 10% steps; Home and End jump. Enter or Space asks "Press Enter again to unsubscribe from 8", and the second press confirms. The armed state times out after 5 seconds. Dragging past 80% confirms; releasing earlier springs back, or snaps back with reduced motion. It vibrates on commit where supported.
- **Tab order.** Deck tabs, Check mail, the four actions, Review, then the nav. The nav comes after the content in the DOM, matching where it's drawn.
- **Sheet focus.** Opening the sheet focuses "Cancel and go back".
- **Reduced motion.** No card tilt, and no spring on the card or the slider.
