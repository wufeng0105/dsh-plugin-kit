// T3 探针：client.js ESM 检查的可执行判定式
// 依据 process.md P3.5 模块形态条款：宿主把所有插件的 client.js 拼成一个大脚本加载，
// ESM export/import 会让整个拼接脚本 SyntaxError。
// 判定式：new Function(combined) 必须能 parse。单文件 node --check 测不出（合法 ESM）。
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TPL = resolve(HERE, '..', '..', 'skills', 'plugin-kit', 'template');

/** 模拟宿主拼接：N 个插件 client.js 各自内容直接相连（宿主真实行为，见 2026-11-10 崩溃事故）。 */
function combinedParse(bodies) {
  const combined = bodies.join('\n;\n');
  try {
    // new Function 只 parse 不执行（包在函数体里），能抓住 ESM 语法
    new Function(combined);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error) };
  }
}

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failed += 1;
};

// 用例 1：骨架现状（无 client.js）→ 应通过（没有 client 半就不拼它）
const tplClient = join(TPL, 'client.js');
const hasClient = (await import('node:fs')).existsSync(tplClient);
if (!hasClient) {
  check('骨架无 client.js → 无需检查（Host 半插件）', true, 'preflight 应跳过该项');
} else {
  const r = combinedParse([readFileSync(tplClient, 'utf8')]);
  check('骨架 client.js 可 parse', r.ok, r.message ?? '');
}

// 用例 2：故意注入 ESM export → 必须红（证明判定式会抓）
const evil = `export const x = 1;
window.__ModuleLoader__?.load({ id: 'evil', factory: () => ({}) });
`;
const r2 = combinedParse([evil]);
check('注入 ESM export → 判定式变红', !r2.ok, r2.message ?? '');

// 用例 3：ModuleLoader 形态（正确形状）→ 应通过
const good = `window.__ModuleLoader__.load({
  id: 'ok',
  factory: (require) => {
    const plugin = { inject: [], apply: () => {} };
    Object.defineProperty(plugin, Symbol.toStringTag, { value: 'Module' });
    return plugin;
  },
});
`;
const r3 = combinedParse([good]);
check('ModuleLoader 形态可 parse', r3.ok, r3.message ?? '');

// 用例 4：多插件拼接场景（好 + 坏混拼，坏的那个拖垮全部）
const r4 = combinedParse([good, evil]);
check('拼接场景：一个 ESM 拖垮全部 → 判定式变红', !r4.ok, r4.message ?? '');

// 用例 5：import 语句（另一形态）→ 必须红
const r5 = combinedParse([`import { x } from './y.js';`]);
check('注入 import 语句 → 判定式变红', !r5.ok, r5.message ?? '');

console.log(failed === 0 ? '\nT3 探针：判定式可执行、可变红。' : `\nT3 探针：${failed} 项失败。`);
process.exit(failed === 0 ? 0 : 1);
