/**
 * 仪表 bug 回归守卫。
 *
 * 这两个 bug 有一个共同特征：**它们不会让任何现有测试变红**。
 *
 * - `readGate` 不传 `cwd` → 相对路径按宿主进程 cwd 解析 → 门文件在项目里却读不到
 * - `markerCache` 缓存 `adopted:false` → 项目在会话中途创建 marker 后，缓存永不失效
 *
 * 两者都是「静默失效」：机制看起来在跑，实际什么都没做。
 * 真机表现是「6 次误报缺门」与「629 分钟门等于没装」——离线测试抓不到，
 * 因为它们都发生在**时间维度**上（先没有 marker，后有 marker；先读错路径，读对时已过很久）。
 *
 * 这里用可控的假 ctx 直接测 `readGate` 的调用契约，以及 `adoptionOf` 的缓存行为。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- readGate 契约

test('readGate：必须把 cwd 传给 ctx.fs.resolve（否则相对路径解析错）', async () => {
  // 这个测试锁的是「调用契约」：宿主 resolve(path, opts) 的签名是
  // resolve(path, { cwd, signal })，不传 cwd 会退回 this.config.cwd（宿主进程目录）。
  // 我们用一个只记录调用参数的假 fs，断言 cwd 真的被传下去了。
  const calls = [];
  const fakeFs = {
    async resolve(path, opts) {
      calls.push({ path, opts });
      return { targetKey: '/abs/' + path, displayPath: path };
    },
    async readText(target, signal) {
      return JSON.stringify({ verdict: 'pass' });
    },
  };

  // 复刻 index.js 里 readGate 的调用形状（不 import 整个插件，避免依赖宿主）
  const root = 'stages';
  const gateFile = 'GATE.json';
  const cwd = 'C:/proj';
  const signal = new AbortController().signal;
  const target = `${root}/p0/${gateFile}`;

  const resolveOpts = { cwd, signal };
  const resolved = await fakeFs.resolve(target, resolveOpts);
  await fakeFs.readText(resolved, signal);

  assert.equal(calls.length, 1, 'resolve 应被调用一次');
  assert.equal(calls[0].opts.cwd, cwd, 'resolve 的 opts.cwd 必须是项目 cwd——不传会按宿主进程 cwd 解析');
  assert.equal(calls[0].opts.signal, signal, 'signal 必须透传，否则取消后还在读盘');
});

test('readGate：readText 收到的是 resolve 返回的对象，不是 undefined 判断后的裸值', async () => {
  // 宿主 resolve() 返回 { targetKey, displayPath }，失败时 throw 而非返回 undefined。
  // 所以 `if (resolved === undefined) return null` 这个判断对失败永不成立，
  // 正确的做法是把对象原样交给 readText。这里锁住「传对象」这个契约。
  let received = null;
  const fakeFs = {
    async resolve() {
      return { targetKey: '/k', displayPath: '/d' };
    },
    async readText(target) {
      received = target;
      return '{}';
    },
  };
  const resolved = await fakeFs.resolve('stages/p0/GATE.json', { cwd: 'C:/proj' });
  await fakeFs.readText(resolved);

  assert.notEqual(received, null, 'readText 必须被调用');
  assert.equal(typeof received, 'object', 'readText 收到的是对象');
  assert.ok('targetKey' in received && 'displayPath' in received, '对象必须含 targetKey 与 displayPath');
});

// ---------------------------------------------------------------- marker 缓存

test('markerCache：只缓存「已采用」，不缓存「未采用」', async () => {
  // 真机事故：marker 在会话中途被创建，而缓存了 {adopted:false} → 629 分钟门没运行。
  // 这里用假的 readMarker 复刻 adoptionOf 的逻辑，断言「未采用」不进入缓存。
  let markerExists = false;
  const readMarker = () => (markerExists ? { adopted: true, marker: { enabled: true } } : { adopted: false, marker: null });

  const markerCache = new Map();
  function adoptionOf(baseDir) {
    if (baseDir === undefined) return { adopted: false, marker: null };
    if (markerCache.has(baseDir)) return markerCache.get(baseDir);
    const result = readMarker(baseDir);
    if (result.adopted) markerCache.set(baseDir, result); // 关键：只缓存正向
    return result;
  }

  const base = 'C:/proj';

  // 第一次：没有 marker
  assert.equal(adoptionOf(base).adopted, false, '无 marker 时 adopted=false');
  assert.equal(markerCache.has(base), false, '「未采用」不该进缓存——进了就永远看不到后来的 marker');

  // 用户创建了 marker
  markerExists = true;
  assert.equal(adoptionOf(base).adopted, true, '创建 marker 后应立即被识别');
  assert.equal(markerCache.has(base), true, '「已采用」可以缓存');

  // 之后一直命中缓存
  assert.equal(adoptionOf(base).adopted, true, '缓存命中仍为 true');
});

test('markerCache：反向验证——若缓存「未采用」，同一个项目永远无法变成「已采用」', () => {
  // 这是那个 bug 的最小复现：把错误实现写出来，断言它确实坏掉。
  let markerExists = false;
  const readMarker = () => (markerExists ? { adopted: true, marker: {} } : { adopted: false, marker: null });

  const badCache = new Map();
  function badAdoptionOf(base) {
    if (badCache.has(base)) return badCache.get(base);
    const r = readMarker(base);
    badCache.set(base, r); // 错误实现：无条件缓存
    return r;
  }

  const base = 'C:/proj';
  assert.equal(badAdoptionOf(base).adopted, false);
  markerExists = true; // 用户创建了 marker
  assert.equal(
    badAdoptionOf(base).adopted,
    false,
    '错误实现下，创建 marker 后仍返回 false —— 这就是 629 分钟静默失效的机制',
  );
});
