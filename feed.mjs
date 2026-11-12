// 把一个贴吧帖子喂进 fishtalk 语料库。
// 用法：node feed.mjs <帖子链接或 tid> [场合名]
//
// 为什么不直接调 fishtalk_feed 工具：在这台机器上，工具入参里的中文会被
// 按 GBK 解一遍，写进语料就是「鐢熶釜濂冲鍚」这种乱码。走 node 内部全程
// UTF-8，不经过命令行和工具参数编码。
import path from 'node:path';
import { createRequire } from 'node:module';
import { readThread, readSubReplies, parseTid } from './lib/api.mjs';

const PROFILE = process.env.FISHTALK_PROFILE || 'C:\\Users\\13676\\.dsh\\profiles\\desktop';
const FTLIB = path.join(PROFILE, 'node_modules', 'fishtalk', 'lib');
const require = createRequire(import.meta.url);
const store = require(path.join(FTLIB, 'store.js'));
const distill = require(path.join(FTLIB, 'distill.js'));
const deep = require(path.join(FTLIB, 'deep.js'));

const input = process.argv[2] || '';
const TID = parseTid(input);
if (!TID) {
  console.error('用法: node feed.mjs <帖子链接或 tid> [场合名]');
  process.exit(1);
}
const URL = /^https?:\/\//.test(input) ? input : `https://tieba.baidu.com/p/${TID}`;

const { forum, posts } = await readThread(TID, { page: 1, sort: 'floor', limit: 50 });
if (!posts.length) {
  console.error(`帖子 ${TID} 没读到楼层`);
  process.exit(1);
}

const scene = process.argv[3] || `${forum?.name || '贴吧'}吧`;

const items = [];
let floorCount = 0;
let subCount = 0;

for (const p of posts) {
  const t = (p.text || '').trim();
  if (t.length >= 6) { items.push({ text: t, source: 'tieba', where: URL, kind: 'line', scene }); floorCount++; }
}

const withSubs = posts.filter((p) => p.subReplies > 0).sort((a, b) => b.subReplies - a.subReplies).slice(0, 8);
for (const p of withSubs) {
  const subs = await readSubReplies(TID, p.pid);
  for (const s of subs) {
    const t = (s.text || '').trim();
    if (t.length >= 6) { items.push({ text: t, source: 'tieba', where: URL, kind: 'line', scene }); subCount++; }
  }
}

console.log(`帖子 ${TID} · ${forum?.name || '?'}吧`);
console.log(`  楼层取 ${floorCount} 条，楼中楼取 ${subCount} 条（${withSubs.length} 层）`);

const added = store.add(items);
console.log(`  实际新增 ${added} 条（重复的自动跳过）`);

if (added) {
  const pack = distill.run();
  console.log(`  蒸馏完成，语料共 ${pack.counts.human} 条`);
}

const hit = deep.listScenes().find((s) => s.name === scene);
console.log(`  场合「${scene}」现在 ${hit ? hit.count : 0} 条`);
