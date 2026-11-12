# Content: Lab Notes and page copy

MFL Marketing writes the content of andrewedmond.com. The build owns the code, layout and design. This file is the contract between the two.

## What MFL Marketing may change

| Path | What it holds |
|---|---|
| `notes/_posts/YYYY-MM-DD-<slug>.md` | One Lab Note |
| `notes/assets/<slug>.jpg` | That note's photo |
| `content/pages/home.md` | Home page copy |
| `content/pages/work-with-me.md` | Work with me copy |
| `content/pages/studio.md` | The studio's brands |
| `content/pages/privacy.md` | The privacy notice |

Everything else (layout, CSS, `build.mjs`, redirects, the workflow) belongs to the build. Send a change there as a request, not a commit. The build check rejects a `note/*` or `copy/*` branch that touches any other path.

## Publish a Lab Note

1. Add the photo at `notes/assets/<slug>.jpg`: JPEG, about 1600 px on the long side, under 400 KB.
2. Add the note at `notes/_posts/<date>-<slug>.md`:

   ```markdown
   ---
   title: The note's headline
   slug: the-notes-headline
   date: 2026-11-10
   linkedin: https://www.linkedin.com/feed/update/urn:li:activity:.../
   photo: /notes/assets/the-notes-headline.jpg
   photoAlt: What the photo shows, for people who can't see it
   description: One sentence for the notes list, RSS and link previews.
   dek: Optional standfirst under the title.
   ---

   The note's text, in Markdown. A blank line between paragraphs.
   ```

3. Run `node build.mjs`. It prints every problem it finds. Preview with `python3 -m http.server -d _site 8793` and open http://127.0.0.1:8793/.
4. Push a branch named `note/<slug>` and open a pull request against `main`.
5. When the **build** check passes and Andrew has approved the note, merge it. The site updates in about a minute.

### Front-matter rules

| Field | Required | Rule |
|---|---|---|
| `title` | yes | The headline |
| `slug` | yes | Lowercase words joined by hyphens. It becomes `/notes/<slug>/`. Never change it after publishing |
| `date` | yes | `YYYY-MM-DD`, the day it ran on LinkedIn. The file name is `<date>-<slug>.md` |
| `linkedin` | no | The LinkedIn post's URL. It becomes the "Comment on LinkedIn" link. Leave it out for a note that never ran on LinkedIn |
| `photo` | yes | `/notes/assets/<file>.jpg` (`.png` and `.webp` also work). The file must exist |
| `photoAlt` | yes | A plain description of the photo |
| `description` | yes | One sentence |
| `dek` | no | A standfirst shown under the title |
| `email` | no | `no` keeps the note off email entirely: no email is built, so "Send Lab Note" refuses it. Use it for site-only notes |

Any other field fails the build, which catches typos such as `photoalt`.

### Markdown

The body supports `##` and `###` headings, **bold**, *italic*, `code`, links, `-` and `1.` lists, `>` quotes, `---` rules, and images (`![alt](/notes/assets/x.jpg "caption")`). Don't use raw HTML. Ask the build if a note needs a visual.

## Change page copy

Page copy lives in named slots in each file's front matter, one line per slot. Edit the text after the colon. Don't add, rename or remove slots; the build fails on unknown or empty ones. Inline Markdown (bold, italic, links) works inside a slot.

| File | Slots |
|---|---|
| `home.md` | `kicker` (under the name, every page) · `intro` (the lede) · `signup` (the sign-up line, also the notes page intro and RSS description) · `button` (sign-up button) · `description` (search and link previews) |
| `work-with-me.md` | `diligenceTitle` · `diligence` · `diligenceCta` (link text to Borehole) · `advisoryTitle` · `advisory` · `email` · `description` |
| `studio.md` | `intro` (optional) · `description`. The brands go in the body, one per line: `- [Name](https://url): One line.` The home page shows the same list |

Push a branch named `copy/<page>`, open a pull request, and merge after the check passes and Andrew has approved the copy.

## Send a Lab Note by email

A note goes out by email only after it's live on the site, and only with Andrew's approval.

1. In GitHub, open **Actions → Send Lab Note → Run workflow**. Enter the note's slug.
2. Run it first with **preview**. One email goes to andrew@andrewedmond.com, with "[Preview]" in the subject. No approval is needed and no subscriber gets it.
3. When the preview looks right, run it again with **everyone**. The job waits until **Andrew approves it** in GitHub (the `lab-notes-email` environment). GitHub records who approved it and when.

Agents may start the workflow, but must never approve the `everyone` run. Only Andrew approves. Each subscriber gets each note at most once, however often the workflow runs. Nothing sends on a schedule.

## The privacy page

`content/pages/privacy.md` holds the privacy notice. Its body is Markdown. If the site starts collecting anything new, update it in the same change.
