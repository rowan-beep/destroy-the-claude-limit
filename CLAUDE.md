# TRIAD: notes for Claude

## Shipping: only the website

**"The website"** is triad.church (and the Windows app, which loads it). Every
game change ships there and nowhere else:

- Before shipping: `npx tsc --noEmit` and `npm test`.
- Commit, then push `main` and the release branch `claude/bold-darwin-occlgg`.
- triad.church is built and served by **Vercel** from `vercel.json` (its
  `buildCommand` passes the build settings: the Supabase URL and publishable
  key, the multiplayer server). `.github/workflows/deploy.yml` also builds the
  GitHub Pages copy. A setting the game needs must be in both.
- After a push, check the live site (https://www.triad.church) shows the change.

**Leave the claude.ai artifact alone** (https://claude.ai/artifact/QSftNhcw3JkQfNKzsLVaHM):
the owner said not to update it any more. Don't build or publish it unless the
owner asks again.

## Release notes with every update

Every update the player can see gets a new version with release notes, so the
"What's new" panel opens by itself in the menu the next time players come in
(`showIfNew()` in `src/ui/menu/whatsNew.ts` opens it when the newest version is
one they haven't seen). Small fixes included (model shape fixes too).

- Add the release at the top of `RELEASES` in `src/version.ts`, under the game
  it belongs to (`air`, `space` or `ocean`), with added()/improved()/fixed().
- Bump `package.json` and the "Current version" line in README.md to match, and
  run `npm run changelog`.
- Notes about accounts or sign-in get `accounts: true`: they only show in a
  build that has the Supabase settings (so check the website build has them).

## One game, two runtimes

The artifact cannot reach outside servers. Code that needs one checks
`inArtifact()` (`src/net/artifact.ts`) and either uses the artifact's built-in
equivalent or degrades gracefully:

| Feature | Website / Windows app | Artifact |
| --- | --- | --- |
| Multiplayer | off since 7.12.0 (`multiplayerOn()`; owner's call) | the page's live room |
| Ranked leaderboard | Supabase (`src/net/cloud.ts`) | the artifact's database |
| Accounts, cloud saves | Supabase email + password | none (saved in the browser) |

New features must work in both, or switch themselves off cleanly in one.

## Don'ts

- Don't build anything that needs to send email (sign-in codes, confirmation or
  reset links): the project cannot send mail. Accounts are email + password and
  Supabase confirms them by itself.

- Don't remove features or player data without asking.
- Don't put secrets in the game: only `VITE_` variables reach the build, and
  the Supabase publishable key is the only one that belongs there. `.env` is
  local and git-ignored.
