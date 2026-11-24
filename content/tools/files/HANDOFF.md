# HANDOFF: organise your digital life with Claude Code

From Andrew Edmond's Lab Notes: andrewedmond.com/notes/. Free to use and adapt. It's a method, not a product: you stay responsible for your own backups and for what you approve.

## For the person: how to use this

1. Put this file in an empty folder on your Mac, for example `~/organise/`.
2. Open Claude Code in that folder and say: "Read HANDOFF.md and follow it. Start with step 0."
3. Expect it to take days, not minutes. Most of the time goes into copying, checking and waiting for cloud services.
4. You stay in charge. Claude proposes and you approve. Nothing is permanently deleted unless you do it yourself.

You need a Mac, Claude Code, and enough free disk space, or an external drive, to hold a working copy of what you're organising. It helps to install `rclone` (for iCloud and Google Drive), `exiftool`, `poppler` and `tesseract` (for reading documents), and `ffmpeg` (for video frames). Claude will tell you which ones it needs before it starts.

---

## For Claude: your brief

You are helping one person turn years of scattered files, drives, cloud storage, email and photos into one organised, searchable set that stays tidy. Read the whole file before doing anything. The rules come first and override everything below them.

## Rules (non-negotiable)

1. **Back up before anything moves.** Before the first move in any area, confirm there is a full, current backup of that area: Time Machine, a copy on an external drive, a Google Takeout, or similar. If there isn't one, help the person make one and verify it before going on.
2. **You never permanently delete anything.** Deletes go to the Mac's Trash, iCloud's Recently Deleted, Google Drive's trash or Gmail's Trash. The person empties them, not you. If a tool's only delete is permanent, don't use it; stage the files in a review folder instead.
3. **Journal every move.** Each move or rename gets a line in a journal (a TSV with source, destination, kind, date), written as you go, so any single move can be undone. Keep the journals in this working folder.
4. **Nothing moves without an approved plan.** Show a plan summarised by destination (how many items go where, plus anything you're unsure about), wait for a clear "yes", then act. Approval covers that plan only, not the next one.
5. **Duplicates are matched by fingerprint, never by name.** Two files are duplicates only if their SHA-256 hashes match. Same name and different contents means two files; keep both and give one a suffix. After acting, verify the result (counts, sizes, or a fresh hash check) and report it plainly, including failures.
6. **Ask before touching anything sensitive.** Ask the person which folders are off-limits (for example a work folder, someone else's files, or anything private), and exclude those paths from every scan, catalog and sweep.
7. **Report honestly.** If a step failed, was skipped or is only partly done, say so with the numbers.
8. **Credentials stay with the person.** Never ask for a password, app password or recovery code in chat. The person signs in to Apple, Google and rclone themselves. When the work is done, remind them to revoke any app password or token they created for it.

## Step 0: inventory and agree a shape

1. Ask the person where their files live: the Mac's Desktop, Documents and Downloads; iCloud Drive; Google Drive; external and old drives; old computers' backups; Gmail; the Photos library.
2. Measure each place: file count and total size. Use `rclone` for cloud listings (`rclone lsjson`, `rclone size`) rather than walking cloud-backed folders on disk (see "Lessons").
3. Propose **one** top-level home for everything worth keeping, with a small set of first-level folders by topic, for example:
   - `Personal/` with `Finance`, `Home`, `Health`, `Travel`, `Vehicles`, `Writing & Notes`
   - `Projects/<name>/` (work, ventures, side projects)
   - `Photos & Video/<year>/<YYYY-MM> <event>/`
   - `Code/` (one zip per project; see below)
   - `Mail/` (archives and exports)
4. Agree the shape with the person before filing anything. Keep it shallow: about three levels is enough. People find things by topic and year, not by deep trees.

## Step 1: old files and drives

The goal is one deduplicated copy of everything worth keeping, filed by topic.

1. **Copy, don't move.** Copy each source (an old drive, an old computer's backup) into a working area. On the same APFS volume, `cp -c -p` makes clones that take almost no extra space.
2. **Fingerprint everything.** Hash every file with SHA-256. Group identical hashes. Keep one copy per group, choosing the best path (the most descriptive folder and name).
3. **Map, then review.** Write a map (destination ← original path) for every distinct file. Classify by reading the content, not just the name:
   - PDFs: `pdftotext`; if there's little text, OCR with `pdftoppm` plus `tesseract`.
   - Word and RTF: `textutil`. Zips: `unzip -l`. Images: OCR, plus EXIF dates. Video: one frame with `ffmpeg`.
4. **Present low-value groups as decisions**, not deletions: old installers, caches, app support folders, system files, thumbnails. The person decides which groups to leave out.
5. **Code trees:** zip each project into one archive (`Code/<project>.zip`) instead of uploading thousands of small files. Cloud drives handle a few large files far better than hundreds of thousands of small ones. Leave out `node_modules`, virtual environments and build output, and check each zip opens before trashing its source tree.
6. **Never dump millions of loose files onto a cloud drive.** Archive first. If the person starts doing this themselves, stop them and explain why.
7. **Upload and verify.** Upload the organised result, then check it against the source (`rclone check --one-way --size-only` for iCloud, which has no hash rclone can use; hashes where the service supports them). Only after a clean check, and with the person's approval, move the old copies to the Trash.

## Step 2: iCloud Drive

1. Prefer server-side tools (`rclone` with an `icloud:` remote) for big listings and bulk uploads. Local moves inside iCloud Drive are fine for small changes. For moving a whole folder, a single Finder move is one operation and is much faster than many small ones.
2. Accented file names are stored differently on the Mac (NFD) and by rclone (NFC). Normalise both to NFC before comparing, or the same file looks like two.
3. iCloud never uploads a file or folder whose name ends in `.tmp`. Those exist only locally. List them separately and suggest renaming any worth keeping.
4. Sync can lag by minutes to hours. If a file seems missing, check icloud.com before assuming it is lost.
5. **Deleted folders can come back.** iCloud keeps deleted items on its servers until Recently Deleted expires or is emptied. A Mac re-syncing in the meantime can pull them back. After a large delete, let Recently Deleted expire (or let the person empty it) before resetting or re-enabling iCloud Drive on any Mac.
6. **Don't crawl iCloud's local folders.** Never run a recursive scan (`find`, `du`) over `~/Library/Mobile Documents`, and especially not its hidden `.Trash`. Reading a cloud-only item forces a download, and walking deleted trees can make the sync engine queue a fresh delete for each item. Use `rclone` listings instead.
7. If iCloud stops uploading, look at what the sync engine reports (`brctl status`, `fileproviderctl dump`) and check against the server with `rclone`. Don't judge from the local state alone. A sync engine that is working through a large backlog uses a lot of memory. Restarting it is the person's call.

## Step 3: Google Drive

1. List with `rclone` (a `drive:` remote) or the Drive API. Separate files the person **owns** from files **shared with them**. Only owned files are theirs to organise; shared files stay where they are.
2. Native Google Docs, Sheets and Slides have no fixed size and no file hash. Export them (to .docx, .xlsx or .pdf) when making a backup, and compare by export rather than by size.
3. Make a full backup first (Google Takeout or an `rclone copy`) and verify it. Keep the backup as its own folder in the organised set.
4. File owned content into the agreed shape, or move it to the organised set, using the same fingerprint and journal rules. Drive's trash empties itself after 30 days, so tell the person what is in it before then.

## Step 4: Gmail

Email is where irreversible mistakes are easiest. Go slowly.

1. **Export first.** Request a Google Takeout of the mailbox. When it arrives, verify it: unpack it, count messages per label in the mbox files, and spot-check a few old and recent messages. Store it in `Mail/`. Don't delete any mail until this check passes. A Takeout can hold things the mailbox no longer shows, such as old chat logs. Tell the person what you find.
2. **Work from a plan of searches.** Propose Gmail search queries (sender, label, age, size) for each group: newsletters, notifications, receipts to keep, and so on. Show sample messages and counts for each. The person approves query by query.
3. **The web interface deletes whole conversations.** Selecting a thread in Gmail and deleting it removes every message in that conversation, including replies you meant to keep. Prefer per-message actions through the API or IMAP, and check what a thread contains first.
4. **Verify every bulk action by searching again.** An IMAP `COPY` to Trash can report OK and still leave messages behind. After any bulk action, re-run the search and count what is left. Retry or report the difference.
5. Labels and filters are standing rules. Creating or changing them needs the person's approval, like any other change.

## Step 5: Photos

Photos is the easiest place to lose originals by accident. Treat the library as its own project and go slowly.

**Ground rules**

1. **Never write to the library directly.** Don't touch `Photos.sqlite` or anything inside the library package. Change things only through Photos itself: `osxphotos` album and metadata commands, or AppleScript. When you need to query the database, read a read-only copy.
2. **You remove nothing yourself.** Put proposed removals in an album named `To delete <date>`, and the person deletes from it.
3. **Work on one device at a time.** iCloud syncs every change, so the person shouldn't make bulk edits on their phone while a run is going.
4. **Test small first.** Run each change on about 20 items, show the result, then run the rest.

**Steps**

1. **Inventory.** Count items by year, by kind (photos, videos, screenshots, scans) and by album. Also count how many originals are stored on the Mac and how many are only in iCloud ("Optimize Mac Storage"). That decides what can be hashed or viewed, and how much disk the work needs. `osxphotos` needs Full Disk Access for the app running Claude. Granting it is the person's call.
2. **Find exact duplicates by fingerprint, without downloading.** `osxphotos` exposes Photos' own fingerprint for every item, including iCloud-only ones. Group by that fingerprint first. Then export a sample of matched pairs and confirm them with SHA-256. Hashing every original could mean downloading hundreds of gigabytes.
3. **Use the Duplicates album carefully.** It mixes exact copies with near-duplicates, such as burst shots taken in the same second, and re-saved versions. Review it set by set, never use "Merge All", and use it for true copies only. Near-duplicates are a separate step that the person reviews.
4. **Keep what the copies carry.** Before removing a copy, move its album memberships, keywords, favourite flag and title onto the photo you keep. Set aside for the person any group whose copies have different dates, or more than one edited copy.
5. **Write a plan file before any bulk removal.** List every item to keep and every item to remove, by its Photos ID, and save it in this folder. If a removal catches originals by mistake, the plan file is how you put them back and remove only the copies.
6. **Journal and verify.** Log every change (Photos ID, filename, action) next to the plan file. After filling the `To delete` album, check that it matches the plan exactly, with nothing missing and nothing extra, before the person deletes anything.
7. **Tell the person how to delete safely.** In an album, the Delete key only removes photos from that album, while Image → Delete (⌘⌫) sends them to Recently Deleted. To remove an album itself, right-click it and choose Delete Album; never select everything in it and delete. Don't create "sample of keepers" albums: deleting one the wrong way trashes the keepers. Anything deleted goes to Photos' Recently Deleted, which the person empties.
8. **Documents hiding in Photos.** Screenshots, receipts, scanned letters and whiteboards belong in the organised set. Apple's labels are too coarse for this: "Document" covers menus and whiteboards, and screenshots mix junk with important records. Plan a visual review with the person. Leave intimate or sensitive images out of scope unless they say otherwise. Export copies with a manifest, file them, and remove the originals from Photos only after the copies are confirmed filed.

**Gotchas**

- Scripted adds of about 100 items trigger a confirmation dialog. Use batches of about 25.
- `osxphotos` copies the database on every run, and Photos' write-ahead log can grow to tens of gigabytes. Watch free disk.
- AppleScript sets dates in the Mac's time zone.
- "Shared with You" items can't be added to albums.

## Step 6: the searchable catalog

The point of all this is that the person can find any file in seconds.

1. Build a small local database (SQLite is enough) of the organised set, with path, name, extension, top-level folder, size, modified date and whether it's a folder. Fill it from an `rclone` listing so the Mac doesn't have to download anything.
2. Add a full-text index of document contents for the person's own folders, built from the text you already extracted, so they can search by what a document says, not just its name.
3. Give the person one command, for example `find.py <words>`, that returns full paths. When they ask you "where is X?", answer with the full path.
4. Keep the catalog's exclusions in line with Rule 6. Off-limits folders are never indexed.

## Step 7: the weekly sweep, with approval

This keeps things tidy after the big clean-up.

1. **Schedule** a weekly job (a `launchd` agent) that runs in report-only mode. It inventories Desktop, Documents and Downloads, listing items older than a week. Skip anything modified in the last seven days, and skip git working trees.
2. **Classify** each item: FILE (with a destination), TRASH (installers, exact duplicates, clear junk), DUPLICATE (verified by hash against the organised copy) or UNCERTAIN (a question for the person).
3. **Report** by email or a page: a summary by destination, then the questions. Make the first runs dry runs that move nothing.
4. **Apply only on approval.** When the person replies "approve" (with any changes), move the items, write the journal, send a short "what moved where" note, and refresh the catalog.
5. **Use a review folder.** For anything that might be deleted, a "preview to delete" folder lets the person look before it goes to the Trash. Empty that folder only when they say so.
6. Make the sweep robust: a cloud-only file that can't be read right now should be listed as "unreadable now", not crash the run.

## Lessons, in short

- Hash before you trust a name.
- Verify against the server, not the local copy.
- Zip code trees, one zip per project.
- Big cloud jobs fail in small, random ways (timeouts, dropped sessions). Retry, re-list, and make every step safe to run again.
- Watch memory and disk during big jobs. Run them at low priority, and keep enough free space for the working copies.
- When something unexpected happens, stop, show the person what you see, and correct earlier conclusions out loud if the evidence changes.

## When you finish each step

Tell the person, in plain language: what moved, what is waiting for them (Trash to empty, questions to answer), what you verified, and what is next. Keep a short `STATUS.md` and a `NOTES.md` of decisions and lessons in this folder, so a later session can pick up where you left off.
