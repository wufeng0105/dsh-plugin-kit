// T2 探针：从 asar 里抽出 dsh-skill 包源码到临时目录，供核对 rc.2 的注册规则
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ASAR = 'C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + 't2-dsh-skill';
const PREFIX = 'dsh/node_modules/@deepseek-ai/dsh-skill/';

const fd = readFileSync(ASAR);
const u32 = (off) => fd.readUInt32LE(off);
const pickleSize = u32(4);
const jsonLen = u32(12);
const header = JSON.parse(fd.subarray(16, 16 + jsonLen).toString('utf8'));
const baseOffset = 8 + pickleSize;

let n = 0;
function walk(node, prefix) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? `${prefix}/${name}` : name);
    return;
  }
  if (!prefix.startsWith(PREFIX)) return;
  const dest = join(OUT, prefix.slice(PREFIX.length));
  mkdirSync(dirname(dest), { recursive: true });
  const start = baseOffset + Number(node.offset);
  const data = node.unpacked
    ? readFileSync(ASAR + '.unpacked/' + prefix)
    : fd.subarray(start, start + node.size);
  writeFileSync(dest, data);
  n += 1;
}
walk(header, '');
console.log(`抽出 ${n} 个文件到 ${OUT}`);
