# TRIAD: notes for Claude

## Shipping: every game change goes to both places

What the owner calls them: **"the website"** is triad.church (GitHub Pages, and the
Windows app that loads it); **"the artifact"** is the claude.ai artifact below.
"Update both" means ship the change to both.

The game is one codebase with two homes, and every change ships to both:

1. **The website** (triad.church, GitHub Pages; the Windows app loads it).
   Commit, then push `main` and the release branch `claude/bold-darwin-occlgg`.
   `.github/workflows/deploy.yml` builds and deploys it on the branch push.
2. **The claude.ai artifact**: https://claude.ai/artifact/QSftNhcw3JkQfNKzsLVaHM
   - `npm run build:artifact` builds `dist-artifact/index.html` and checks it
     (no Supabase settings or tokens, under 16 MB, nothing Claude Code mistakes
     for a PR-review page).
   - Publish that file to the URL above (never to a new link) with these
     capabilities:
     `{"room": {}, "user": {}, "downloads": {}, "db": {"rules": [{"path": "ranked", "read": "view", "write": "owner"}, {"path": "ranked/{self}", "write": "interact"}]}}`

A change is not shipped until both are updated. Before shipping: `npx tsc --noEmit`
and `npm test`.

## Release notes with every update

Every update the player can see gets a new version with release notes, so the
"What's new" panel opens by itself in the menu the next time players come in
(`showIfNew()` in `src/ui/menu/whatsNew.ts` opens it when the newest version is
one they haven't seen). Small fixes included (model shape fixes too).

- Add the release at the top of `RELEASES` in `src/version.ts`, under the game
  it belongs to (`air`, `space` or `ocean`), with added()/improved()/fixed().
- Bump `package.json` and the "Current version" line in README.md to match, and
  run `npm run changelog`.

## One game, two runtimes

The artifact cannot reach outside servers. Code that needs one checks
`inArtifact()` (`src/net/artifact.ts`) and either uses the artifact's built-in
equivalent or degrades gracefully:

| Feature | Website / Windows app | Artifact |
| --- | --- | --- |
| Multiplayer | game servers (Render, `server/`) | the page's live room |
| Ranked leaderboard | Supabase (`src/net/cloud.ts`) | the artifact's database |
| Accounts, cloud saves | Supabase email sign-in | none (saved in the browser) |

New features must work in both, or switch themselves off cleanly in one.

## Don'ts

- Don't remove features or player data without asking.
- Don't put secrets in the game: only `VITE_` variables reach the build, and
  the Supabase publishable key is the only one that belongs there. `.env` is
  local and git-ignored.
