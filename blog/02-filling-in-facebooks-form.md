# Marketplace Listing Helper: Filling in Facebook's form - Part 2

*~7 min read*

Filling in a form sounds like the easy half of the job. It's the half that breaks. Facebook's
Create listing form is built from generated markup with no stable ids, its inputs are
controlled by React, and its dropdowns are custom widgets. This post is about how the
extension copes, and about the one rule that keeps it honest when it can't.

## Finding a field without an id

There's nothing like `#title` to select. What is stable is the text a person reads, so
`findField()` looks fields up by their visible label, falling back to an `aria-label`:

```js
function findField(labelText) {
  const want = labelText.toLowerCase();
  for (const lab of document.querySelectorAll("label")) {
    if (lab.closest("#mlh-panel, #mlh-modal")) continue;
    const t = (lab.innerText || "").trim().toLowerCase();
    if (t === want || t.startsWith(want)) { /* return the input, or the combobox */ }
  }
  const aria = document.querySelector(`[aria-label="${labelText}" i]`);
  // ...
}
```

Two small details matter. It skips anything inside the extension's own panel and modal
(`#mlh-panel, #mlh-modal`), otherwise the panel's own "Title" label could be found first. And
it matches with `startsWith`, because Facebook sometimes adds a hint after the label text.

This is the part of the project most likely to break, and CLAUDE.md says so in as many words:
Facebook's markup changes often, so expect to adjust `findField()`.

## Typing into a React input

Setting `input.value = "..."` doesn't work on a React-controlled input. React tracks the
value itself and ignores a change it didn't make, so the box looks filled, then the form
behaves as if it's empty. The fix is to call the browser's *native* value setter, bypassing
React's wrapper, and then fire the events React listens for:

```js
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  el.focus();
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}
```

The textarea and input prototypes have separate setters, hence the check. It's a well-known
trick, and it's what makes title, price and description actually register.

## Dropdowns

Category and Condition aren't `<select>` elements. You click them and a list appears. So
`pickDropdown()` clicks the control, waits 600ms for the list to render, then looks for
anything that looks like an option and clicks the one whose text matches, trying an exact
match first and then a "contains":

```js
const opts = [...document.querySelectorAll(
  '[role="option"], [role="menuitemradio"], [role="radio"], [role="listbox"] [role="button"]')];
const match = opts.find(o => text(o) === want) || opts.find(o => text(o).includes(want));
```

If nothing matches (my category name differs from Facebook's, say) it presses Escape to close
the list and reports `pick manually` instead of guessing.

## Photos

The upload box is a normal `<input type="file">`, and a script can assign files to one by
building a `DataTransfer` and firing a `change` event:

```js
const dt = new DataTransfer();
files.forEach(f => dt.items.add(f));
input.files = dt.files;
input.dispatchEvent(new Event("change", { bubbles: true }));
```

Photos are attached first, then the script waits 800ms before touching the other fields,
because the upload area re-renders the form.

## The report

Every fill ends with a per-field table in the panel: Photos, Title, Price, Category,
Condition, Description, each marked `ok`, `not found`, `pick manually`, and so on. This is the
rule I care most about in the whole file. A filler that silently half-works is worse than no
filler, because I'd publish a listing believing it was complete. The report keeps that honest,
and it's the reason the "I press Publish" rule is safe: I always know exactly what to check by
hand.

There's one more thing that happens at fill time. A **footer template** (my "collection and
payment" paragraph, say) is appended to the description when filling, but never saved into
the item. Change the footer later and every unlisted item picks it up.

## What this adds up to

Reliable form filling here isn't about clever code. It's about picking the least fragile hook
for each kind of control (visible label text, native setters, role-based options), failing
visibly when a hook stops working, and keeping all of it in a couple of small functions so the
inevitable repair is quick.

---

<!-- commits: project was not under version control when written -->

Previous: [← A helper that never presses Publish](01-a-helper-that-never-presses-publish.md) · Next: [A list that lives in the browser →](03-a-list-that-lives-in-the-browser.md) · Back to [series index](README.md)
