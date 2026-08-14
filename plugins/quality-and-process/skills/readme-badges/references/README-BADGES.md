<!-- Generated copy of docs/guides/README-BADGES.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# README badges

How a repository's README announces its status at a glance: which badges to
show, where they go, which badge services to use for what, and the rules that
keep a badge row honest. Extracted from the badge block
`AureliusPromptus.Web.Portal/README.md` has carried since the AureliusMundus
days; adopted verbatim (owner/repo swapped) by `bayesian-inference`.

## Why badges at all

A badge is a one-glance answer to a question a visitor would otherwise have to
click around for: is this licensed, is it maintained, is CI green, is there a
live deployment. Most badge images are *live queries* — the badge service
fetches the repo's real state at render time — which is exactly what makes
them worth having and exactly what makes a wrong one damaging: a broken or
stale badge tells the visitor the repo is unmaintained more loudly than no
badge would. Every rule below exists to keep the row truthful.

## The two zones

Badges live in exactly two places in a README:

1. **The header row** — immediately after the H1, before the first paragraph.
   Repo metadata and status: who to ask, license, maintenance, activity
   counts, CI, deployment. This is the "state of the repo" dashboard.
2. **The footer block** — near the end of the README, after the substantive
   content. Social and support: sponsorship, follow links, star history.
   This zone is optional and meant for public/showcase repositories; an
   internal repo carries only the header row.

Nothing badge-shaped goes anywhere else. A badge in the middle of prose is
decoration, not information.

The header anchor pattern from the worked example — put `<a
name="readme-top"></a>` above the H1, and end long READMEs' major sections
with `<p align="right">(<a href="#readme-top">back to top</a>)</p>` — is
recommended for READMEs long enough to scroll.

## The three badge families and when each is used

| Family | Style | Used for |
|---|---|---|
| [badgen.net](https://badgen.net) flat | `flat.badgen.net/...?icon=github&color=black&scale=1.01` | The header metadata row — uniform flat black with the GitHub icon |
| [shields.io](https://shields.io) | `style=for-the-badge` (brand logo + brand color) | Brand-identified badges: deployment target (Vercel, Fly.io), Buy Me a Coffee |
| [shields.io](https://shields.io) | `style=social` | The follow/tweet/subscribe footer block |
| GitHub native | `<repo>/actions/workflows/<file>/badge.svg` | CI status — first-party, always current, never rate-limited by a third party |

One style per zone. The header metadata row is all badgen flat black — a
mixed row of flat, for-the-badge, and social styles reads as noise. The only
non-badgen members of the header row are the GitHub-native CI badge and (when
one exists) the single brand-styled deployment badge, both of which earn the
exception by reporting live state no badgen badge can.

## The standard header row

In order, with `OWNER/REPO` substituted (all of these render from the
house query string `?icon=github&color=black&scale=1.01`):

| Badge | Image URL | Links to |
|---|---|---|
| Ask Me Anything | `https://flat.badgen.net/static/Ask%20me/anything` | The owner's GitHub profile |
| License | `https://flat.badgen.net/github/license/OWNER/REPO` | The repo's license file |
| Maintained | `https://flat.badgen.net/static/Maintained/yes` | The default branch's commit history |
| Branches | `https://flat.badgen.net/github/branches/OWNER/REPO` | `/branches` |
| Commits | `https://flat.badgen.net/github/commits/OWNER/REPO` | `/commits` |
| Issues | `https://flat.badgen.net/github/issues/OWNER/REPO` | `/issues` |
| Pull requests | `https://flat.badgen.net/github/prs/OWNER/REPO` | `/pulls` |

Then, where they apply:

- **CI** — `https://github.com/OWNER/REPO/actions/workflows/<workflow>.yml/badge.svg`,
  linking to the workflow's runs page. One badge per workflow that gates
  merges; don't badge cron or cleanup workflows.
- **Deployment** — one shields.io `for-the-badge` badge in the platform's
  brand colors (e.g. `Vercel-000000?style=for-the-badge&logo=vercel`),
  linking to the live URL. Only when the deployment actually exists and is
  public.

As markdown, each badge is a link with a hover title:

```markdown
[![GitHub license](https://flat.badgen.net/github/license/OWNER/REPO?icon=github&color=black&scale=1.01)](https://github.com/OWNER/REPO/blob/BRANCH/LICENSE "GitHub license")
```

## The footer block

For public/showcase repos, in this order, each under its own heading (match
the README's existing heading style — the worked example uses emoji-prefixed
headings like `## :coffee: Buy Me a Coffee`, but the emoji are that README's
idiom, not part of this standard):

1. **Buy Me a Coffee** — the branded shields.io badge sized via an `<img>`
   tag, linking to the sponsorship page:

   ```markdown
   [<img src="https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" width="200" />](https://www.buymeacoffee.com/OWNER "Buy me a Coffee")
   ```

2. **Follow** — the `style=social` set: GitHub followers, tweet-this-repo,
   YouTube subscribers. Include only the channels the owner actually runs.

3. **Star history** — the [star-history.com](https://star-history.com) chart
   as a theme-aware `<picture>` element, so it renders correctly in both
   GitHub color modes:

   ```markdown
   <a href="https://star-history.com/#OWNER/REPO&Timeline">
   <picture>
     <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=OWNER/REPO&type=Timeline&theme=dark" />
     <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=OWNER/REPO&type=Timeline" />
     <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=OWNER/REPO&type=Timeline" />
   </picture>
   </a>
   ```

## The rules

1. **Every badge is a link, and every link has a title.** A badge that goes
   nowhere is a picture; the `"hover title"` string doubles as the
   accessibility label. The alt text (the `![...]` part) names the badge, not
   the URL.
2. **Badges point at the repo they live in.** The single most common badge
   bug is copy-paste drift: the block gets copied from another repo and half
   the URLs still query the source repo, so the badges render *another
   project's* license, issues, and stars. When adopting the block, substitute
   `OWNER/REPO` in **both** the image URL and the link target of every badge,
   and the default-branch name in any `blob/`/`commits/` link.
3. **Don't badge what you don't have.** No coverage badge without coverage
   measurement, no deployment badge without a live deployment, no
   `Maintained/yes` on a repo that is archived or abandoned — flip it to
   `no`, or better, drop the row. A static badge (`static/...`) is a
   *promise*, not a measurement; it only belongs in the row while somebody
   stands behind it.
4. **One style per zone** (see above). Uniformity is what makes the row scan
   as a dashboard instead of a sticker sheet.
5. **The row is not a tech-stack list.** "Built with TypeScript" badges
   restate the repo's language chip and crowd out the badges that carry live
   information. Stack belongs in prose or a Tech Stack section.

## Worked examples

- `AureliusPromptus.Web.Portal/README.md` (AureliusPromptus) — the origin:
  full header row, Vercel deployment badge, and the complete footer block
  (Buy Me a Coffee, follow set, star history with theme-aware `<picture>`).
  Its badge URLs query `konradcinkusz/AureliusMundus` because that is the
  repo the README was born in — the reason rule 2 is written down.
- `README.md` (bayesian-inference) — the first adoption of this guide:
  header row plus the GitHub-native CI badge for its `build.yml`, and the
  footer block, all URLs substituted per rule 2.
