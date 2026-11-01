# Chrome Extension FB Marketplace Listing Assistant

A small Chrome extension that keeps a list of things you're selling, pairs photos with
each item, and pre-fills Facebook Marketplace's Create listing form.
It never presses Next or Publish — **you** review and publish.

## Install / update
1. Unzip this folder somewhere permanent.
2. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
3. **Load unpacked** → select the `fb-listing-helper` folder.
   (Updating: replace the files, then press the ↻ reload icon on the extension's card
   and refresh Facebook.)

## How it works
The list lives inside the extension and survives page reloads and browser restarts.
CSV is how you move it to and from your Google Sheet.

The panel appears bottom-right on any facebook.com/marketplace page.

## Full-page manager
Click the extension's toolbar icon (or **Manager ↗** in the panel) to open the manager in its own tab.
It's the easiest place to load a batch of items:

- A table of every item with inline editing of title, price, condition, category and status.
  Changes save immediately; **Edit** opens the full form (description, templates, photos).
- **Import CSV / Export CSV / Templates / + New item** work exactly as in the panel.
- **Load photos folder** then **Auto-pair drafts** pairs every draft that has no photos with files named
  after its ID or title (`12-1.jpg`, `kallax-shelf-2.jpg`…), skipping files another item already uses.
- Search by title/category/description and filter by status.

The manager and the Facebook panel share the same list, and each picks up the other's changes.
The manager only edits the list — **filling the form still happens on Facebook**. Photos loaded in the
manager are used for pairing by filename; load the same folder in the Facebook panel before pressing Fill.

- **+ New item** — opens a form for title, price, category, condition, description and photos.
- **Edit** — same form for the selected item (also has Delete).
- **Import CSV** — merges a CSV into the list, matching items by `id` (or title if there's no id).
  CSV values overwrite what's there, except a blank status/listed in the CSV keeps the extension's value.
  So you can re-import your sheet any time without losing "listed" dates.
- **Load photos** — pick the folder where your item photos live.
- **Fill this listing** — on facebook.com/marketplace/create/item, fills the form and attaches the paired photos.
- **Mark listed / Mark sold** — updates status; "listed" stamps today's date.
- **Next draft →** — jumps to the next item that isn't listed or sold.
- **Export CSV** — downloads the whole list to paste or import back into your sheet.

Items listed 7+ days ago show **⟳ renew** in the dropdown.

## Linking an existing Facebook listing
For something you already posted: open its page on Facebook (`/marketplace/item/…`), and the panel
shows **Link this Facebook listing**. Pick the item (the likeliest match is pre-selected from the page title)
and press **Link**. It saves the listing's URL on the item, marks it **listed** (today's date if it had none —
edit the date in the manager if you posted earlier) and adds an **Open on Facebook ↗** link in the panel and
a ↗ column in the manager. **Unlink** or the item form's *Facebook listing URL* field removes or edits it.
Linking only records the address; it never clicks anything on Facebook. The URL is a CSV column (`fb_url`).

## Backups
The list lives only in this Chrome profile, so uninstalling the extension or clearing site data
would lose it. The panel shows a warning when you've made 5+ changes since your last export, or
any changes and it's been 7+ days. **Export backup** (or Export CSV) clears it. To restore, Import
that CSV.

## Description templates
**Templates** in the panel lets you write reusable snippets (two examples are included).
- In the New/Edit form, **Insert template…** drops one into the description at the cursor.
- Choose one as the **automatic footer** and it's added to the end of every description when
  you press Fill (skipped if the description already contains it). Your saved descriptions stay
  unchanged, so you can change the footer later and it applies everywhere.

## Pairing photos
In the New/Edit form, the right-hand side shows every photo in your loaded folder.

- Click photos **in the order you want them**; the numbers show the order, and #1 is the cover.
  Click again to unselect.
- Photos already paired with another item are faded. Tick **Unused only** to hide them.
- **Auto-pair** selects files named after the item's ID or title, e.g. for item 12:
  `12.jpg`, `12-1.jpg`, `12_front.jpg`, `12 (2).jpg` — or for “Kallax shelf”: `kallax-shelf-1.jpg`.
  Naming photos `<id>-1.jpg`, `<id>-2.jpg` as you take them makes this one click.
- **Add photos…** picks individual images from anywhere on your computer.

The panel shows thumbnails of the selected item's photos; a red dashed box means a
paired filename isn't in the currently loaded folder.

**Saved photos:** whenever you load a folder (or add photos), the extension keeps a copy inside the
browser — photos over 2000px or 1.5 MB are shrunk to a 2000px JPEG, smaller ones are kept as they are —
so you don't need to reload the folder each session. Reloading a folder only saves new or changed files.
Saved photos are used for thumbnails, pairing and attaching when you press Fill. They take disk space
(roughly 0.5 MB each); use **Clear saved photos** in the manager to remove them. Your item list and
pairings are not affected. Photos Chrome can't decode (for example HEIC) aren't saved and need loading
each session.

## CSV columns
Headers are matched loosely (case-insensitive). Any other columns in your sheet are kept and exported.

| Field | Accepted headers |
|---|---|
| id | id, sku, ref, item id |
| title | title, name, item, item name |
| price | price, asking price, price (£) — £ signs and commas are stripped when filling |
| category | category, fb category — should match a Facebook category name |
| condition | condition — `New`, `Used - Like new`, `Used - Good`, `Used - Fair` |
| description | description, desc, details, notes |
| photos | photos, images — filenames separated by `;` or `|` |
| status | status — draft / listed / sold |
| listed | listed, date listed — YYYY-MM-DD |

See `sample-listings.csv`.

## When something doesn't fill
After filling, the panel shows a per-field report. Category and Condition are dropdowns and
Facebook's option names can differ from yours — if they say "pick manually", choose them by hand.
Facebook changes its page layout fairly often; if a field says "not found", `findField()` in
`content.js` is the place to adjust.
