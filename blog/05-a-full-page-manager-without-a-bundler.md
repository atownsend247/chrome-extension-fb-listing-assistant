# Marketplace Listing Helper: A full-page manager, without a bundler - Part 5

*~8 min read*

Thirty-six items in a 330-pixel panel on the corner of a Facebook page is a poor place to
load a batch. I wanted a proper page: a table of everything, editable in place, with import
and export. This post is how that page was added without a build step, and without duplicating
the code that already worked.

## The page

An extension can ship ordinary HTML pages that open at `chrome-extension://<id>/manager.html`.
They share `chrome.storage.local` with the content script, so the manager and the Facebook
panel see the same list. The manager has a table with title, price, condition, category and
status editable inline (saved on `change`, so typing isn't interrupted), a search box and a
status filter, plus import, export and templates.

It needs a way to open. A toolbar click does it, through a small service worker whose only
job is to open the page, or focus it if it's already open:

```js
chrome.action.onClicked.addListener(openManager);
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.open === "manager") openManager(); });
```

The message handler is for the "Manager" button in the Facebook panel. A content script can't
navigate a normal tab to a `chrome-extension://` URL itself, so it asks the worker. The worker
does nothing on Facebook, has no timers and doesn't change the rule from part 1.

## Sharing code with no bundler

All the logic lived in one 800-line content script, mixed up with Facebook-specific code. The
manager needed the CSV handling, the column aliases, storage, photo pairing, and even the
item editor and template modals. The usual answer is modules and a bundler. I wanted to keep
"edit a file, press reload".

The trick is that classic scripts loaded one after another share a global scope. So the
shared code moved into `shared.js`, which declares plain top-level functions and variables.
The manifest loads it first:

```json
"js": ["shared.js", "content.js"]
```

and `manager.html` loads it with a `<script>` tag before `manager.js`. No imports, no exports,
no tooling. The cost is that shared names are globals, which is acceptable in a project this
size and was the cheapest way to keep a single copy of the editor. The editor and template
dialogs take a callback (`openEditor(row, cb)`) so each page decides what to redraw afterwards.

What stayed in `content.js` is only what belongs to Facebook: the panel, form filling,
and Mark listed/sold.

## Two pages, one list

With both pages open, each holds its own copy of the list in memory. If the manager saved
and the Facebook tab later saved its stale copy, it would overwrite the manager's work. So
each page listens for storage changes and reloads when the *other* one writes.

The obvious implementation is wrong. Each page also receives the event for its own write, so
you must ignore those, and the first idea (compare the new value to what's in memory) races
if you save twice in quick succession: the first write's event arrives while memory already
holds the second, looks "different", and reverts your own change. The fix is to mark writes
instead of comparing them. Each page generates a random id once, stamps it onto what it
writes, and ignores any change carrying its own stamp:

```js
await chrome.storage.local.set({ [DATA_KEY]: { headers, rows, by: SESSION }, [META_KEY]: meta });
// ...
if (d && d.by !== SESSION && d.headers) { headers = d.headers; rows = d.rows || []; changed = true; }
```

A known limit: if the same item is edited in both places at once, the last save wins, and a
reload triggered by the other page can close an open edit form.

## What this adds up to

The manager made loading a batch bearable, and refactoring for it left `content.js` smaller
and more focused. The two decisions I'd keep are the plain shared script (the right size of
solution for a project with no build step) and marking writes instead of comparing values,
which turned an intermittent race into a non-issue.

---

<!-- commits: project was not under version control when written -->

Previous: [← From a spreadsheet to listings](04-from-a-spreadsheet-to-listings.md) · Next: [Photos that don't lag or vanish →](06-photos-that-dont-lag-or-vanish.md) · Back to [series index](README.md)
