# curious-words

A personal quotes collection — somewhere to keep the lines worth keeping, and to
search them without opening a text file and scrolling. 726 of them so far,
carried over from twenty years of Access databases, Word documents and CSV
exports.

Live at [quotes.sherman.industries](https://quotes.sherman.industries).

## What it is

A single-page React app, built with Vite, that fetches a JSON file at load and
filters it in the browser. Static files in an S3 bucket behind Cloudflare. No
server, no database, no login.

The property worth protecting is that **the data is separate from the code**.
Adding a quote means editing one JSON file — you never touch, read, or need to
understand the app to do it.

At the scale of a personal collection this is not a compromise. A few thousand
quotes is a file small enough to ship whole to the browser and filter on every
keystroke, which is why search is instant and works offline once loaded.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` writes to `dist/`. `npm run preview` serves that build locally.

## Adding a quote

Edit [`public/quotes.json`](public/quotes.json) and push. CI rebuilds and
deploys.

```json
{
  "text": "The limits of my language mean the limits of my world.",
  "author": "Ludwig Wittgenstein",
  "source": "Tractatus Logico-Philosophicus",
  "tags": ["language", "philosophy"]
}
```

Only `text` is required. A quote you remember without knowing who said it is
still worth keeping, so the app renders whatever fields are present and skips the
rest. A bare string works too.

Tags appear under each quote and filter when clicked; selecting several narrows
rather than widens. Alongside the subject tags there are two collective ones,
shown muted: `paired` for the thirteen two-part subjects, and `polarity` for the
nine whose halves are genuine opposites — `evil & good`, `fear & courage`,
`truth & falsity` and so on. Esc clears everything.

The list is never deduplicated. The same line legitimately appears more than once
with different attributions — misquotation and disputed sourcing are half the
interest — so entries are keyed on position in the file, not on their text.

JSON rather than YAML because the browser parses it natively; reading YAML in a
static app means shipping a parser to every visitor to load your own data.

## Deploying

Push to `main`. GitHub Actions builds the app and applies the Terraform in
[`terraform/`](terraform/), which uploads `dist/` to the bucket.

**Do not run `terraform apply` outside CI.** The set of objects Terraform manages
is derived by scanning `dist/` on disk, and `dist/` is gitignored build output —
so applying from a tree that has not been built reads as "delete everything" and
empties the live site. The workflow keeps the build and the apply in a single job
specifically so the two cannot be separated. There is more detail in the comments
at the top of [`ci.yml`](.github/workflows/ci.yml) and `terraform/main.tf`.

Pull requests build the app and validate the Terraform, but never receive AWS
credentials.

## License

GPL-3.0. See [LICENSE](LICENSE).

This is a personal tool built in the open. Copyleft is the deliberate choice:
anyone is welcome to take it, run it, and change it, and improvements they
distribute stay just as open as what they started from.

## Credit

curious-words by CuriousJC
![CuriousJC Image](/public/CuriousJC.jpg)
