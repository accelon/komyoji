/**
 * 從光明寺 html（Excel 匯出的 sheet001.htm）抽出「詞的 in-context 文法資訊」。
 *
 * 每個單元（句子或標題）長這樣：
 *   1-1.                                    ← 段號（句子才有）
 *   1. Evaṃ me sutaṃ –                      ← 巴利原文
 *   語|語根|品詞|語基|性|数|格|意味            ← 名詞／形容詞區塊的表頭
 *   Evaṃ| |不変|‐|‐|‐|‐|このように、かくの如き
 *   述語|語根|品詞|活用|態|数|人称|意味         ← 動詞區塊的表頭
 *   viharati|vi-hṛ|動|現|能|単|三|住する
 *   訳文
 *   私はこのように聞いた。                     ← 日譯
 *   メモ
 *   ...                                     ← 注
 *
 * 表頭之後偶爾夾一列 colspan 的句子（同一句在分頁處重貼），那是「區塊引文」，不是新單元。
 *
 * 注意：這些文法表是**人工剪貼**的，錯不少（詞對不上句子、欄位貼錯、重複列…）。
 * 本程式**只照實抽出、不改值**，可疑處記在 flag 欄，讓下游自己決定要不要用。
 *
 * 用法：
 *   node src/extract-grammar.mjs --dir data/html --out out/grammar [--limit N] [--only 字串]
 *
 * 產出（gzip TSV）：
 *   sentences.tsv.gz  sent_id / folder / chapter / unit / kind / label / pali / ja / memo
 *   tokens.tsv.gz     sent_id / tok / start / ctx / form / form_clean / root / pos / stem /
 *                     gender / number / case / person / voice / meaning / block / flags
 *   chapters.tsv      每章統計：單元／句／標題／詞／各種 flag 數
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const DIR = path.resolve(arg('dir', 'data/html'));
const OUT = path.resolve(arg('out', 'out/grammar'));
const LIMIT = Number(arg('limit', 0));
const ONLY = arg('only', '');
const DEBUG = Boolean(arg('debug', ''));

const ENT = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ndash: '–', mdash: '—', hellip: '…', middot: '·', times: '×',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  ntilde: 'ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Agrave: 'À', Egrave: 'È', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', omega: 'ω', deg: '°',
};

const decodeEnt = (s) =>
  s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const cp = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENT, g) ? ENT[g] : m;
  });

/** 去標籤：ruby/rt 先處理（保留本體），再解實體 */
const cellText = (html) => {
  let s = html.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEnt(s);
  s = s.replace(/[\u3000\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
};

const isBlank = (s) => s === '' || s === ' ' || s === '　';

const HEADER_NOM = ['語', '語根', '品詞', '語基', '性', '数', '格', '意味'];
const HEADER_PRED = ['述語', '語根', '品詞', '活用', '態', '数', '人称', '意味'];

/** 把一列拆成 cell；展開 colspan，並記住原本 td 數 */
const parseRow = (rowHtml) => {
  const cells = [];
  let nTd = 0;
  let colspan = 0;
  const re = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(rowHtml))) {
    const attrs = m[1];
    const span = Number((attrs.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
    if (span > 1) colspan = span;
    nTd++;
    const text = cellText(m[2]);
    for (let k = 0; k < span; k++) cells.push(k === 0 ? text : '');
  }
  return { cells, nTd, colspan };
};

const rowProfile = ({ cells }) => {
  const filled = cells.map((c, i) => [c, i]).filter(([c]) => !isBlank(c));
  return { filled, first: filled[0]?.[0] ?? '', text: filled.map(([c]) => c).join(' ') };
};

/** 對位用的正規化：去標點、小寫、壓空白 */
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[.,;:!?—–\-–'"“”‘’()（）\[\]〔〕「」『』…、。，・\u3000\s]/g, '');

/** 主要解析：回傳 units */
const parseChapter = (html) => {
  const units = [];
  const rowMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  let unit = null;
  let block = null;
  let pendingMarker = '';
  let expect = ''; // 'ja' | 'memo'
  let fieldIdx = null;
  let lastWasHeader = false;

  const flushUnit = () => {
    if (unit) units.push(unit);
    unit = null;
    block = null;
    fieldIdx = null;
    lastWasHeader = false;
  };

  for (const rowHtml of rowMatches) {
    const row = parseRow(rowHtml);
    if (!row.cells.length) continue;
    const { first, text } = rowProfile(row);
    if (!text) continue; // 空白列：狀態不動
    const TRACE = arg('trace', '');
    const tr = (what) => TRACE && Math.random() < 2 && console.log(`  [${what}] nTd=${row.nTd} span=${row.colspan} first="${first.slice(0, 20)}" block=${block ? block.kind + ':' + block.rows.length : '-'}`);

    const isNom = first === '語' && row.cells.includes('語根') && row.cells.includes('品詞');
    const isPred = first === '述語' && row.cells.includes('語根');
    if (isNom || isPred) {
      if (!unit) unit = { label: '', pali: '', ja: '', memo: '', kind: 'unknown', blocks: [] };
      block = { kind: isNom ? 'nom' : 'pred', phrase: '', rows: [] };
      unit.blocks.push(block);
      const header = isNom ? HEADER_NOM : HEADER_PRED;
      fieldIdx = header.map((h) => row.cells.indexOf(h));
      lastWasHeader = true;
      continue;
    }

    if (first === '訳文') {
      expect = 'ja';
      lastWasHeader = false;
      continue;
    }
    if (first === 'メモ') {
      expect = 'memo';
      lastWasHeader = false;
      continue;
    }
    if (expect) {
      if (unit) {
        if (expect === 'ja') unit.ja = unit.ja ? unit.ja + ' ' + text : text;
        else unit.memo = unit.memo ? unit.memo + ' ' + text : text;
      }
      expect = '';
      lastWasHeader = false;
      continue;
    }

    // 段號（11-1.）必須在詞列之前判斷：它和詞列一樣是「多格」列
    if (/^\d+-\d+\.?$/.test(first)) {
      pendingMarker = first;
      lastWasHeader = false;
      continue;
    }

    // 語欄的值。詞列的格子可能 colspan=2（td 少一個），長句引文列則橫跨 8~9 格。
    const c3 = block && fieldIdx && fieldIdx[0] >= 0 ? row.cells[fieldIdx[0]] ?? '' : '';
    const looksText = row.nTd < 8 || c3.length > 60;

    // 表頭後第一列長文 = 區塊引文（同一句在分頁處重貼），不是新單元
    if (lastWasHeader && block && looksText) {
      block.phrase = text;
      lastWasHeader = false;
      continue;
    }

    // 詞列
    if (block && fieldIdx && !looksText && c3) {
      const get = (k) => (fieldIdx[k] >= 0 ? (row.cells[fieldIdx[k]] ?? '') : '');
      const form = get(0);
      if (form) {
        block.rows.push([form, get(1), get(2), get(3), get(4), get(5), get(6), get(7)]);
        lastWasHeader = false;
        continue;
      }
    }


    // 導覽列（←前へ トップへ 次へ→）不是內容
    if (row.nTd <= 4 && text.length < 40 && /トップへ|前へ|次へ/.test(text)) {
      lastWasHeader = false;
      continue;
    }

    // 分頁處常常把同一句再貼一次（接續下一頁的詞列），那不是新單元
    const cont =
      unit &&
      unit.blocks.length &&
      !unit.ja &&
      !unit.memo &&
      !pendingMarker &&
      (unit.pali.includes(text.slice(0, 20)) || text.includes(unit.pali.slice(0, 20)));
    if (cont) {
      if (block && !block.phrase) block.phrase = text;
      lastWasHeader = false;
      continue;
    }

    // 其餘 colspan 文字列：句子或標題
    flushUnit();
    unit = {
      label: pendingMarker,
      pali: text,
      ja: '',
      memo: '',
      kind: pendingMarker ? 'sentence' : 'heading',
      blocks: [],
    };
    pendingMarker = '';
    block = null;
    fieldIdx = null;
    lastWasHeader = false;
  }
  flushUnit();
  return units;
};

const POS_PREFIX = ['名', '代', '形', '動', '副', '不変', '数', '接', '間', '否', '関', '前', '後', '不定', '‐'];
// 來源常見「過分／現分／未分」直接寫在品詞欄（省掉「名」），不算錯
const POS_SUFFIX = ['過分', '現分', '未分', '過', '現', '未'];
const posOk = (p) => POS_PREFIX.some((x) => p.startsWith(x)) || POS_SUFFIX.some((x) => p.endsWith(x));
const genderOk = (g) => !g || g === '‐' || /[男女中]/.test(g);

/** 去掉變音符號（ā→a、ṅ→n、ṃ→m…），只用來做連音比對 */
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const flatten = (units, folder, chapter) => {
  const sentences = [];
  const tokens = [];
  const stats = { units: 0, sentences: 0, unlabeled: 0, notes: 0, tokens: 0, nf: 0, sandhi: 0, compound: 0, order: 0, dup: 0, nopos: 0, badpos: 0, badgender: 0, nomeaning: 0 };

  units.forEach((u, i) => {
    stats.units++;
    const kind = u.kind === 'sentence' ? 'sentence' : u.blocks.length ? 'unlabeled' : 'note';
    if (kind === 'sentence') stats.sentences++;
    else if (kind === 'unlabeled') stats.unlabeled++;
    else stats.notes++;
    const sentId = `${folder}/${chapter}/${i + 1}`;
    sentences.push([sentId, folder, chapter, i + 1, kind, u.label, u.pali, u.ja, u.memo]);

    const hay = norm(u.pali);
    const hayF = fold(hay);
    let cursor = 0;
    let cursorF = 0;
    let tok = 0;
    let prevStart = -1;
    let prevForm = '';

    for (const b of u.blocks) {
      const bhay = b.phrase ? norm(b.phrase) : '';
      const bhayF = bhay ? fold(bhay) : '';
      const blockStart = cursor;
      const blockStartF = cursorF;
      for (const r of b.rows) {
        tok++;
        const form = r[0];
        const clean = norm(form);
        const cleanF = fold(clean);
        const flags = [];
        let start = -1;
        let ctx = '';

        if (clean && cleanF) {
          // ① 從游標起完全相符
          let at = hay.indexOf(clean, cursor);
          if (at >= 0) {
            start = at;
            ctx = 's';
            cursor = at + clean.length;
            cursorF = Math.min(hayF.length, cursor);
          } else {
            // ② 從游標起、去變音符號後相符（連音）
            at = hayF.indexOf(cleanF, cursorF);
            if (at >= 0 && at - cursorF <= 10) {
              start = at;
              ctx = 'f';
              flags.push('sandhi');
              stats.sandhi++;
              cursorF = at + cleanF.length;
              cursor = Math.min(hay.length, cursorF);
            } else {
              // ③ 整句往回找（複合詞拆解、人工貼錯段落都會落到這裡）
              at = hay.indexOf(clean);
              let atF = at < 0 ? hayF.indexOf(cleanF) : -1;
              if (at >= 0 || atF >= 0) {
                start = at >= 0 ? at : atF;
                ctx = 'c';
                flags.push('compound');
                if (start < blockStart) flags.push('back');
                stats.compound++;
                if (at < 0) flags.push('sandhi');
              } else if (bhayF && bhayF.indexOf(cleanF) >= 0) {
                // ④ 區塊引文（分頁重貼的句子）
                start = bhayF.indexOf(cleanF);
                ctx = 'b';
                flags.push('phrase');
              } else {
                // ⑤ 前 4 個字在附近出現：連音的近似對位
                const head = cleanF.slice(0, Math.min(4, cleanF.length));
                const near = head ? hayF.indexOf(head, Math.max(0, cursorF - 2)) : -1;
                if (near >= 0 && near - cursorF <= 12) {
                  start = near;
                  ctx = 'f';
                  flags.push('sandhi');
                  stats.sandhi++;
                  cursorF = near + head.length;
                  cursor = Math.min(hay.length, cursorF);
                }
              }
            }
          }
        }

        if (start < 0 && clean) {
          flags.push('nf');
          stats.nf++;
        }
        if (start >= 0 && prevStart >= 0 && start < prevStart - 1) {
          flags.push('order');
          stats.order++;
        }
        if (clean && clean === prevForm) {
          flags.push('dup');
          stats.dup++;
        }
        if (!r[2]) {
          flags.push('nopos');
          stats.nopos++;
        } else if (!posOk(r[2])) {
          flags.push('badpos');
          stats.badpos++;
        }
        if (!r[7]) {
          flags.push('nomeaning');
          stats.nomeaning++;
        }
        if (b.kind === 'nom' && r[4] && !genderOk(r[4])) {
          flags.push('badgender');
          stats.badgender++;
        }

        if (start >= 0) prevStart = start;
        prevForm = clean;
        stats.tokens++;

        const common = [sentId, tok, start, ctx, form, clean, r[1], r[2], r[3]];
        if (b.kind === 'nom') {
          tokens.push([...common, r[4], r[5], r[6], '', '', r[7], 'nom', flags.join(',')]);
        } else {
          tokens.push([...common, '', r[5], '', r[6], r[4], r[7], 'pred', flags.join(',')]);
        }
      }
    }
  });
  return { sentences, tokens, stats };
};
const main = () => {
  fs.mkdirSync(OUT, { recursive: true });
  const folders = fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const sentOut = fs.createWriteStream(path.join(OUT, 'sentences.tsv.gz'));
  const tokOut = fs.createWriteStream(path.join(OUT, 'tokens.tsv.gz'));
  const gzS = zlib.createGzip({ level: 9 });
  const gzT = zlib.createGzip({ level: 9 });
  gzS.pipe(sentOut);
  gzT.pipe(tokOut);

  gzS.write('sent_id\tfolder\tchapter\tunit\tkind\tlabel\tpali\tja\tmemo\n');
  gzT.write(
    'sent_id\ttok\tstart\tctx\tform\tform_clean\troot\tpos\tstem\tgender\tnumber\tcase\tperson\tvoice\tmeaning\tblock\tflags\n'
  );

  const chapters = [];
  let n = 0;
  const total = { units: 0, sentences: 0, unlabeled: 0, notes: 0, tokens: 0, nf: 0, sandhi: 0, compound: 0, order: 0, dup: 0, nopos: 0, badpos: 0, badgender: 0, nomeaning: 0 };

  for (const folder of folders) {
    for (const f of fs.readdirSync(path.join(DIR, folder)).filter((x) => x.endsWith('.html.gz')).sort()) {
      const chapter = f.replace(/\.html\.gz$/, '');
      if (ONLY && !`${folder}/${chapter}`.includes(ONLY)) continue;
      if (LIMIT && n >= LIMIT) break;
      n++;
      try {
        const html = zlib.gunzipSync(fs.readFileSync(path.join(DIR, folder, f))).toString('utf8');
        const units = parseChapter(html);
        if (DEBUG) {
          for (const [ui, u] of units.slice(0, 30).entries()) {
            console.log(
              `u${ui + 1} [${u.kind}] ${u.label} | ${u.pali.slice(0, 30)} | ${u.blocks.map((b) => b.kind + ':' + b.rows.length).join(',')}`
            );
          }
        }
        const { sentences, tokens, stats } = flatten(units, folder, chapter);
        for (const s of sentences) gzS.write(s.join('\t').replace(/\n/g, ' ') + '\n');
        for (const t of tokens) gzT.write(t.join('\t') + '\n');
        chapters.push([folder, chapter, stats.units, stats.sentences, stats.unlabeled, stats.notes, stats.tokens, stats.nf, stats.sandhi, stats.compound, stats.order, stats.dup, stats.nopos, stats.badpos, stats.badgender, stats.nomeaning, 'ok']);
        for (const k of Object.keys(total)) total[k] += stats[k];
      } catch (e) {
        chapters.push([folder, chapter, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'ERR:' + String(e.message).slice(0, 60)]);
        console.error(`ERR ${folder}/${chapter}: ${e.message}`);
      }
      if (n % 200 === 0) console.log(`[${n}] 章，詞 ${total.tokens}`);
    }
  }

  gzS.end();
  gzT.end();

  const lines = [
    'folder\tchapter\tunits\tsentences\tunlabeled\tnotes\ttokens\tnf\tsandhi\tcompound\torder\tdup\tnopos\tbadpos\tbadgender\tnomeaning\tstatus',
  ];
  for (const c of chapters) lines.push(c.join('\t'));
  fs.writeFileSync(path.join(OUT, 'chapters.tsv'), lines.join('\n') + '\n');

  const pct = (a) => (total.tokens ? ((100 * a) / total.tokens).toFixed(1) + '%' : '0%');
  console.log(`章 ${n}；單元 ${total.units}（句 ${total.sentences}／無段號 ${total.unlabeled}／注 ${total.notes}）；詞 ${total.tokens}`);
  console.log(
    `對不上句子 ${total.nf}（${pct(total.nf)}）、連音對上 ${total.sandhi}（${pct(total.sandhi)}）、複合詞 ${total.compound}、順序可疑 ${total.order}（${pct(total.order)}）、重複 ${total.dup}、無品詞 ${total.nopos}、品詞異常 ${total.badpos}、性別異常 ${total.badgender}、無意味 ${total.nomeaning}`
  );
};

main();
