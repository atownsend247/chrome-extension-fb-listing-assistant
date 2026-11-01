# Marketplace Listing Helper: From a spreadsheet to listings - Part 4

*~6 min read*

With the importer working, I fed it the real thing: a spreadsheet of Warhammer stock called
`warhammer-items.csv`. It did not import cleanly, and the reasons are a good tour of what
"my data" looks like next to what a tool expects.

## What the sheet looked like

Nine columns: `Item, Brand, Range, Faction, Status, Quantity, Retail, Avg eBay Sold, Market vs
Retail (£)`. It was a stock-take, not a set of listings. Three things stood in the way.

1. **No price column.** The importer looks for `price`, `asking price`, `£` or `price (£)`.
   My sheet had `Avg eBay Sold` and `Retail`. Every item would have imported with a blank
   price.
2. **`Status` meant something else.** In the sheet it was `Built` or `BNIB` (brand new in
   box). In the extension, `status` is `draft`, `listed` or `sold`, and the renew logic reads
   it. Importing as-is would have put model condition where listing state belongs.
3. **Junk rows.** Thirteen blank rows, then a totals row (`£940.00`, `£950.00`,
   `-£154.00`) that would have imported as an item.

`Item` was the one column that already worked: it's an alias for the title.

## A conversion script, not a looser importer

I could have taught the importer to guess. I didn't, for the same reason as in part 3: the
extension's fields have fixed meanings, and a guess that is wrong 5% of the time silently
corrupts a list. Instead a short one-off script reshapes the sheet into the extension's
columns and leaves the importer strict:

| Extension field | Built from |
|---|---|
| `id` | generated, 1 to 36, so photo auto-pairing by `<id>-*.jpg` works |
| `title` | brand + item, quantity if more than 1, then range and faction |
| `price` | `Avg eBay Sold` with the `£` removed, used as-is |
| `condition` | `BNIB` becomes "New", `Built` becomes "Used - Good" |
| `description` | generated: brand, range, faction, "Brand new in box" or "Built, not painted", quantity |
| `category` | "Toys & Games" |
| `status` | `draft` |

The original `Status` is kept as a `Build state` column rather than discarded, along with
`Quantity`, `Brand`, `Range`, `Faction` and `Retail`, because the importer carries unknown
columns through. Rows with no item name (the blank rows and the totals row) are skipped, which
leaves 36 items.

## Titles

Titles were the part I changed my mind about. The first pass gave `Warhammer Ushabti x4`. But
a buyer searching Marketplace for "Tomb Kings" would never find that, and range and faction
are exactly what people search for. So the title now reads
`Warhammer Ushabti x4 - Pre-Sigmar 6th Tomb Kings`, and `Warhammer Hammerhead - 40k Tau`. Where
the range and faction are the same word (40k and 40k) it isn't repeated. The longest title is
83 characters, under Facebook's limit of 100, and the script truncates at 100 as a backstop.

Two small rules were forced by the data: quantities like `1 & 6` go into the title as
`x1 & 6` rather than being parsed, and a quantity of 1 is left out.

## Prices

I took the average eBay sold price as the asking price, as-is, as a first pass. A few items
sell for more than retail, such as Settra and the Casket of Souls, so those are worth a
second look by hand. Three rows had no status in the sheet at all, so they have no condition,
and the editor is the place to set them.

## A warning I wrote down

Because the importer matches rows by `id` and lets CSV values win, **re-importing a
regenerated file overwrites any edits made in the extension** to those items. Changing the
title format and regenerating is fine if nothing has been edited yet; once it has, it's safer
to patch the few fields that changed than to re-import everything.

I checked the round trip in Node: import the file, export it, import that, and the output is
byte-for-byte identical. That says the CSV code is stable. It does not say anything about
how it behaves in Chrome, which I'll be checking by hand.

## What this adds up to

Converting the sheet outside the tool kept the tool simple and honest. The extension's
fields keep their meanings, the odd cases (quantities, missing statuses, a totals row) are
handled in a script I can read and re-run, and the original columns survive.

---

<!-- commits: project was not under version control when written -->

Previous: [← A list that lives in the browser](03-a-list-that-lives-in-the-browser.md) · Next: [A full-page manager, without a bundler →](05-a-full-page-manager-without-a-bundler.md) · Back to [series index](README.md)
