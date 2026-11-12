// 核对 SKILL.md 的反引号文件引用都真实存在（幂等脚本，可重跑）
// 判定规则：引用若含 / 前缀（template/、host-skills/、scripts/、assets/）按 skill 根相对解析；
// 裸文件名（如 cordis.patch.yml）是泛指不是路径，跳过——只检查带目录前缀的引用。
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'plugin-kit');
const skill = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
const refs = [...skill.matchAll(/`([a-zA-Z0-9_\-./]+\.(?:mjs|md|json|yml))`/g)].map((m) => m[1]);
console.log('反引号文件引用:', refs.length);
let dead = 0;
let checked = 0;
for (const r of refs) {
  if (!r.includes('/')) continue; // 裸文件名是泛指（如「写 cordis.patch.yml」），不是路径引用
  checked += 1;
  const p1 = join(ROOT, r);
  const ok = existsSync(p1);
  if (!ok) { console.log(`DEAD ${r}  [tried ${p1}]`); dead += 1; }
}
console.log(`检查 ${checked} 个带路径前缀的引用，${dead === 0 ? '全部存在' : dead + ' 个死引用'}。`);
process.exitCode = dead === 0 ? 0 : 1;
