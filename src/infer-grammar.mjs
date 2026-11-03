/**
 * 查一句巴利文的逐詞文法：
 *   ① 這一句在光明寺資料裡 → 直接給人工標注（source=human）
 *   ② 不在 → 用人工資料的詞形統計推算（source=推定），並附信心值
 *
 * 用法：
 *   node src/infer-grammar.mjs --text "rūpaṃ, bhikkhave, aniccaṃ"
 *   node src/infer-grammar.mjs --addr vb.1.1          # 從 cs 的 塊.段 取句子
 *   node src/infer-grammar.mjs --file sentences.txt   # 一行一句
 *
 * 產出：TSV 到 stdout。有推定值時，最後會提醒「此為計算推定，非人工標注」。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const G = path.resolve(arg('grammar', 'out/grammar'));
const CSDIR = arg('cs', 'D:/2026/sz/data/cs');

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const stripLabel = (s) => s.replace(/^\s*\d+(?:\s*[-–]\s*\d+)?\s*\.\s*/, '');

/* ---------- ① 人工資料：句子 → 單元 ---------- */
const units = new Map(); // 正規化全文 → 單元
const byHead = new Map(); // 前 40 字 → [單元]
{
  const nd = zlib.gunzipSync(fs.readFileSync(path.join(G, 'units.ndjson.gz'))).toString('utf8');
  for (const line of nd.split('\n')) {
    if (!line) continue;
    const u = JSON.parse(line);
    const key = norm(stripLabel(u.pali));
    if (!key) continue;
    u._k = key;
    if (!units.has(key)) units.set(key, u);
    const h = key.slice(0, 40);
    if (h.length === 40) {
      if (!byHead.has(h)) byHead.set(h, []);
      byHead.get(h).push(u);
    }
  }
}

/** 一句裡找人工單元：滑動視窗比對（cs 的段可能前面帶「(小節名)」之類） */
const findHuman = (sentence) => {
  const s = norm(stripLabel(sentence));
  if (!s) return null;
  const exact = units.get(s);
  if (exact) return exact;
  for (let i = 0; i + 40 <= s.length; i += 5) {
    const cands = byHead.get(s.slice(i, i + 40));
    if (!cands) continue;
    for (const u of cands) {
      if (s.startsWith(u._k, i) || u._k.startsWith(s.slice(i))) return u;
    }
  }
  return null;
};

/* ---------- ② 詞形統計（推算用） ---------- */
const wordIdx = new Map(); // form_clean → Map(analysis → count)
{
  const tk = zlib.gunzipSync(fs.readFileSync(path.join(G, 'tokens.tsv.gz'))).toString('utf8').split('\n');
  const H = tk[0].split('\t');
  const i = (n) => H.indexOf(n);
  for (const l of tk.slice(1)) {
    if (!l) continue;
    const c = l.split('\t');
    const w = c[i('form_clean')];
    if (!w) continue;
    const key = [c[i('pos')], c[i('stem')], c[i('gender')], c[i('number')], c[i('case')], c[i('person')], c[i('voice')], c[i('meaning')]].join('\t');
    if (!wordIdx.has(w)) wordIdx.set(w, new Map());
    const m = wordIdx.get(w);
    m.set(key, (m.get(key) || 0) + 1);
  }
}

const tokenize = (s) => s.replace(/[‘’“”"'.,;:!?()[\]{}…–—]/g, ' ').split(/\s+/).filter(Boolean);

const humanRows = (u) => {
  const rows = [];
  for (const b of u.blocks) {
    for (const r of b.rows) {
      if (b.kind === 'nom') rows.push([r[0], r[1], r[2], r[3], r[4], r[5], r[6], '', '', r[7]]);
      else rows.push([r[0], r[1], r[2], r[3], '', r[5], '', r[6], r[4], r[7]]);
    }
  }
  return rows;
};

const inferRows = (sentence) => {
  const rows = [];
  let low = 0;
  for (const w of tokenize(sentence)) {
    const clean = norm(w);
    const m = wordIdx.get(clean);
    if (!m) {
      rows.push([w, '', '', '', '', '', '', '', '', '', '推定', '0.00', '詞形未見於人工資料']);
      low++;
      continue;
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [bestKey, bestCount] = [...m].sort((a, b) => b[1] - a[1])[0];
    const share = bestCount / total;
    const [pos, stem, gender, number, cse, person, voice, meaning] = bestKey.split('\t');
    const note = share >= 0.6 ? `n=${total}` : `n=${total}，分析不唯一`;
    if (share < 0.6) low++;
    rows.push([w, '', pos, stem, gender, number, cse, person, voice, meaning, '推定', share.toFixed(2), note]);
  }
  return { rows, low };
};

const CS_BOOKS = [
  'dn1', 'dn2', 'dn3', 'mn1', 'mn2', 'mn3', 'sn1', 'sn2', 'sn3', 'sn4', 'sn5',
  'an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11',
  'kp', 'dhp', 'ud', 'iti', 'snp', 'thag', 'thig', 'ja1', 'ja2', 'cp', 'bv', 'pv', 'vv', 'mil', 'cnd', 'ne', 'ps',
];

/** addr：`塊.段`（例 d1.28），塊 id 只出現在某一本書裡；先找常用書，再掃全部 */
const readCs = (addr) => {
  const [chunk, seg] = addr.split('.');
  const files = CS_BOOKS.map((b) => path.join(CSDIR, b + '.xml'));
  if (fs.existsSync(CSDIR)) {
    for (const f of fs.readdirSync(CSDIR).filter((x) => x.endsWith('.xml'))) files.push(path.join(CSDIR, f));
  }
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    const xml = fs.readFileSync(f, 'utf8');
    if (!xml.includes(`<塊 id="${chunk}"`)) continue;
    let blk = null;
    let sg = null;
    const out = [];
    for (const raw of xml.split('\n')) {
      const bm = raw.match(/<塊 id="([^"]+)"[^>]*>/);
      if (bm) blk = bm[1];
      const sm = raw.match(/<段 n="([^"]+)"\/>/);
      if (sm) sg = sm[1];
      const plain = raw.replace(/<[^>]+>/g, '').trim();
      if (plain && blk === chunk && sg === seg) out.push(plain);
    }
    if (out.length) return out.join(' ');
  }
  return null;
};

const sentences = [];
const t = arg('text', '');
if (t) sentences.push(t);
const csAddr = arg('addr', '');
if (csAddr) {
  const s = readCs(csAddr);
  if (!s) {
    console.error(`cs 找不到 ${csAddr}`);
    process.exit(2);
  }
  sentences.push(s);
}
const file = arg('file', '');
if (file) for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l.trim()) sentences.push(l.trim());

if (!sentences.length) {
  console.error('用法：--text "…" 或 --addr book.block.seg 或 --file sentences.txt');
  process.exit(2);
}

const HEAD = 'idx\tword\troot\tpos\tstem\tgender\tnumber\tcase\tperson\tvoice\tmeaning\tsource\tconf\tnode';
console.log(HEAD);
let inferred = 0;
for (const s of sentences) {
  const u = findHuman(s);
  console.log(`# ${s}`);
  if (u) {
    humanRows(u).forEach((r, i) => console.log([i + 1, ...r, 'human', '1.00', u.id].join('\t')));
  } else {
    const { rows, low } = inferRows(s);
    rows.forEach((r, i) => console.log([i + 1, ...r].join('\t')));
    inferred += rows.length;
    if (low) console.log(`# ↑ 這句有 ${low} 個詞的分析不唯一或未見於人工資料`);
  }
}
if (inferred) {
  console.log('');
  console.log(`※ 本輸出含 ${inferred} 個「計算推定」值（source=推定），不是人工標注。`);
}
