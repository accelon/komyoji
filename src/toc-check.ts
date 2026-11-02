#!/usr/bin/env bun
/**
 * 檢查 komyoji.adb 的目錄樹（`<樹 t="區,書,塊.">`）建不建得起來。
 *
 *   bun run src/toc-check.ts
 *
 * 直接呼叫閱讀器的 loadTrees／loadTree／buildTree，不開瀏覽器。
 */

import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { VaPaMapper, parseAttrs } from '../../adb-converter/ts/src/accelon26/vapa';
import { loadTrees, loadTree, buildTree, flattenTree } from '../../adb-converter/ts/src/accelon26/search';

const FILE = 'D:/accelon3/komyoji.adb';
const reader = await AdbReader.open(new SyncIO(FILE));
const mapper = new VaPaMapper(reader);
await mapper.init();
const trees = await loadTrees(reader);
console.log(`=== komyoji.adb  行 ${reader.header.lineCount.toLocaleString('en-US')} ===`);
console.log(`容器：${[...reader.containers.keys()].join(',')}`);
for (const t of trees) console.log(`  <樹> s="${t.scope}" t="${t.tiers.join(',')}"`);

if (!trees.length) {
  console.log('  ✗ 沒有 <樹> 宣告');
  process.exit(1);
}
const tree = trees.find((t) => t.tiers.length) ?? trees[0];
const instances = await loadTree(reader, tree, {
  attrsAt: async (va) => {
    const el = await mapper.elementAt(va);
    return el ? parseAttrs(el.element.text) : {};
  },
  label: (va, vaEnd) => mapper.nodeLabel(va, vaEnd),
});
const roots = buildTree(instances);
const flat = flattenTree(roots, () => true).map((f) => f.node);
const byDepth = new Map<number, number>();
for (const n of flat) byDepth.set(n.depth, (byDepth.get(n.depth) ?? 0) + 1);
console.log(`  節點 ${flat.length}（${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, c]) => `L${d + 1}=${c}`).join(' ')}）`);
console.log(`  根：${roots.map((r) => r.label || '(無名)').join('、')}`);
for (const r of roots.slice(0, 2)) {
  const kids = r.children.slice(0, 3).map((k) => `${k.label || '(無名)'}(${k.children.length})`);
  console.log(`  ${r.label} → ${kids.join('、')}`);
}
const unnamed = flat.filter((n) => !n.label).length;
console.log(`  沒有名字的節點：${unnamed}`);
