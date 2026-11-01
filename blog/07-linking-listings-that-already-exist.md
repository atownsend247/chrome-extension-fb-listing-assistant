# Marketplace Listing Helper: Linking listings that already exist - Part 7

*~5 min read*

The extension was built to create listings, but plenty of my stock was already on Marketplace
before the extension existed. Those items sat in the list as drafts, with nothing to say they
were live: no "listed" date, no renew reminder, and a real risk of posting them twice. I
wanted to say "this listing is that item".

## What "link" means

Linking records the address of the Facebook listing on the item. That's all. It's a new column,
`fb_url`, which exports with the CSV like any other.

I considered two ways to do it:

- **Bulk match.** Read the titles on my "Your listings" page and propose matches against the
  list. It saves clicks, but it depends on the structure of a page that changes often, and
  scraping it is the kind of thing I'd rather build once the simple version has proved itself.
- **Link from the listing page.** Open the listing, press a button. This is what I built.

## How it works

On a `/marketplace/item/<id>` page the panel shows a "Link this Facebook listing" box with a
dropdown of my items. The page's number comes straight from the path:

```js
const itemIdFromPage = () => (location.pathname.match(/^\/marketplace\/item\/(\d+)/) || [])[1] || null;
```

To save a click, it suggests a likely item: the unlinked item whose title shares the most
words with the page's `document.title`. If the page title doesn't contain the item name, no
suggestion is made and I choose by hand. Pressing **Link**:

- stores `https://www.facebook.com/marketplace/item/<id>/` on the item;
- sets the status to `listed`, unless it's already `sold`;
- sets the listed date to today if there wasn't one.

That last point is a limitation I'd rather state than hide: for a listing I posted weeks ago,
today's date is wrong, and the renew reminder is counted from it. The manager makes it easy
to correct.

## Keeping it safe

A few rules stop it doing something surprising:

- If the listing was already linked to a different item, that link **moves** to the one I
  chose, so a listing never belongs to two items.
- If the item is already linked to a *different* listing, it asks before replacing it, and the
  other item's link is only cleared after I confirm.
- **Unlink** and a *Facebook listing URL* field in the editor undo or edit it by hand.
- A blank `fb_url` in an imported CSV keeps the stored link, as with `status` and `listed`
  in part 3. Re-importing the sheet can't erase it.
- Links are only drawn as clickable if they begin with `https://`, since the field is text I
  can paste into.

Once linked, the panel shows "Open on Facebook ↗" under the selected item, and the manager
table has a ↗ column.

## It's the same rule

Linking only *reads* the address bar. It doesn't click anything on the listing page, doesn't
renew, and doesn't edit, so it sits comfortably inside the rule from part 1: the extension
helps me keep track, and every action on Facebook is still mine.

## What this adds up to

The feature is small because I kept it to recording a fact (this listing is that item)
rather than driving the page. Everything useful that follows, the Open link, the listed state,
the renew reminder, comes from that one stored address. Bulk matching can come later if the
list grows enough to need it.

---

<!-- commits: project was not under version control when written -->

Previous: [← Photos that don't lag or vanish](06-photos-that-dont-lag-or-vanish.md) · Back to [series index](README.md)
