// Visitor counts for the owner: Vercel Web Analytics (page views and visitors,
// no cookies, nothing personal), shown in the Vercel dashboard under Analytics.
//
// Only where Vercel serves the game (triad.church, which the Windows app loads
// too, and the project's vercel.app addresses): its counter lives on that
// host. The artifact cannot reach outside servers, and the GitHub Pages copy
// and the dev server have no counter to send to.

import { inArtifact } from './artifact';

function onVercel(): boolean {
  const h = location.hostname;
  return h === 'triad.church' || h.endsWith('.triad.church') || h.endsWith('.vercel.app');
}

export function startAnalytics(): void {
  if (inArtifact() || !onVercel()) return;
  // (fetched on its own, off the game's start-up path; never in the game's way)
  void import('@vercel/analytics')
    .then(({ inject }) => inject({ mode: 'production' }))
    .catch(() => undefined);
}
