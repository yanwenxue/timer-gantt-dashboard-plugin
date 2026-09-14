import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const html=readFileSync('dist/index.html','utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^\"]+)"/g)) {
  if (!existsSync(resolve('dist',match[1]))) throw new Error(`Missing build resource: ${match[1]}`);
}
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all','--','dist'],{encoding:'utf8'});
if(dirty.trim()) {
  console.error('dist 与已提交产物不一致。请运行 npm run build 并提交最新 dist。');
  process.exitCode=1;
} else console.log('dist matches the committed build; all referenced assets exist.');
