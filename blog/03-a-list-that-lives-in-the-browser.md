# Marketplace Listing Helper: A list that lives in the browser - Part 3

*~7 min read*

The extension needs to remember what I'm selling. With no server allowed, the list has to
live in the browser, and it has to move to and from a spreadsheet, because that is where I
keep my stock. This post is the data model, and the small decisions that keep a CSV and a
browser store from fighting each other.

## Where it lives

Everything is in `chrome.storage.local`, under two keys:

- `mlh_data` is `{ headers, rows }`: the column names in order, and one object per item.
- `mlh_meta` holds the housekeeping: a count of changes since the last export, when the last
  export was, the name of the footer template, and the description templates.

Rows are keyed by the **header names from my own sheet**, not by fixed field names. If my
spreadsheet calls a column `Asking price`, that is what's stored and what's exported. The
extension adapts to the sheet instead of the other way round.

## Loose column matching

That flexibility needs a lookup layer. Code never writes `row["title"]`. It asks for the
logical field `title`, and `headerFor()` finds whichever column matches, ignoring case:

```js
const ALIASES = {
  id:    ["id", "sku", "ref", "item id"],
  title: ["title", "name", "item", "item name"],
  price: ["price", "asking price", "£", "price (£)"],
  // ... category, condition, description, photos, status, listed
};
```

Reads and writes go through `get(row, "price")` and `set(row, "price", v)`, which also add a
column if the sheet doesn't have one yet. It's a few lines, and it means a sheet can use
`Name` or `Item` or `Title` and everything still works.

## Merging, not replacing

Importing a CSV *merges* by row key: the `id`, falling back to the title. CSV values win,
with one exception that matters a lot: a blank `status` or `listed` in the CSV keeps what the
extension already has.

That exception exists because the two sides know different things. My sheet knows prices and
descriptions. The extension knows which items I've marked as listed, and when. Without the
rule, re-importing my sheet would wipe every "listed" date and lose track of what needs
renewing. With it, I can re-import any time. Columns the extension doesn't know about are
carried through untouched and exported again, so nothing in the sheet is lost.

Status is one of `draft`, `listed` or `sold`. "Mark listed" stamps today's date, and an item
listed seven or more days ago is flagged as due a renew (I do the renewing myself, per the
rules from part 1).

## A list that lives in one browser needs a backup nag

Data in extension storage disappears if the extension is removed or the site data is cleared.
So the panel nudges me: after five unexported changes, or any change when it's been a week
since the last export, a banner asks me to export a backup. Exporting resets the counter and
records the date. It's a tiny feature that is the difference between "the list is safe" and
"the list is safe until I tidy my browser".

## Photos are filenames

The list stores photo *filenames*, joined with `;`, in order, with the first as the cover. A
browser extension can't hold on to a file handle between sessions, so at this point I had to
reload the photos folder each session. Part 6 is the story of removing that limit.

Pairing photos to items is mostly automatic. Name them `12-1.jpg`, `12_front.jpg` or `12.jpg`
for item 12, or start the filename with the item's title, and the pairing function matches
them. Naming photos as I take them makes pairing a single click.

## What this adds up to

Storing the list was easy. The work was in the seams: loose column names so a real sheet
imports, a merge that respects what each side knows, and a backup reminder because the store
is private to one browser profile. Each of those is a few lines, and each prevents one
specific way of quietly losing data.

---

<!-- commits: project was not under version control when written -->

Previous: [← Filling in Facebook's form](02-filling-in-facebooks-form.md) · Next: [From a spreadsheet to listings →](04-from-a-spreadsheet-to-listings.md) · Back to [series index](README.md)
