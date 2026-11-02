#!/usr/bin/env bun
/**
 * 把 out/komyoji-xml/*.xml 打包成 komyoji.adb（成品放 D:\accelon3）。
 *
 *   bun run src/pack.ts
 *
 * 和 sz 的 cs.adb 一致：不建全文索引（fullTextIndex:false），
 * 正文只有 區／書／塊／段，定位靠 `塊.段:句`。
 */

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { authorAdb } from '../../adb-converter/ts/src/adbauthor';
import { MAXLINELEN } from '../../adb-converter/ts/src/index-builder';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';

const ROOT = join(import.meta.dir, '..');
const SRC = join(ROOT, 'out', 'komyoji-xml');
const DEST = 'D:\\accelon3\\komyoji.adb';

const readLines = (p: string): string[] => {
  const t = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const ls = t.split('\n');
  if (ls.length && ls[ls.length - 1] === '') ls.pop();
  return ls;
};

const canonOrder = (a: string, b: string) => {
  const rank = { '00': 0 };
  const ak = a.replace(/\d+$/, '');
  const bk = b.replace(/\d+$/, '');
  const order = ['dn', 'mn', 'sn', 'an', 'kn', 'kp', 'dhp', 'ud', 'iti', 'snp', 'thag', 'thig', 'ja', 'cp', 'bv', 'pv', 'vv', 'mil', 'cnd', 'ne', 'ps'];
  const ai = order.indexOf(ak);
  const bi = order.indexOf(bk);
  if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  return (Number(a.match(/\d+$/)?.[0] ?? 0) || 0) - (Number(b.match(/\d+$/)?.[0] ?? 0) || 0);
};

if (!existsSync(SRC)) {
  console.error(`沒有 ${SRC}（先跑 node src/make-xml.mjs）`);
  process.exit(2);
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const books = files.map((f) => f.slice(0, -4)).sort(canonOrder);
const lines: string[] = [];
for (const b of books) lines.push(...readLines(join(SRC, `${b}.xml`)));

const over = lines.map((l, i) => [i + 1, l.length] as const).filter(([, n]) => n * 2 > MAXLINELEN);
if (over.length) {
  console.error(`${over.length} 行超過 ${MAXLINELEN / 2} 字；例：${over.slice(0, 3).map(([i, n]) => `第 ${i} 行 ${n} 字`).join('、')}`);
  process.exit(1);
}

const t0 = Date.now();
const res = await authorAdb({
  dbname: 'komyoji',
  dbcname: '光明寺日譯',
  lines,
  fullTextIndex: false,
  log: (m) => console.log(`  ${m}`),
});
const buf = Buffer.from(res.file);
buf.writeUInt32LE(0, 100); // andtagid：新庫沒有 docdef
mkdirSync('D:\\accelon3', { recursive: true });
writeFileSync(DEST + '.new', buf);
renameSync(DEST + '.new', DEST);

const r = await AdbReader.open(new SyncIO(DEST));
const containers = [...r.containers.keys()].join(',');
const ok = r.header.lineCount === lines.length && !r.containers.has('tokens');
console.log(`komyoji  ${books.length} 書  ${lines.length} 行  ${(buf.length / 1048576).toFixed(2)} MiB  容器 ${containers}  ${ok ? '✓' : '✗ 行數不符'}`);
console.log(`→ ${DEST}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
