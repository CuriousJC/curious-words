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
| `src/App.jsx` | Fetch, normalise, filter, render. The whole app. |
| `src/quotes.css` | The only stylesheet. Follows OS dark mode, no toggle. |
| `terraform/` | Bucket, public-read policy, website config, per-file upload. |
| `dist/` | Vite build output. Gitignored, produced by CI. |
| `static/CuriousJC.jpg` | README credit image. Not part of the deployed site. |

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
- `gh` CLI is **not** installed here. Use the GitHub web UI or the API directly to
  read Actions runs.
- Terraform 1.5.7 locally; CI installs `^1.3.7`.
