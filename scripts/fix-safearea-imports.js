// One-off codemod: fix the relative import depth for SafeAreaViewPlaceholder
// in every screen file, then report any stragglers. Safe to run twice (idempotent).
const fs = require('fs');
const { execSync } = require('child_process');

const files = execSync('grep -rln components/SafeAreaViewPlaceholder app --include=*.tsx', {
  shell: 'C:/Program Files/Git/bin/bash.exe',
})
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

let fixed = 0;
for (const f of files) {
  // e.g. "app/(main)/(tabs)/index.tsx" -> dirs below root: app,(main),(tabs)
  // = 3 -> ../../../ ; "app/(auth)/login.tsx" -> 2 -> ../../
  const parts = f.split('/');
  const dirDepth = parts.length - 1; // every segment except the filename
  const rel = '../'.repeat(dirDepth) + 'components/SafeAreaViewPlaceholder';
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  s = s.replace(/from '(\.\.\/)+components\/SafeAreaViewPlaceholder';/, `from '${rel}';`);
  if (s !== before) fixed++;
  fs.writeFileSync(f, s);
}
console.log(`checked ${files.length} files, rewrote ${fixed} imports`);
