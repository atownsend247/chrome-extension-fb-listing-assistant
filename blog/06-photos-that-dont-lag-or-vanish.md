# Marketplace Listing Helper: Photos that don't lag or vanish - Part 6

*~8 min read*

The manager's photo picker had two problems. Selecting photos in the edit form was slow, and
every new session started with reloading the whole photos folder. Both come down to the same
thing: phone photos are large, and a browser extension can't keep hold of files it was shown
once. This post is how each was handled.

## The lag

The edit form shows every photo in the folder as a small tile, and you click the ones that
belong to the item, in order. Clicking was visibly slow. There were two causes:

1. Every click **rebuilt the whole grid**: all the tiles, all the images.
2. Each tile's image was the **full-size photo**, scaled down by CSS. A 12-megapixel JPEG
   must be fully decoded to be drawn at 80 pixels wide, and the grid did that for every
   photo, on every click.

The fixes mirror the causes:

- **Build the grid once**; a click now only toggles a class and a numbered badge on the tile
  that changed.
- **Make real thumbnails.** Each photo is decoded once with `createImageBitmap`, drawn to a
  200px canvas, and kept as a small JPEG. A queue runs three at a time so it doesn't swamp the
  browser, and an `IntersectionObserver` means only tiles scrolled into view are processed.

I haven't timed the before and after. The change removes the repeated full-size decoding, so
it should be obvious, but "should be" is not a measurement.

## The vanishing

Chrome gives an extension a `File` object when you pick a folder, and it can't be saved: only
the filename survives a refresh. So the list remembered *which* photos belonged to an item,
and the photos themselves had to be picked again every session.

The way round it is to keep a copy of the image data inside the extension, which brought up a
question: where? The browser's IndexedDB is the usual answer for blobs, and it doesn't work
here. A content script's IndexedDB belongs to the page it runs on, so on Facebook it would be
`facebook.com`'s storage, not the extension's, and the manager page couldn't see it. So photos
go in `chrome.storage.local`, which both share, as data URLs. That needs the
`unlimitedStorage` permission, because the default quota is only about 10 MB.

## What gets saved

Saving every full-resolution photo as base64 would use a lot of space, so:

- photos over 2000px on the long side, or over 1.5 MB, are shrunk to a 2000px JPEG (quality
  0.88);
- smaller ones are saved untouched;
- a 200px thumbnail is stored beside each.

Roughly half a megabyte per photo. A folder is only processed for files that are new or have
changed (matched on name, size and modified time), so reloading a folder after adding five
photos saves five photos. There's a **Clear saved photos** button that frees the space and
leaves the items and their pairings alone.

## Placeholders

Loading every saved photo into memory on every Facebook page would be wasteful, so the page
only holds a placeholder for each (`{ name, type, saved: true }`). Thumbnails are fetched from
storage as tiles scroll into view. The full image is rebuilt into a real `File` at the last
moment, when you press Fill and it's attached to the upload box:

```js
const bin = atob(b64), bytes = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
return new File([bytes], name, { type });
```

It decodes the data URL by hand rather than using `fetch`, because a content script's
requests can be subject to the host page's security policy.

## Caveats

What gets attached to the listing is the **resized copy**, not the original. Photos Chrome
can't decode, HEIC for instance, can't be saved; they're reported as such and still need
loading each session. And nothing yet deletes the photos of items I've sold. That's a
button, not a policy, for now.

I've also only checked this by reading and syntax-checking the code, not yet by running it
against a real folder, so the first real run is the test.

## What this adds up to

The lag was two ordinary mistakes (rebuilding everything on every click, decoding more pixels
than you display) and the persistence was a choice of *where* to store things, forced by what
a content script's origin is. Neither needed anything exotic.

---

<!-- commits: project was not under version control when written -->

Previous: [← A full-page manager, without a bundler](05-a-full-page-manager-without-a-bundler.md) · Next: [Linking listings that already exist →](07-linking-listings-that-already-exist.md) · Back to [series index](README.md)
