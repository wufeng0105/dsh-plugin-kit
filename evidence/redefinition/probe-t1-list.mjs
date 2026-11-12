// T1 探针：列出 rc.2 app.asar 里 dsh-agent-preset/skills 的全部文件
// asar 格式：8 字节 pickle header + JSON 目录 + 文件数据区
import { readFileSync } from 'node:fs';

const ASAR = 'C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const fd = readFileSync(ASAR);

// asar header: 4 bytes (pickle size prefix) + 4 bytes (header string size, aligned) ...
// 标准解析：[0..3]=uint32 LE 4（header pickle 的大小标记），[4..7]=uint32 LE headerBlobSize+padding 信息
// 简化：读第一个 uint32 = 4，第二个 uint32 = header pickle 大小，第三个 uint32 = json 字符串长度（含 padding 对齐）
const u32 = (off) => fd.readUInt32LE(off);
const pickleSize = u32(4);           // header pickle 大小
const jsonLen = u32(12);             // JSON 长度（常见布局：12 处开始）
const json = fd.subarray(16, 16 + jsonLen).toString('utf8');
const header = JSON.parse(json);
const baseOffset = 8 + pickleSize;   // 文件数据区起点

const results = [];
function walk(node, prefix) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, prefix ? `${prefix}/${name}` : name);
    }
  } else {
    results.push({ path: prefix, size: node.size, offset: node.offset, unpacked: node.unpacked ?? false });
  }
}
walk(header, '');

const skillFiles = results.filter((f) => f.path.includes('/skills/') && !f.path.includes('/skills/'));
const allSkills = results.filter((f) => /node_modules\/@deepseek-ai\/[^/]+\/skills\//.test(f.path));
const bySkill = {};
for (const f of allSkills) {
  const m = /node_modules\/(@deepseek-ai\/[^/]+)\/skills\/([^/]+)\//.exec(f.path);
  if (!m) continue;
  const key = `${m[1]}:${m[2]}`;
  (bySkill[key] ??= []).push(f.path.slice(f.path.indexOf('/skills/') + 1));
}
console.log(`asar 总文件数: ${results.length}`);
console.log(`skills 目录总数: ${Object.keys(bySkill).length}`);
for (const [k, v] of Object.entries(bySkill)) console.log(`  ${k}: ${v.length} 文件`);
console.log('---全部文件---');
for (const f of allSkills) console.log(`  ${f.path}  (${f.size}B)`);
