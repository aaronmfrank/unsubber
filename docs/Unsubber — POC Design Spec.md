# Unsubber — POC Design Spec

Nov 11, 2026 · @Aaron Frank

## Overview

Unsubber is a swipe-to-triage web app that groups every sender in a Gmail account into cards. You unsubscribe, keep or save each sender for later with one swipe or arrow key. It also watches for senders who keep emailing after you unsubscribed and escalates against them.

The POC is a PWA hosted on GitHub Pages, used by Aaron on his own Gmail account, with no backend. All state lives on the device in IndexedDB.

Gmail's native Manage subscriptions view already covers basic unsubscribing. Unsubber's edge is fast swipe triage across every sender, not only mailing lists, plus tracking and escalating against senders who come back.

The POC is done when:

- The first 90-day deck can be cleared in one sitting, by keyboard on desktop and by touch on iPhone.
- One-click and email-based unsubscribes fire from inside the app, with no browser tab opened.
- A sender who emails after the grace period shows up stamped as a repeat offender on the next open.

## Scope

The POC is one Gmail account, one user, one device at a time, and no server.

In the POC:

- Google sign-in in the browser, with Aaron's Gmail added as a test user on the OAuth consent screen.
- A 90-day scan, plus on-demand scans of older 90-day windows.
- Three-way swipe by touch and by arrow keys.
- Queued unsubscribes with a commit step. A sudden death mode that fires each one after a 3-second undo is deferred and may be dropped.
- A manual queue for senders that can't be unsubscribed automatically, with block and report-spam actions.
- Repeat offender detection and escalation.
- PWA install to the iPhone home screen.
- JSON export and import of app state, to move between desktop and phone by hand.

Out of the POC:

- Any backend, serverless function or hosted database.
- Sync across devices. IndexedDB is per browser, so desktop and phone hold separate state until export and import.
- Multiple accounts and non-Gmail providers.
- Gmail push notifications.
- Analytics or telemetry.
- Native iOS app, Google OAuth verification and CASA assessment.

## Core concepts and data model

The unit of everything is a sender, keyed by lowercased from-address. Every card, deck, queue and status hangs off a sender record.

- **Sender:** one from-address, such as `deals@brand.com`. Two addresses from the same brand are two senders.
- **Card:** the swipeable view of one sender.
- **Deck:** an ordered, filtered list of cards. There are three: Main, Saved for later, and Re-review keeps.
- **Unsubscribe queue:** left swipes waiting for the commit step. Empty in sudden death mode.
- **Manual queue:** senders that need a human to click a link, plus block and report-spam actions.

### Sender record

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Lowercased from-address. Primary key. |
| `displayName` | string | Name part of the From header, latest seen. |
| `domain` | string | Registrable domain of the address, such as `brand.com`. |
| `listIds` | string\[\] | Every distinct `List-Id` header value seen. |
| `messageCount` | number | Messages from this sender across all scanned windows. |
| `lastReceivedAt` | ISO date | Date of the newest message. |
| `latestSubject` | string | Subject of the newest message. |
| `latestSnippet` | string | Gmail's `snippet` for the newest message. |
| `latestMessageId` / `latestThreadId` | string | For header lookup and the Open in Gmail link. |
| `unsubMethods` | object | `{ oneClickUrl?, mailto?, httpUrl?, bodyLinks? }`, parsed from the newest message. |
| `status` | enum | `new`, `kept`, `saved`, `queued`, `unsubscribed`, `manual`, `repeat_offender`, `blocked`. |
| `prevStatus` | enum | Status before `queued`, so undo can restore it. |
| `keptAt` / `countAtKeep` | ISO date / number | Set on keep. Messages since keep = `messageCount - countAtKeep`. |
| `unsubscribedAt` | ISO date | Start of the grace period. Reset on each escalation. |
| `escalationStep` | number | 0 before any unsubscribe; increments per attempt. |
| `returnCount` | number | Messages received after the grace period ended. |
| `lastReturnAt` | ISO date | Newest message received after the grace period. |

### Sender lifecycle

&#91;embedded content: sender lifecycle · 8 statuses\]

Saved and Kept senders follow the same swipes as New when they come up in their decks. In sudden death, Queued lasts 3 seconds. Escalation steps 4 and 5 also pass through the queue before the sender becomes Blocked.

### Attempt record

Every unsubscribe or escalation action writes one attempt row, so the History screen and the repeat-offender stamp can show what was tried.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Generated. |
| `senderId` | string | Foreign key to sender. |
| `method` | enum | `one_click`, `mailto`, `manual_link`, `filter_block`, `report_spam`. |
| `at` | ISO date | When it ran. |
| `result` | enum | `sent_unconfirmed`, `sent`, `failed`, `done_by_user`. |
| `detail` | string | Error text, sent message id, or the link opened. |

## Gmail integration

All Gmail access runs from the browser with a short-lived access token. Nothing is sent to any server Unsubber controls.

### Auth

- Use the Google Identity Services token client (`google.accounts.oauth2.initTokenClient`). It returns an access token that lasts about an hour, with no refresh token.
- Keep the token in memory only. Never write it to IndexedDB or localStorage.
- Because of that, every app open needs one tap to sign in; iOS blocks the popup without a tap. Remember the last account (the address only) and offer Continue as that address, which requests the token with `prompt: ''` and a `login_hint` so the account chooser is skipped. Removing the tap entirely needs a refresh token, which needs a backend (Phase 2).
- If a different Gmail account signs in, clear local data before scanning. The POC holds one account's data.
- On a 401, call `requestAccessToken({ prompt: '' })` to get a new token without the consent screen, then retry the request once.
- Wrap all of this in an `AuthProvider` interface so the Capacitor phase can swap in native Google Sign-In. Google blocks OAuth inside embedded webviews.

### Scopes

| Scope | Used for |
| --- | --- |
| `https://www.googleapis.com/auth/gmail.modify` | Read headers and snippets, archive, move to Spam. |
| `https://www.googleapis.com/auth/gmail.send` | Send unsubscribe emails for `mailto:` methods. |
| `https://www.googleapis.com/auth/gmail.settings.basic` | Create block filters. |

Request all three at first sign-in. All are restricted or sensitive scopes, which is fine while the app stays in Testing status.

### Initial scan

1. Build the people-I-talk-to set. List `in:sent newer_than:365d`, fetch `To` and `Cc` headers, and store every recipient address. Skip messages Unsubber itself sent (see below).
2. List candidate messages with `messages.list`, `q = newer_than:90d -in:sent -in:drafts -in:chats`. Spam and Trash are excluded by default. Page through `nextPageToken`.
3. For each id, call `messages.get` with `format=metadata` and `metadataHeaders` = `From`, `Subject`, `Date`, `List-Unsubscribe`, `List-Unsubscribe-Post`, `List-Id`.
4. Group by lowercased from-address. Drop any sender in the people-I-talk-to set.
5. For each sender, keep counts, the newest message's subject, snippet and ids, and parse `unsubMethods` from the newest message that has a `List-Unsubscribe` header.
6. Save senders and a slim message index to IndexedDB. Save the `historyId` from `users.getProfile` taken at scan start.

Rate limits: Gmail enforces 15,000 quota units per user per minute, and `messages.get` and `messages.list` cost 5 each. Run at most 10 requests in flight and stay under 25 requests per second, which uses about half the quota. On a rate-limit response (429, or 403 with a rate-limit reason) pause every request, not just the one that failed, then back off exponentially up to 64 seconds so the per-minute window can recover. Back off per request on 5xx. If retries run out, the scan screen resumes on its own after a minute. The first iPhone scan hit the quota at 40 requests per second with per-request backoff only.

Unsubscribe emails sent by the app land in Sent. Record their message ids and exclude them from step 1, or every unsubscribe address becomes a person you talk to.

### Older windows

A Scan older mail action scans the next 90-day window back, using `after:` and `before:` with `YYYY/MM/DD` dates. New senders join the Main deck as `new`. Existing senders get their counts added. The app stores the list of scanned windows so the same window is never scanned twice.

### Incremental sync

On every app open and on a manual refresh, call `users.history.list` with `startHistoryId` and `historyTypes=messageAdded`. Fetch metadata for each new message, update senders, and run repeat-offender checks. History ids are usually valid for about a week. On a 404, fall back to a scan from the last sync date to now.

### Write actions

| Action | API call |
| --- | --- |
| Archive a sender's mail | List `from:<address> in:inbox`, then `messages.batchModify` with `removeLabelIds: ['INBOX']`, up to 1,000 ids per call. |
| Report spam | `messages.batchModify` on that sender's messages with `addLabelIds: ['SPAM']`, `removeLabelIds: ['INBOX']`. |
| Block | `users.settings.filters.create`, criteria `{ from: <address> }`, action removes `INBOX` and adds a user label `Unsubber/Blocked`. Create the label on first use. |
| Send unsubscribe email | `messages.send` with a base64url RFC 2822 message. |

## Decks and swipe interaction

Left unsubscribes, right keeps, up saves for later. Arrow keys trigger the same animation and logic as touch swipes.

### Controls

| Gesture | Key | Action | Overlay label |
| --- | --- | --- | --- |
| Swipe left | Left arrow | Unsubscribe: add to queue, or start the 3-second timer in sudden death | Unsubscribe |
| Swipe right | Right arrow | Keep: status `kept`, set `keptAt` and `countAtKeep` | Keep |
| Swipe up | Up arrow | Save for later: status `saved` | Later |
| Tap card | Space | Expand preview of the newest email |  |
| Undo button | Z | Undo the last swipe |  |

A swipe commits when the card passes 30% of its width (or height, for up) or is flicked fast. Below that it springs back. The overlay label fades in as the card moves, so direction is clear before release.

### Card contents

- Display name and from-address.
- Message count and last received date, such as "47 emails, last on Nov 9".
- Newest subject and snippet.
- Unsubscribe method badge: One-click, Email, Link, or No link found.
- On repeat offenders: the stamp, the last step tried and its date, and emails since unsubscribing.

The expanded preview shows the snippet and the three newest subjects, plus an Open in Gmail link to `https://mail.google.com/mail/u/0/#all/<threadId>`. Do not render email HTML in the POC. Remote images in marketing mail are tracking pixels and would report the email as opened.

### Decks

| Deck | Contains | Sort |
| --- | --- | --- |
| Main | `new` and `repeat_offender` senders | Repeat offenders first, then by `messageCount` descending |
| Saved for later | `saved` senders | `messageCount` descending |
| Re-review keeps | `kept` senders | Messages since keep, descending |

Swiping in Saved for later or Re-review keeps uses the same three actions. Keeping again in Re-review keeps resets `keptAt` and `countAtKeep`. Each deck shows a position counter, such as "12 of 318", and an empty state with the next useful action.

### Undo

In queue mode, undo pops a stack of swipes and restores each sender's `prevStatus`, back to the start of the session. A session is one visit to a deck: switching tabs starts a new one, and the card order is frozen for the session so cards never jump. Holding an arrow key swipes one card, not a run. Committed actions cannot be undone. In sudden death, undo cancels any unsubscribe still inside its 3-second window.

### Filter swipe (planned, milestone 8)

Many senders are worth keeping but don't need to sit in the inbox, such as receipts, social notifications and loyalty programs. Down, the unused direction, sets up a Gmail filter for the sender instead of unsubscribing.

| Gesture | Key | Action | Overlay label |
| --- | --- | --- | --- |
| Swipe down | Down arrow | Filter: open the filter sheet for this sender | Filter |

- **Filter sheet:** pick one or more of Skip the inbox (archive), Mark as read, and Apply label. Apply label defaults to `Unsubber/<domain>`. The last choice is remembered as the default for the next sheet, so a run of similar senders takes one tap each.
- **Execution:** `users.settings.filters.create` with criteria `{ from: <address> }` and the chosen actions: remove `INBOX`, remove `UNREAD`, add the label. Then apply the same change to the sender's existing inbox mail with `messages.batchModify`. It uses the `gmail.settings.basic` scope already requested for Block.
- **Data model:** a new sender status `filtered`, plus a `filterId` and the chosen actions on the sender record so History can show and remove the filter. Attempt method `filter_archive`. Filtered senders leave the Main deck, aren't checked for repeat offenses, and can be reopened from History.
- **Queue and undo:** filters queue and commit like unsubscribes, with the confirm sheet counting them separately, such as "8 unsubscribe, 3 filter". Undo restores `prevStatus` before commit. In sudden death, filters fire after the same 3-second undo window.
- **Touch conflict:** a downward drag on iPhone can trigger page scroll or pull-to-refresh. The card needs `touch-action: none` and `overscroll-behavior: none` on the deck, checked on a home-screen install.

## Unsubscribe execution

By default a left swipe only queues the sender; the unsubscribe runs when Aaron confirms the queue. Sudden death mode skips the queue and fires each one 3 seconds after the swipe.

### Method resolution

Parse every URI in the `List-Unsubscribe` header. It is a comma-separated list in angle brackets, such as `<mailto:u@x.com?subject=unsub>, <https://x.com/u/abc>`. Pick the first method available, in this order:

1. **One-click.** An `https` URI plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Send `fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })`. The response is opaque, so record `sent_unconfirmed`.
2. **Email.** A `mailto:` URI. Parse the address plus any `subject` and `body` parameters; default subject is `unsubscribe`. Send through `messages.send` and record the sent message id.
3. **Link.** An `http(s)` URI with no one-click header. Route to the manual queue. Never fetch it automatically, since a GET often lands on a preferences page.
4. **No header.** Fetch the newest message with `format=full`, decode the HTML part, and collect `href`s whose URL or anchor text contains unsubscribe, opt out, or manage preferences. Store them as `bodyLinks` and route to the manual queue. If none are found, route to the manual queue as No link found.

Put parsing and resolution in pure functions with unit tests. Cover multiple URIs, mailto with parameters, malformed headers, and missing Post headers.

### Queue mode

- Left swipe sets status `queued` and adds the sender to the unsubscribe queue.
- A queue badge shows the count. Its button reads "Unsubscribe from 12".
- The confirm sheet breaks the queue down by method, such as "8 one-click, 2 email, 2 need you".
- On confirm, run senders with up to 4 in parallel and show progress. One-click and email senders become `unsubscribed`. Link and no-header senders become `manual`.
- After each sender runs, archive all of their inbox mail. This applies to manual senders too.
- Finish with a summary toast: "Unsubscribed from 10. 2 need you." The second part links to the manual queue.
- The confirm sheet lists each queued sender with its method and a Remove button, which restores `prevStatus`. Once a commit starts, its senders leave the undo stack.
- If one-click fails (network error or timeout), try email next. If email fails, route the sender to the manual queue. A sender whose only mailto goes to someone in the people-I-talk-to set also goes to manual, after a body-link search.
- An expired sign-in or a Gmail rate limit stops the whole run. Senders not reached stay queued, and the toast says how many.
- Save each sender's new status before archiving, so a failed archive never causes a second unsubscribe on retry. Archive failures are counted in the toast.

### Sudden death mode

- A toggle in the deck header. When on, the deck switches to the sudden death color treatment so the mode is never ambiguous.
- Each left swipe starts its own 3-second timer and shows an undo toast. If several timers are running, the toast shows the newest sender and a count, such as "Unsubscribing from Brand X and 2 more".
- Undo or Z cancels every pending timer. When a timer ends, that sender runs through the same executor as queue mode, including archive.

### Manual queue

Each row shows the sender, why it is here (Link or No link found), and these actions:

- **Open link:** one button per link, opened in a new tab. Logs an attempt with result `done_by_user` only after Mark done.
- **Mark done:** status `unsubscribed`, starts the grace period.
- **Block:** creates the Gmail filter. Status `blocked`, tracking stops.
- **Report spam:** moves the sender's mail to Spam. Status `blocked`, tracking stops.

### Safety rules

- Never act on messages in Spam or Trash.
- Never fetch a body link automatically. Body links are only shown for a manual click.
- Never send a mailto unsubscribe to an address in the people-I-talk-to set.

## Repeat offenders

A sender becomes a repeat offender when mail arrives more than 10 business days after the unsubscribe. CAN-SPAM gives senders that long to honor a request, so mail inside the window is counted but not flagged.

### Detection

Run on every incremental sync and after every older-window scan. For each new message, find the unsubscribed sender it belongs to:

- Same from-address, or
- Same `domain` and a `List-Id` already in that sender's `listIds`. This catches brands that rotate addresses.

If the message date is after `unsubscribedAt` plus 10 business days (skip Saturdays and Sundays), set status `repeat_offender`, increment `returnCount` and set `lastReturnAt`. Senders with status `blocked` or `kept` are never checked.

### The stamp

Repeat offenders sit at the front of the Main deck. Their card carries a rubber-stamp overlay reading REPEAT OFFENDER, rotated a few degrees. Under it: the last step tried and its date, and the emails received since, such as "Tried one-click on Oct 2. 6 emails since."

### Escalation

On a stamped card, left queues the next step instead of a plain unsubscribe. Steps the sender doesn't support are skipped.

1. Retry one-click.
2. Email unsubscribe.
3. Manual link, through the manual queue.
4. Block with a Gmail filter.
5. Report spam.

Steps 1 to 3 reset `unsubscribedAt` and start a new grace period. Steps 4 and 5 set status `blocked` and end tracking. Right means forgiven: status `kept`, tracking stops. Up saves for later, as on any card.

Build notes (milestone 6):

- `escalationStep` counts runs, the first unsubscribe included. The next step is rung `escalationStep - 1` of the sender's supported ladder, and the last rung (Report spam) repeats. A stamped card's left button, drag overlay and a hint line name the step, such as "Swipe left to block them with a Gmail filter."
- A failed retry or Block leaves the sender stamped at the front of Main, one rung up for a failed retry, so the run never stops for one sender.
- A message from a new address that matches a tracked sender by domain and `List-Id` counts toward that sender instead of creating a new card.
- Sync runs when the app opens, when it returns to the foreground after 10 minutes or more, and from the ↻ button in the deck header. Sent, Drafts, Chats, Spam and Trash are skipped. New offenders reorder Main only if the deck session hasn't started; the toast says "1 repeat offender is back at the front of Main."
- Block creates the labels `Unsubber` and `Unsubber/Blocked` on first use and caches the label id. An identical existing filter counts as blocked. Manual-queue rows offer Block and Report spam directly, with a confirm.

## Screens and UI

Seven screens, one-column on phone, built around the card stack. The visual idea is postal: unwanted mail gets cancelled like a stamp.

### Screens

1. **Sign in.** One Sign in with Google button. One line on what the app reads, and that data stays on this device.
2. **Scan progress.** Messages scanned out of total, senders found. The deck opens when the scan finishes.
3. **Deck.** Tabs for Main, Later and Re-review keeps. Card stack, position counter, queue badge, undo, sudden death toggle.
4. **Confirm sheet.** The queue broken down by method, with an Unsubscribe from 12 button.
5. **Manual queue.** Rows with Open link, Mark done, Block and Report spam.
6. **History.** Every unsubscribed and blocked sender, with status, attempts and returns.
7. **Settings.** About this build, Scan older mail, sudden death default, Reset Later (moves every saved sender back to Main), export and import JSON, clear all data, sign out.

Navigation is a bottom tab bar on phone: Deck, Manual (with count), History, Settings. At 900px and wider it becomes a left rail, and the card stays centered at 400px max.

### Deck wireframe

```
+---------------------------------------+
| Main   Later   Re-review   Sudden: off|
+---------------------------------------+
|   +-------------------------------+   |
|   | Brand X                       |   |
|   | deals@brandx.com              |   |
|   |                               |   |
|   | 47 emails, last on Nov 9      |   |
|   | 48 hours only: 30% off        |   |
|   | Our biggest sale of the...    |   |
|   |                               |   |
|   | [One-click]                   |   |
|   +-------------------------------+   |
|    [<] Unsubscribe [^] Later Keep [>] |
|              12 of 318                |
+---------------------------------------+
| Unsubscribe from 12             Undo  |
+---------------------------------------+
| Deck    Manual (3)   History  Settings|
+---------------------------------------+
```

### Design direction

Spend the boldness in one place: the stamp. The Unsubscribe overlay during a left swipe and the REPEAT OFFENDER stamp share one treatment: cancel-red, expanded heavy type, rotated about 6 degrees, a slightly rough ink edge. Everything else stays quiet.

| Token | Light | Use |
| --- | --- | --- |
| Paper | `#F6F7F9` | Page background |
| Card | `#FFFFFF` | Card and sheet surfaces |
| Ink | `#1C2433` | Text |
| Post blue | `#2C55C9` | Keep, primary buttons, focus ring |
| Cancel red | `#C2352B` | Unsubscribe, stamp, sudden death |
| Ochre | `#C98A12` | Later |
| Rule | `#D7DBE2` | Borders and dividers |

Dark mode: page `#131822`, card `#1C2330`, text `#E8EBF0`, rules `#2E3644`. Lift each accent about 10% in lightness for contrast.

- **Type:** Archivo from Google Fonts, variable. UI text at normal width; the stamp at width 125, weight 800. Scale: 13, 15, 17, 22, 28.
- **Case:** Sentence case everywhere. The stamp is the only all-caps text in the app.
- **Card:** 12px radius, 1px Rule border, no shadow at rest. A soft lift appears only while dragging. The next card peeks 8px below.
- **Sudden death:** the page background takes a 6% Cancel red tint and the toggle reads Sudden death on.
- **Motion:** swipes follow the finger and throw off-screen. With `prefers-reduced-motion`, swipes become 150ms fades.
- **Accessibility:** visible focus ring, every action reachable by keyboard, color never the only signal (badges and overlays carry words).

### Copy rules

- An action keeps its name through the flow: the button says Unsubscribe from 12, the toast says Unsubscribed from 12.
- Errors say what happened and what to do, such as "Gmail sign-in expired. Sign in again to keep going."
- Empty states point to the next action, such as "Main deck is clear. Scan older mail to find more senders."

## Storage

IndexedDB through Dexie, behind a `StorageAdapter` interface so a Supabase adapter can replace it for mobile. The app stores headers, subjects and snippets only, never full email bodies.

### Tables

| Table | Key | Indexes | Holds |
| --- | --- | --- | --- |
| `senders` | `id` | `status`, `domain`, `messageCount` | Sender records |
| `messages` | `id` | `senderId`, `date` | Slim index: `id`, `threadId`, `senderId`, `date`, `listId` |
| `attempts` | `id` | `senderId`, `at` | Attempt log |
| `queue` | `senderId` | `createdAt` | Pending unsubscribes and escalation steps |
| `people` | `address` |  | People-I-talk-to set |
| `sentByApp` | `messageId` |  | Unsubscribe emails the app sent |
| `meta` | `key` |  | `historyId`, `lastSyncAt`, `scannedWindows`, settings |

### Adapter interface

The UI and logic call only these methods, never Dexie directly:

- `getSender(id)`, `upsertSenders(senders[])`, `listSenders({ status, sort })`
- `addMessages(messages[])`, `countMessages({ senderId, after })`
- `addAttempt(attempt)`, `listAttempts(senderId)`
- `enqueue(item)`, `dequeue(senderId)`, `listQueue()`
- `getMeta(key)`, `setMeta(key, value)`
- `exportAll()` returns one JSON object; `importAll(json)` replaces local state after a confirm dialog

Build notes (milestone 7):

- **Export file:** `unsubber-export-YYYY-MM-DD.json`, `{ format: 'unsubber-export', version: 1, exportedAt, account, appVersion, data: { senders, messages, attempts, queue, people, sentByApp, meta } }`. Device-only meta (`storagePersisted`, `scanInProgress`, `olderScanInProgress`) is left out on export and kept on import.
- **Import checks:** import rejects files that aren't exports, are from another version, or are damaged, and refuses an export from a different Gmail account than the one signed in. After import the decks reload and a sync runs from the imported `historyId`.
- **Moving the file:** the iPhone home-screen app can't download files, so Export opens the share sheet there (Save to Files, AirDrop). Browsers download the file.
- **Scan older mail:** scans the 90 days before the oldest scanned window, through the same ingest as sync, so repeat-offender checks run too. The window is recorded in `olderScanInProgress` while running, so an interrupted scan resumes the same window.
- **History screen:** unsubscribed, repeat-offender and blocked senders, newest activity first. Filter chips, search, a standing line per sender (grace period end, quiet since, returns, blocked date) and an expandable attempt timeline.

### Persistence on iPhone

Install to the home screen and always open from the icon. Safari can clear a site's storage after 7 days without a visit, but home-screen web apps are exempt, and the two keep separate storage. Call `navigator.storage.persist()` on first run.

## Tech stack and architecture

A static React app, with three swappable seams for the move off GitHub Pages: auth, storage and the unsubscribe executor.

| Layer | Choice |
| --- | --- |
| Framework | React 18, TypeScript (strict), Vite |
| PWA | `vite-plugin-pwa`: manifest, service worker, offline app shell |
| State | Zustand |
| Storage | Dexie over IndexedDB |
| Swipe | Framer Motion drag gestures |
| Styling | Tailwind CSS with the tokens above as CSS variables |
| Auth | Google Identity Services script, `https://accounts.google.com/gsi/client` |
| Gmail | Plain `fetch` against `https://gmail.googleapis.com/gmail/v1`. No `gapi` client. |
| Tests | Vitest for parsers, method resolution, business-day math and sender matching |

### Folder layout

```
src/
  auth/        AuthProvider interface + GIS implementation
  gmail/       API client, rate limiter, retry and backoff
  scan/        people set, initial scan, older windows, incremental sync
  unsub/       header parser, method resolution, executor, escalation
  offenders/   grace period math, sender matching, flagging
  storage/     StorageAdapter interface + Dexie implementation
  state/       Zustand stores: decks, queue, undo stack, settings
  ui/          screens and components
```

### Seams for later

| Seam | POC | Later |
| --- | --- | --- |
| `AuthProvider` | GIS token client in the browser | Native Google Sign-In in Capacitor |
| `StorageAdapter` | Dexie | Supabase, for sync across devices |
| `UnsubExecutor` | Browser `no-cors` POST, unconfirmed | Serverless function that reports the real response |

## Setup and deployment

One Google Cloud project in Testing status and one GitHub repo deploying to Pages through Actions. Aaron does the Google Cloud steps by hand; Cursor builds the rest.

### Google Cloud (manual)

- [ ] Create a project named Unsubber.
- [ ] Enable the Gmail API.
- [ ] Configure the OAuth consent screen: user type External, status Testing, app name, support email.
- [ ] Add the three scopes from the Gmail integration section.
- [ ] Add Aaron's Gmail address as a test user.
- [ ] Create an OAuth client ID of type Web application. Authorized JavaScript origins: `http://localhost:5173` and `https://<github-username>.github.io`. No redirect URIs are needed for the token client.
- [ ] Put the client ID in `.env` as `VITE_GOOGLE_CLIENT_ID`. It is public by design, not a secret.

### Repo and Pages (Cursor)

- Repo named `unsubber`. Set `base: '/unsubber/'` in `vite.config.ts`.
- PWA manifest: `start_url` and `scope` set to `/unsubber/`, `display: standalone`, 192px and 512px icons plus an Apple touch icon.
- GitHub Actions workflow: on push to `main`, run tests, build, and deploy `dist/` with `actions/deploy-pages`.
- Store `VITE_GOOGLE_CLIENT_ID` as a repository variable and inject it at build time.
- Versioning: the `package.json` minor version is the last finished milestone (`0.4.x` = milestone 4 done); bump the patch for fixes in between. Settings shows the version, milestone, short commit id and build time, so every deploy can be checked on the phone against the pushed commit.
- The service worker waits for a safe moment to update: it applies a new version on the sign-in screen, or offers Reload when signed in (never during a commit), and checks for updates whenever the app returns to the foreground.

### First-run risk to check early

It is unverified how the GIS sign-in popup behaves inside an iOS home-screen web app. Test it in milestone 1. If the popup fails to return a token, fall back to Google's redirect-based OAuth 2.0 flow for client-side apps, `response_type=token`, with the token read from the URL fragment.

## Build plan

Eight milestones, built in the order listed (sudden death, milestone 5, is deferred to the end). Cursor should not start a milestone until the previous one's done-when checks pass on desktop Chrome and on an iPhone home-screen install.

1. **Skeleton and sign-in.** Vite, React, TypeScript, PWA and Tailwind scaffold, deployed to Pages by Actions. Sign in and show the signed-in Gmail address.
   - Done when: sign-in works on desktop and from the iPhone home-screen icon, and a 401 triggers a silent token refresh.
2. **Scan.** Gmail client with rate limiting, people-I-talk-to set, 90-day scan, sender grouping, Dexie storage, scan progress screen.
   - Done when: a reload shows the same senders without rescanning, and no address from Sent appears as a sender.
3. **Deck and swipe.** Main, Later and Re-review keeps decks, card, three-way swipe and arrow keys, undo stack, preview.
   - Done when: 50 cards can be cleared by keyboard alone with no dropped or doubled swipes.
4. **Unsubscribe executor.** Header parser and method resolution with unit tests, queue, confirm sheet, one-click, mailto, archive, body-link extraction, manual queue with Mark done.
   - Done when: parser tests pass, a committed queue archives each sender's inbox mail, and mailto sends appear in `sentByApp`.
6. **Repeat offenders.** Incremental sync, business-day grace period, sender matching, stamp, escalation steps, Block and Report spam.
   - Done when: matching and grace tests pass, and a seeded test sender with mail after the grace period shows stamped at the front of Main.
7. **History, settings and older mail.** History screen, Scan older mail, export and import, clear data, sign out.
   - Done when: an export from desktop imported on iPhone reproduces the same decks and history.
8. **Filter swipe.** Down swipe and arrow key, filter sheet, filter creation plus a batch change to existing mail, `filtered` status, History entry with Remove filter. Builds on the archive code from milestone 4 and the filter and label code from Block in milestone 6, so it can move up to directly after milestone 6 if the Main deck needs it sooner.
   - Done when: a down swipe on a test sender creates the Gmail filter, archives or marks read its existing inbox mail, and new mail from that sender skips the inbox.
5. **Sudden death (deferred, may be dropped).** Toggle, color treatment, per-swipe 3-second timers, undo toast. Moved to the end on Nov 11: the queue and confirm sheet cover the need for now. Keeps its number so milestone references stay stable.
   - Done when: undo inside 3 seconds sends nothing, and a swipe left alone fires exactly once.

## Phase 2 and open items

Phase 2 starts when the POC is in daily use. The path ends at TestFlight unless the app goes public.

### Phase 2

- **Keep flow options.** In Re-review keeps, offer filter-and-auto-archive as an alternative to unsubscribe, with unsubscribe as the last resort. The filter swipe (milestone 8) covers the mechanics; this item is the Re-review prompt that suggests it.
- **Real storage.** Supabase adapter and sync across devices.
- **Confirmed unsubscribes.** Serverless function that sends the one-click POST and returns the real status.
- **Live detection.** Gmail push notifications through Pub/Sub, so repeat offenders are flagged without opening the app.
- **iOS app.** Capacitor wrap with native Google Sign-In, distributed through TestFlight. Google's Testing status caps this at 100 users.
- **Public release (optional).** Google OAuth verification plus an annual CASA security assessment, then App Store submission.

### Open items

- [ ] Confirm Block and Report spam belong in the POC. This spec assumes yes; dropping them removes the `gmail.settings.basic` scope.
- [ ] Check whether a Gmail filter created through the API can add the `TRASH` label. If it can, Block sends mail to Trash instead of the `Unsubber/Blocked` label.
- [ ] Decide whether senders that share a domain and `List-Id` should merge into one card. This spec keeps one card per from-address.
- [x] Verify GIS popup sign-in from the iOS home-screen app (milestone 1). Popup works from the home-screen icon; the redirect fallback is built but not needed so far.
- [ ] Filter swipe: decide whether one filter per domain (`from:@brand.com`) should be offered alongside one per address, and whether to bulk-filter every sender with the same `List-Id`.
