// Writes CHANGELOG.md from the release notes in src/version.ts (npm run changelog).
// Node 22 loads the TypeScript file directly.

import { writeFileSync } from 'node:fs';
import { RELEASES } from '../src/version.ts';

const GAMES = [
  ['air', 'Air Combat'],
  ['space', 'Space Exploration'],
];
const TAG = { new: 'New', better: 'Improved', fix: 'Fixed' };

let md = `# Changelog

Every update gets a version number and notes here. The game shows the same
notes under **NOTES** in each menu: the air combat menu lists the air combat
updates and the space menu lists the space updates.
`;
for (const r of RELEASES) {
  md += `\n## v${r.version} (${r.date})\n`;
  for (const [g, name] of GAMES) {
    const n = r[g];
    if (!n) continue;
    md += `\n### ${name}: ${n.title}\n\n`;
    for (const note of n.notes) {
      if (typeof note === 'string') {
        md += `- ${note}\n`;
        continue;
      }
      md += `- **${note.k ? TAG[note.k] + ': ' : ''}${note.h}**\n`;
      for (const d of note.d ?? []) md += `  - ${d}\n`;
    }
  }
}
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), md);
console.log(`CHANGELOG.md: ${RELEASES.length} releases`);
