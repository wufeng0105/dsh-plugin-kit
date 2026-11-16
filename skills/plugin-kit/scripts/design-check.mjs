#!/usr/bin/env node
/**
 * design-check.mjs — 设计期核查：词汇表 / ADR / 接口面。
 *
 * 「设计期纪律读一次就忘」的落点：不靠记忆，靠失败消息。
 * 每条 FAIL 都带「缺什么 / 怎么补 / 依据」——模型在失败点学会规则，
 * 这正是 preflight 对装败家族被验证有效的形态（纪律段退役、判定式存活）。
 *
 * 用法：
 *   node design-check.mjs <项目根>
 *   node design-check.mjs <项目根> --json
 *   node design-check.mjs --self-test     （内建夹具，证明判定式会红）
 *
 * 退出码：0 无 FAIL / 1 有 FAIL / 2 用法错误
 *
 * 检查项与出处：
 *   lexicon.file        词汇表存在（CONTEXT.md / CONTEXT-MAP.md / README 词汇表节）——模板已带种子
 *   lexicon.format      条目格式：`**术语**：定义`（定义可换行）+ 可选 `_Avoid_: 旧叫法`
 *                       ——domain-modeling 的 CONTEXT-FORMAT.md
 *   lexicon.drift       标识符样式的弃用名出现在文档里 → FAIL（含 _ / . / / 或反引号；
 *                       如 `_ledger.jsonl`——这类旧名出现在正文里永远是错的）；
 *                       普通语言词（如「同步」「API」）只提示不判红（词汇表天生要列弃用词，
 *                       全文扫描普通词会造成 100% 噪声——2026-11-17 审计实测 19/19 假红）
 *   adr.format          docs/adr/NNNN-slug.md 命名 + 标题 + 正文 + 编号唯一（Unicode slug 允许）
 *                       ——domain-modeling 的 ADR-FORMAT.md
 *   adr.trigger         UNVERIFIABLE：是否该写一条 ADR 只有人知道（三条门槛作人工判法）
 *   interface.questions UNVERIFIABLE：接口三问（codebase-design），答案写进交付说明或 ADR
 *
 * 与 preflight / recheck 的分工（不互判）：
 *   设计期跑 design-check（定概念与形状）；装前跑 preflight（判宿主契约与装败）；
 *   升级后跑 recheck（判触点漂移）。入口导出面归 preflight 判，本脚本不碰。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const opts = { root: null, json: false, selfTest: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (opts.root === null && !arg.startsWith('-')) opts.root = resolve(arg);
    else if (arg.startsWith('-')) { console.error(`未知参数：${arg}`); opts.help = true; }
  }
  return opts;
}

// ---------------------------------------------------------------- 词表解析

/** 标题行 → { level, text }；非标题返回 null。 */
function headingOf(line) {
  const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
  return m === null ? null : { level: m[1].length, text: m[2].trim() };
}

/** 标题是否词汇表节（CONTEXT.md 的 Language、README 的词汇表/术语表）。 */
function isGlossaryHeading(text) {
  return /词汇表|术语表|glossary|language/i.test(text);
}

/**
 * 解析一段词汇表文本为条目。
 * 条目 = `**术语**：定义`（定义可换行）或 `**术语**` 单独成行 + 下一行定义；
 * 随后可选 `_Avoid_: 叫法、叫法`。定义行不会跨过量纲/标题/下一条目。
 *
 * @returns {{ entries: Array<{term:string, def:string, avoid:string[]}>, problems: string[] }}
 */
function parseGlossary(text) {
  const entries = [];
  const problems = [];
  const lines = text.split(/\r?\n/);

  // 限定作用域：优先 `## Language` 节（CONTEXT-FORMAT 的标准形态）；没有就整段。
  let scope = lines;
  const lang = lines.findIndex((l) => {
    const h = headingOf(l);
    return h !== null && /language/i.test(h.text) && h.level <= 3;
  });
  if (lang !== -1) {
    const level = headingOf(lines[lang]).level;
    let end = lines.length;
    for (let i = lang + 1; i < lines.length; i += 1) {
      const h = headingOf(lines[i]);
      if (h !== null && h.level <= level) { end = i; break; }
    }
    scope = lines.slice(lang + 1, end);
  }

  for (let i = 0; i < scope.length; i += 1) {
    const line = scope[i];
    const m = /^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/.exec(line.trim());
    if (m === null) continue;
    // 强调句（`**就位**在这里...`）不是条目：粗体后必须紧跟冒号或行尾。
    const trailing = /^\*\*(.+?)\*\*(.*)$/.exec(line.trim());
    if (trailing !== null && trailing[2].trim() !== '' && !/^[:：]/.test(trailing[2].trim())) continue;

    const term = m[1].trim();
    if (term === '') { problems.push(`条目术语为空：${line.trim()}`); continue; }

    let def = m[2].trim();
    let consumed = 0;
    if (def === '') {
      // 定义在下一行：跳过空行，找到第一个非空、非标题、非粗体、非 _Avoid_ 的行。
      let j = i + 1;
      while (j < scope.length && scope[j].trim() === '') j += 1;
      if (j < scope.length) {
        const next = scope[j].trim();
        if (next !== '' && headingOf(next) === null && !/^\*\*/.test(next) && !/^_Avoid_/.test(next)) {
          def = next;
          consumed = j - i;
        }
      }
    }
    if (def === '') {
      problems.push(`条目缺定义：「${term}」（格式：**术语**：一两句定义，_Avoid_: 弃用叫法）`);
    }

    const avoid = [];
    const after = i + 1 + (consumed > 0 ? consumed - 1 : 0);
    const avoidLine = scope[Math.min(i + 1 + consumed, scope.length - 1)] ?? '';
    const av = /^\s*_Avoid_\s*[:：]\s*(.+)$/.exec(avoidLine);
    if (av !== null) {
      for (const tok of av[1].split(/[,，、]/)) {
        const t = tok.trim();
        if (t !== '') avoid.push(t);
      }
    }
    entries.push({ term, def, avoid });
    i += consumed;
  }

  return { entries, problems };
}

/** 粗判一个弃用词是否是「标识符样式」（可安全判 FAIL 的那类）。 */
function isIdentifierish(token) {
  const t = token.trim();
  if (t.includes('`')) return true;
  if (/[A-Za-z0-9_]/.test(t) && /[_/.#]/.test(t)) return true;
  if (/[A-Za-z0-9]-[A-Za-z0-9]/.test(t)) return true;
  return false;
}

/** 找词汇表：CONTEXT.md → CONTEXT-MAP.md → README 词汇表节。 */
function locateGlossary(root) {
  const ctx = join(root, 'CONTEXT.md');
  if (existsSync(ctx)) {
    return { source: 'CONTEXT.md', text: readFileSync(ctx, 'utf8') };
  }
  const map = join(root, 'CONTEXT-MAP.md');
  if (existsSync(map)) {
    const mapText = readFileSync(map, 'utf8');
    const paths = [...mapText.matchAll(/\]\(([^)]+CONTEXT\.md)\)/g)].map((m) => m[1]);
    const present = paths.filter((p) => existsSync(join(root, p.replace(/^\.\//, ''))));
    if (present.length > 0) {
      const texts = present.map((p) => readFileSync(join(root, p.replace(/^\.\//, '')), 'utf8')).join('\n\n');
      return { source: 'CONTEXT-MAP.md', text: texts };
    }
    return { source: null, text: null };
  }
  const readme = join(root, 'README.md');
  if (existsSync(readme)) {
    const lines = readFileSync(readme, 'utf8').split(/\r?\n/);
    const idx = lines.findIndex((l) => {
      const h = headingOf(l);
      return h !== null && isGlossaryHeading(h.text);
    });
    if (idx !== -1) {
      const level = headingOf(lines[idx]).level;
      let end = lines.length;
      for (let i = idx + 1; i < lines.length; i += 1) {
        const h = headingOf(lines[i]);
        if (h !== null && h.level <= level) { end = i; break; }
      }
      return { source: 'README.md', text: lines.slice(idx + 1, end).join('\n') };
    }
  }
  return { source: null, text: null };
}

// ---------------------------------------------------------------- 判定式

const CHECKS = [
  {
    id: 'lexicon.file',
    name: '词汇表存在（CONTEXT.md / CONTEXT-MAP.md / README 词汇表节）',
    basis: 'domain-modeling：术语一物一名，第一个术语敲定时就落盘；模板已带种子',
    check(ctx) {
      if (ctx.glossary.source !== null) {
        return { status: 'PASS', detail: `来源 ${ctx.glossary.source}，${ctx.entries.length} 条术语` };
      }
      return {
        status: 'FAIL',
        why: '项目根没有 CONTEXT.md / CONTEXT-MAP.md，README 也没有词汇表节',
        fix: '建 CONTEXT.md（模板已带种子）：`**术语**：一两句定义` + `_Avoid_: 弃用叫法`',
      };
    },
  },
  {
    id: 'lexicon.format',
    name: '词汇表条目格式合规（术语行 + 定义 + 可选 _Avoid_）',
    basis: 'domain-modeling 的 CONTEXT-FORMAT.md：`**术语**：定义`，一名一物',
    check(ctx) {
      if (ctx.entries.length === 0) {
        return { status: 'FAIL', why: '词汇表存在但没有任何术语条目', fix: '写下第一条真实术语（模板种子的「示例术语」换成你的）' };
      }
      const placeholders = ctx.entries.filter((e) => /示例|placeholder|TODO/i.test(e.term));
      if (placeholders.length > 0) {
        return {
          status: 'FAIL',
          why: `词汇表还是模板种子（${placeholders.map((e) => e.term).join('、')}）`,
          fix: '把「示例术语」换成你的第一条真实术语——首跑必红是设计期第一步，不是故障',
        };
      }
      if (ctx.problems.length > 0) {
        return { status: 'FAIL', why: ctx.problems.join('；'), fix: '按格式补全定义行；一个术语一个名字' };
      }
      return { status: 'PASS', detail: `${ctx.entries.length} 条条目格式合规` };
    },
  },
  {
    id: 'lexicon.drift',
    name: '标识符样式的弃用名不出现在文档正文',
    basis: 'readme-claims 的「零旧词」守卫模式：特征词（含 _ / . / / 或反引号）出现在正文永远是错的；普通词只提示',
    check(ctx) {
      const tokens = ctx.entries.flatMap((e) => e.avoid).filter(isIdentifierish);
      if (tokens.length === 0) {
        return { status: 'PASS', detail: '没有标识符样式的弃用词可判（普通词不判红）' };
      }
      const files = [
        ['README.md', join(ctx.root, 'README.md')],
        ['AGENTS.md', join(ctx.root, 'AGENTS.md')],
        ['SKILL.md', join(ctx.root, 'SKILL.md')],
      ].filter(([, p]) => existsSync(p));

      const hits = [];
      for (const [label, path] of files) {
        const lines = readFileSync(path, 'utf8').split(/\r?\n/);
        // 词汇表节内豁免（词汇表天生要列弃用词）。
        const exempt = new Set();
        let level = null;
        lines.forEach((line, i) => {
          const h = headingOf(line);
          if (h !== null && isGlossaryHeading(h.text)) { level = h.level; exempt.add(i); return; }
          if (level !== null) {
            if (h !== null && h.level <= level) { level = null; return; }
            exempt.add(i);
          }
        });
        lines.forEach((line, i) => {
          if (exempt.has(i)) return;
          for (const tok of tokens) {
            const bare = tok.replace(/`/g, '').trim();
            if (bare !== '' && line.includes(bare)) hits.push(`${label}:${i + 1} 用了「${tok}」`);
            // 不判红：普通词（isIdentifierish 为假）不进入 tokens，这里只处理特征词。
          }
        });
      }

      if (ctx.pkgdesc !== null) {
        for (const tok of tokens) {
          if (ctx.pkgdesc.includes(tok)) hits.push(`package.json description 用了「${tok}」`);
        }
      }

      if (hits.length > 0) {
        return {
          status: 'FAIL',
          why: `弃用名出现在正文：${hits.slice(0, 5).join('；')}${hits.length > 5 ? ` 等 ${hits.length} 处` : ''}`,
          fix: '把正文里的旧名换成词汇表里的正名；旧名只许出现在词汇表的 _Avoid_ 行',
        };
      }
      const ordinary = ctx.entries.flatMap((e) => e.avoid).filter((t) => !isIdentifierish(t));
      return { status: 'PASS', detail: `特征词 ${tokens.length} 个，正文零命中${ordinary.length > 0 ? `；普通弃用词 ${ordinary.length} 个只提示不判红` : ''}` };
    },
  },
  {
    id: 'adr.format',
    name: 'ADR 命名与正文合规（docs/adr/NNNN-slug.md，标题+正文，编号唯一）',
    basis: 'domain-modeling 的 ADR-FORMAT.md：顺序编号、懒创建、一篇可只有一段',
    check(ctx) {
      const dir = join(ctx.root, 'docs', 'adr');
      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return { status: 'PASS', detail: '尚无 docs/adr/（懒创建：有决策时再建）' };
      }
      const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
      if (files.length === 0) return { status: 'PASS', detail: 'docs/adr/ 为空（懒创建）' };

      const problems = [];
      const numbers = new Map();
      for (const f of files) {
        const m = /^(\d{4})-(.+)\.md$/.exec(f);
        if (m === null) {
          problems.push(`${f} 命名不合规（应为 NNNN-slug.md）`);
          continue;
        }
        const n = m[1];
        numbers.set(n, (numbers.get(n) ?? 0) + 1);
        const text = readFileSync(join(dir, f), 'utf8');
        const body = text.replace(/^---[\s\S]*?---\s*/m, '').trim();
        if (!/^#\s+\S+/m.test(body)) problems.push(`${f} 缺标题（# …）`);
        const afterTitle = body.replace(/^#\s+.+$/m, '').trim();
        if (afterTitle.length === 0) problems.push(`${f} 正文为空（至少一句话说明决策与理由）`);
      }
      for (const [n, c] of numbers) {
        if (c > 1) problems.push(`编号 ${n} 重复 ${c} 次（每篇 ADR 编号唯一，重排不改旧号）`);
      }
      if (problems.length > 0) {
        return { status: 'FAIL', why: problems.join('；'), fix: '按 ADR-FORMAT 命名：NNNN-slug.md（Unicode slug 允许），标题 + 一段正文，编号不重复' };
      }
      return { status: 'PASS', detail: `${files.length} 份 ADR 格式合规` };
    },
  },
  {
    id: 'adr.trigger',
    name: '是否该写一条 ADR（人工判读）',
    basis: 'domain-modeling 的 ADR 三门槛：难回头 + 无上下文费解 + 真实取舍',
    check() {
      return {
        status: 'UNVERIFIABLE',
        manual: '逐条问：①改主意代价是否实打实？②未来读者会不会问「为什么这么做」？③有没有真备选、为具体理由选了一个？三条全占才写 ADR；有一条不占就不写。',
      };
    },
  },
  {
    id: 'interface.questions',
    name: '接口三问（人工判读）',
    basis: 'codebase-design：小接口、深实现；删除测试；两个适配器才有真接缝',
    check() {
      return {
        status: 'UNVERIFIABLE',
        manual: '动笔前逐条回答，答案写进交付说明或 ADR：①删掉这个导出/模块，复杂度去了哪（消失=透传，在 N 处重现=它在挣饭钱）？②接缝另一侧真有第二个适配器（生产+测试）吗？没有就别设缝；③依赖是参数传入还是模块内 new 的？',
      };
    },
  },
];

// ---------------------------------------------------------------- 上下文

function buildContext(root) {
  const glossary = locateGlossary(root);
  const parsed = glossary.text === null ? { entries: [], problems: [] } : parseGlossary(glossary.text);
  let pkgdesc = null;
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try { pkgdesc = String(JSON.parse(readFileSync(pkgPath, 'utf8')).description ?? ''); } catch { pkgdesc = null; }
  }
  return { root, glossary, entries: parsed.entries, problems: parsed.problems, pkgdesc };
}

function runChecks(root) {
  const ctx = buildContext(root);
  return CHECKS.map((c) => ({ id: c.id, name: c.name, ...c.check(ctx) }));
}

// ---------------------------------------------------------------- 渲染

function render(results, json) {
  if (json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }
  for (const r of results) {
    const head = `${r.status.padEnd(13)} ${r.id}  ${r.name}`;
    console.log(head);
    if (r.detail !== undefined) console.log(`     ${r.detail}`);
    if (r.status === 'FAIL') {
      console.log(`     缺什么：${r.why}`);
      console.log(`     怎么补：${r.fix}`);
      const basis = CHECKS.find((c) => c.id === r.id)?.basis;
      if (basis !== undefined) console.log(`     依据：${basis}`);
    }
    if (r.status === 'UNVERIFIABLE' && r.manual !== undefined) {
      console.log(`     人工判法：${r.manual}`);
    }
  }
}

// ---------------------------------------------------------------- 自检

function selfTest() {
  const work = mkdtempSync(join(tmpdir(), 'design-check-'));
  const cases = [];
  const mk = (name) => {
    const dir = join(work, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  const write = (dir, rel, text) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, 'utf8');
  };
  const expect = (label, root, want) => {
    const results = runChecks(root);
    const fail = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
    const got = results.find((r) => r.id === want.id)?.status;
    const unver = results.filter((r) => r.status === 'UNVERIFIABLE').map((r) => r.id);
    cases.push({ label, root, want, fail, got, unver, results });
  };

  // 1. 空项目 → lexicon.file FAIL
  expect('空项目', mk('empty'), { id: 'lexicon.file', status: 'FAIL' });

  // 2. 模板种子 → lexicon.format FAIL
  const seed = mk('seed');
  write(seed, 'CONTEXT.md', '# X\n\n一句话描述。\n\n## Language\n\n**示例术语**：这是格式示例。\n_Avoid_: 示例叫法\n');
  expect('模板种子', seed, { id: 'lexicon.format', status: 'FAIL' });

  // 3. 合规词表（官方多行格式）+ README 普通弃用词出现 → 0 FAIL（不许噪声）
  const good = mk('good');
  write(good, 'CONTEXT.md', [
    '# Shop',
    '',
    '订单与发票。',
    '',
    '## Language',
    '',
    '**Order**：',
    '一个订单。',
    '_Avoid_: purchase, transaction',
    '',
    '**Invoice**：',
    '一张发票。',
    '_Avoid_: bill',
  ].join('\n'));
  write(good, 'README.md', '# Demo\n\n这是 API 文档，业务会同步状态。\n');
  expect('合规词表', good, { id: 'lexicon.drift', status: 'PASS' });

  // 4. CONTEXT-MAP 多上下文布局 → 0 FAIL
  const map = mk('map');
  write(map, 'CONTEXT-MAP.md', '# Map\n\n- [Ordering](./src/ordering/CONTEXT.md): 订单\n- [Billing](./src/billing/CONTEXT.md): 发票\n');
  write(map, 'src/ordering/CONTEXT.md', '# Ordering\n\n## Language\n\n**Order**：一个订单。\n');
  write(map, 'src/billing/CONTEXT.md', '# Billing\n\n## Language\n\n**Invoice**：一张发票。\n');
  expect('多上下文', map, { id: 'lexicon.file', status: 'PASS' });

  // 5. README 词汇表节 → 0 FAIL
  const readmeGloss = mk('readme-gloss');
  write(readmeGloss, 'README.md', '# X\n\n## 词汇表\n\n**Order**：一个订单。\n\n## 用法\n\n正文。\n');
  expect('README 词汇表', readmeGloss, { id: 'lexicon.file', status: 'PASS' });

  // 6. 特征词漂移 → lexicon.drift FAIL
  const drift = mk('drift');
  write(drift, 'CONTEXT.md', '# X\n\n## Language\n\n**Order**：一个订单。\n_Avoid_: `_ledger.jsonl`\n');
  write(drift, 'README.md', '# X\n\n旧台账在 _ledger.jsonl 里。\n');
  expect('特征词漂移', drift, { id: 'lexicon.drift', status: 'FAIL' });

  // 7. ADR 命名违规 → adr.format FAIL
  const badAdr = mk('bad-adr');
  write(badAdr, 'CONTEXT.md', '# X\n\n## Language\n\n**Order**：一个订单。\n');
  write(badAdr, 'docs/adr/1-first.md', '# First\n\n决策与理由。\n');
  expect('ADR 命名', badAdr, { id: 'adr.format', status: 'FAIL' });

  // 8. ADR 编号重复 → adr.format FAIL
  const dupAdr = mk('dup-adr');
  write(dupAdr, 'CONTEXT.md', '# X\n\n## Language\n\n**Order**：一个订单。\n');
  write(dupAdr, 'docs/adr/0001-a.md', '# A\n\n决策与理由 A。\n');
  write(dupAdr, 'docs/adr/0001-b.md', '# B\n\n决策与理由 B。\n');
  expect('ADR 重复编号', dupAdr, { id: 'adr.format', status: 'FAIL' });

  // 9. 中文 slug ADR → adr.format PASS
  const cnAdr = mk('cn-adr');
  write(cnAdr, 'CONTEXT.md', '# X\n\n## Language\n\n**Order**：一个订单。\n');
  write(cnAdr, 'docs/adr/0001-核心目标重定义.md', '# 核心目标重定义\n\n决策与理由。\n');
  expect('中文 slug', cnAdr, { id: 'adr.format', status: 'PASS' });

  let failed = 0;
  for (const c of cases) {
    const ok = c.got === c.want.status;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.label} → ${c.want.id}=${c.got ?? '缺失'}（期望 ${c.want.status}）`);
    if (!ok) failed += 1;
  }
  // 合规夹具必须零 FAIL（否则判定式有噪声）
  const noisy = cases.find((c) => c.label === '合规词表').fail;
  const okNoise = noisy.length === 0;
  console.log(`  ${okNoise ? 'PASS' : 'FAIL'}  合规词表零 FAIL（实际 ${noisy.length} 条）`);
  if (!okNoise) failed += 1;

  rmSync(work, { recursive: true, force: true });
  console.log(failed === 0 ? '\n自检通过：判定式会红，且合规夹具不假红。' : `\n自检失败：${failed} 项。`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- 入口

const opts = parseArgs(process.argv.slice(2));
if (opts.help || (opts.root === null && !opts.selfTest)) {
  console.log('用法：node design-check.mjs <项目根> [--json]\n      node design-check.mjs --self-test');
  process.exit(2);
}
if (opts.selfTest) {
  process.exit(selfTest());
}

const results = runChecks(opts.root);
render(results, opts.json);
const failed = results.filter((r) => r.status === 'FAIL').length;
if (!opts.json) console.log('');
if (failed > 0) {
  console.log(opts.json ? '' : `${failed} 项 FAIL——设计期未就绪，按「怎么补」修完再继续。`);
  process.exit(1);
}
console.log(opts.json ? '' : '设计期核查通过（UNVERIFIABLE 项按人工判法核对，不算通过）。');
process.exit(0);
