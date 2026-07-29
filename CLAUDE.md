# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# curious-words

A personal quote collection served at `https://quotes.sherman.industries`. React +
Vite single-page app, static files in an S3 website bucket, deployed by Terraform
from GitHub Actions. No backend, no database, no auth.

The app is intentionally small — a heading, a search box, and a list. Prefer
keeping it that way. Reach for plain React and one stylesheet before adding a
router, a state library, or a component framework.

## Deploy model — read this before touching terraform/ or the workflow

`terraform/main.tf` declares one `aws_s3_object` per file via
`fileset("../dist/", "**/*.*")`. The set of managed resources is therefore
computed by scanning local disk, and `dist/` is gitignored build output.

**Consequence: applying from a tree that has not been built deletes the live
site.** Terraform sees an empty `dist/`, concludes every object was removed from
config, and destroys them. Nothing warns you — the apply succeeds.

Two things keep that from happening, and both must stay:

1. **Applies happen only in CI.** Never run `terraform apply` locally. `fmt`,
   `validate`, and `plan` are fine.
2. **Build and apply share one job in `ci.yml`.** GitHub re-runs at job
   granularity, so there is no way to replay the apply without replaying the
   build that feeds it. If this is ever split into plan/apply jobs, the apply job
   must rebuild or receive `dist/` as an artifact.

Apply is gated on `if: github.event_name == 'push'`. Do not remove that guard —
without it, a pull request deploys.

Pull requests build the app and run `terraform fmt -check` plus
`terraform validate -backend=false`. That path deliberately never receives AWS
credentials, which is also what lets PRs from forks work on a public repo. The
tradeoff is that validate cannot see remote state, so it catches schema errors
but not drift.

The build runs *before* the AWS credentials step. A broken build should fail on a
runner that never held deploy keys. Keep that order.

## Bucket name is not free choice

The bucket is named `quotes.sherman.industries` because an S3 website endpoint is
only reachable by CNAME when the bucket is named for the host pointing at it.
Renaming the bucket breaks DNS; renaming the site means creating a new bucket.

Cloudflare sits in front and terminates TLS. S3 website endpoints serve plain
HTTP only, so the zone's SSL mode must be Flexible — Full would fail, because
there is no certificate on the origin to validate. Terraform knows nothing about
the Cloudflare layer. A confusing deploy ("CI was green, the page is stale") is
more likely to be Cloudflare caching than Terraform.

Measured 2026-07-26, and it splits by file type rather than uniformly:

| Path | Behaviour |
|---|---|
| `/` and `/quotes.json` | `cf-cache-status: DYNAMIC` — not edge-cached |
| `/assets/*.js`, `*.css` | Cached, `max-age=14400` (4 h) |
| `/CuriousJC.jpg` and other `public/` files | Cached, `max-age=14400` |

Two consequences. **Adding a quote is visible immediately** — `quotes.json` is not
cached, so the edit-and-push loop works. And **hashed assets caching is harmless**
because a rebuild changes the filename, so an old URL going stale is impossible.

The exception is `public/` files, which keep their names. Replacing the favicon
means up to 4 hours of the old one at the edge, plus browser cache. That is the
cost of the stable URL, not a bug.

Nothing in this repo sets those TTLs — they are Cloudflare defaults, driven by
file extension. A "Cache Everything" page rule would start caching
`quotes.json` too, and quote edits would silently stop appearing.

## State

Backend is the shared `curiousjc-tf-state` bucket, key `curiousjc/curious-words`.
Other stacks live in the same bucket under different keys — scope any IAM policy
to this key, not to the bucket, or this repo's CI can write another stack's state.

No DynamoDB lock table is configured. With one operator and CI-only applies there
is no concurrent writer; add `dynamodb_table` before that stops being true.

## Layout

| Path | What it is |
|---|---|
| `public/quotes.json` | The collection. The only file you edit to add a quote. |
| `public/CuriousJC.jpg` | Favicon, and the README credit image. One copy serving both. |
| `src/App.jsx` | Fetch, normalise, filter, render. The whole app. |
| `src/quotes.css` | The only stylesheet. Follows OS dark mode, no toggle. |
| `terraform/` | Bucket, public-read policy, website config, per-file upload. |
| `dist/` | Vite build output. Gitignored, produced by CI. |

## Adding an image

Two mechanisms, and the choice is about whether the URL needs to be stable.

**`public/`** — copied to `dist/` byte for byte, keeping its name. Reference it by
absolute path (`/CuriousJC.jpg`). Use this when something outside your control
needs a predictable URL: favicons, `robots.txt`, anything linked from elsewhere.
The cost is no cache busting — an edited file keeps its name, so browsers may
serve a stale copy.

**`import` from `src/`** — Vite hashes the filename by content, rewrites the
reference to match, and inlines anything under 4 kB as a data URI. Use this for
images the page renders. Cache busting is automatic, because changed content
means a changed filename.

Do not put images in a bare directory at the repo root expecting them to deploy.
Only `public/`, and whatever `src/` imports, become part of `dist/`.

## The collection

726 quotes, imported from a twenty-year archive of Access databases, Word
documents and CSV exports living in `.old-quotes/` (gitignored, 12 MB).

`scripts/import-quotes.js` is the record of that transformation. **It is
provenance, not a build step.** Nothing in CI runs it, and re-running it would
discard every quote added by hand since the import. `public/quotes.json` is
hand-maintained from here.

Two things that script knows which are painful to rediscover:

- **The archive is Windows-1252.** Read as UTF-8, 46 apostrophes and en dashes
  silently become U+FFFD, and the damage only shows up on the page.
- **The export is denormalised** — one row per quote per subject, 1,334 rows for
  726 quotes. Collapsing on text+author+source was safe *for this data* because
  no text in it carried two different attributions. That is not a general rule;
  see the dedup note under Conventions.

### Tag vocabulary

Subjects became lowercase readable tags: `Intelligence&Foolishness` →
`intelligence & foolishness`. On top of the subject tags:

- `paired` — any quote whose subject was one of the 13 two-part subjects (446).
- `polarity` — the subset whose halves are genuine opposites (317).

The 9 subjects treated as polarities are listed in `POLARITY` at the top of the
import script. `Beauty&Perfection`, `Duty&Honor`, `Understanding&Virtue` and
`Emotion&Thought` are deliberately excluded — complementary ideas, not poles.

37 quotes have no tags at all: their only subject was the literal string `NULL`,
a database export artifact rather than a category.

Tags render under each quote as buttons; clicking one filters. Active tags AND
together, so `polarity` then `life` narrows to 65.

**Tag filtering is exact membership, deliberately not a `haystack` substring
match.** Typing `evil & good` into the search box returns 20 quotes; only 19
carry the tag, the extra being a quote that merely contains those three words.
Routing tag clicks through the search box would bake that error in. The two
filters compose — a tag filter and a text query narrow together.

## Known gaps

Open as of 2026-07-26, roughly in the order they are worth picking up.

### The collection

- **Visual review of the tag UI has not happened.** Tags shipped verified by logic
  and build only — nobody has looked at the rendered page. Specifically unknown:
  whether the dashed-and-dimmed treatment of `paired`/`polarity` reads as
  subordinate or as broken, and how a quote with four tags wraps on a phone.
- **No tag index.** All 28 subjects exist but are only discoverable by spotting
  one on a quote and clicking it. A list with counts, at the top or behind a
  toggle, would make the collection browsable rather than only searchable.
- **Long quotes have no treatment.** 8 exceed 1,000 characters and 33 exceed 500,
  against a median of 91. The longest is 4,885 (the Gemmell passage under
  `fear & courage`) and renders as a wall of text. Wants clamping with
  expand-on-click.
- **~18 quotes were never imported** — `.old-quotes/quotestoadd.txt` and
  `.old-quotes/QuotesFromPartner.txt`, in three inconsistent attribution formats.
  They need parsing or hand entry.
- **The legacy `.mdb`, `.sdf` and `.doc` files were never checked** for quotes
  missing from the main export. Unknown whether 726 is the whole collection.

### Site

- **The favicon is a 1024×1024 JPEG, 141 kB** — larger than the JS bundle, to
  render at 16–32 px. A 64×64 export would be ~2–4 kB. Note that replacing it
  means up to 4 hours of the old one at the Cloudflare edge, since `public/`
  files keep stable names.
- **No `.gitattributes`**, so git warns about LF→CRLF on every add. Cosmetic.

### Infrastructure — outside this repo

- **The CI identity's scope has never been verified.** The first run succeeding
  proves the permissions are *sufficient*, not *minimal*. If the policy grants
  `curiousjc-tf-state/*` rather than just `curiousjc/curious-words`, this repo's
  CI can write another stack's state and destroy it.
- **OIDC instead of long-lived keys.** Would remove standing AWS credentials from
  GitHub entirely and scope access by repo and branch. Roughly a two-line change
  here plus a one-time identity provider in the account.
- **`curiousjc-shared-infra` runs `terraform apply` on `pull_request`** — it has
  no `if: github.event_name == 'push'` guard. Different repo, but the same
  pattern this one deliberately guards against.
- **The state bucket name is published** in `terraform/providers.tf`. Unavoidable
  with committed backend config; a partial backend plus `-backend-config` from CI
  secrets would hide it, at the cost of more moving parts.
- **No DynamoDB state locking.** Fine while applies are CI-only and single-writer;
  add `dynamodb_table` before that stops being true.

## Common tasks

**Adding a quote:** edit `public/quotes.json` and push. Only `text` is required;
a bare string works. Vite copies `public/` into `dist/` on build, so the data
reaches the bucket via the build rather than independently — which is fine
because CI rebuilds on every push.

**Working on the app:** `npm install && npm run dev`, then
`http://localhost:5173`. `base` is left at its default `/` because the app is
served from the domain root, so the bare localhost root works.

`package-lock.json` is committed and CI runs `npm ci`, so the pipeline installs
exactly what is pinned. If you change dependencies, commit the updated lockfile or
CI fails — that failure is the point.

**Terraform provider lock:** `.terraform.lock.hcl` carries `h1:` hashes for both
`windows_amd64` and `linux_amd64`, because development happens on Windows and CI
runs on Linux. If you bump the provider, run
`terraform providers lock -platform=windows_amd64 -platform=linux_amd64` rather
than plain `init`, or the Linux hash goes missing.

## Conventions

Comments explain *why*, and say what breaks if someone "fixes" the thing being
described. Both `ci.yml` and `terraform/main.tf` lead with a warning rather than a
description. Match that.

**The quote list is never deduplicated.** The same line legitimately appears more
than once with different attributions — misquotation and disputed sourcing are
part of the point. Rows are keyed on position in the source file for exactly this
reason. Do not key on text, and do not add a dedupe pass.

Public read is granted by bucket policy, not object ACLs. Do not add
`acl = "public-read"` to `aws_s3_object` or reintroduce
`aws_s3_bucket_ownership_controls`; the AWS provider is pinned to `~> 5.0`, where
the policy form is the idiomatic one.

`error_document` points at `index.html` on purpose, so client-side routes resolve
if they are ever added. The cost is that genuine 404s return status 404 with the
app's HTML in the body.

## Environment

- Windows. The Bash tool is Git Bash (POSIX `sh`), not cmd or PowerShell.
- Terraform 1.5.7 locally; CI installs `^1.3.7`.

`gh` CLI is installed and authenticated as `CuriousJC` (scopes: `repo`,
`workflow`), so Actions runs are readable directly:

```
gh run list -R CuriousJC/curious-words
gh run view <id> --log-failed
```

**If `gh` appears to be missing, it is a stale environment, not a missing
install.** `C:\Program Files\GitHub CLI\` is in the persisted *machine* PATH, but
an editor launched before that entry existed passes its older environment to
every shell it spawns. `command -v gh` then returns nothing and the obvious
conclusion is wrong. Check `[Environment]::GetEnvironmentVariable("Path","Machine")`
before believing it, and call the full path meanwhile:

```
& "C:\Program Files\GitHub CLI\gh.exe" run list -R CuriousJC/curious-words
```

Restarting the editor fixes it properly.
