# Marketplace Listing Helper: A helper that never presses Publish - Part 1

*~6 min read*

I had a few dozen things to sell, mostly Warhammer models, and a spreadsheet describing
them. Facebook Marketplace wanted each one typed into a form, one at a time: title, price,
category, condition, description, photos. None of it is hard. All of it is repetitive, and
repetition is exactly what a computer should be doing for me. So I started building a Chrome
extension to do the typing, and the first decision was about what it must *not* do.

## The rule everything else hangs off

The extension fills the form in. **I** press Next and Publish. It never clicks either, and
it never touches Renew, Delete or messaging on Facebook either.

It would be technically easy to go further. A script that fills the form, clicks Publish and
moves to the next item is only a few more lines. But that is automation of my Facebook
account, and I'd rather not give Facebook a reason to flag it. Having a human press Publish
on every listing keeps the extension in the role of a very fast typist. It also means I
check every listing before it goes live, which for a seller is no bad thing: the form is
where you notice a wrong price or a missing photo.

That became the first section of the project's `CLAUDE.md`, as a hard rule not to be changed
without my asking:

- never automate Next, Publish, Renew, Delete or messaging on Facebook;
- no background posting, scheduled actions or headless browsing;
- no remote servers or third-party APIs, so all data stays in the browser and in local CSV
  files;
- selling and delisting on other platforms is out of scope, so "Mark sold" in the extension
  is all that's needed.

Writing the rules down first has paid off since. When a feature idea comes up (auto-renew,
auto-replying to messages) the answer is already on file.

## The shape of the extension

It's a Manifest V3 extension with a deliberately small footprint: one content script that
runs on `https://www.facebook.com/*`, and the `storage` permission. There is no build step and
no dependencies. It's plain JavaScript that loads straight from the folder with Chrome's
"Load unpacked", so editing a file and pressing reload is the whole development loop.

The content script adds a small panel (about 330px wide) in the bottom-right corner of
Marketplace pages. Two details were worth getting right early.

**Facebook is a single-page app.** Navigating from the feed to Marketplace doesn't reload the
page, so a content script that checks the URL once at load would show the panel on the wrong
pages, or never. Instead the script polls the path once a second and adds or removes the
panel:

```js
function sync() {
  const on = location.pathname.startsWith("/marketplace");
  if (on && !panel.isConnected) document.body.appendChild(panel);
  if (!on && panel.isConnected) { panel.remove(); document.getElementById("mlh-backdrop")?.remove(); }
}
```

A one-second poll isn't elegant, but it's cheap and it doesn't depend on any of Facebook's
internal events, which change without warning.

**The script must only run once.** Content scripts can be injected more than once, and a
second copy would add a second panel. Everything is wrapped in an IIFE that bails out if a
flag is already set:

```js
(() => {
  if (window.__mlhLoaded) return;
  window.__mlhLoaded = true;
  // ...
})();
```

## What the panel does

The first version could do five things: keep a list of items, import and export that list as
CSV, pair photos with items, fill the form, and record what had been listed. The rest of the
series is those pieces in turn: the form filling (the fragile part) is next, then the data
model, then the work of getting a real spreadsheet in.

## What this adds up to

The interesting part of this first step was not code. It was deciding that the tool would
stop one click short of the finish line, and writing that down so that it holds. Everything
that follows (the fragile form filling, the honest per-field report, the "pick manually"
fallbacks) follows from that one choice: the tool does the typing, and tells me plainly what
it couldn't do, because I'm the one who presses Publish.

---

<!-- commits: project was not under version control when written -->

Next: [Filling in Facebook's form →](02-filling-in-facebooks-form.md) · Back to [series index](README.md)
