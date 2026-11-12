// 批量把贴吧帖子喂进 fishtalk 语料库。
// 用法：node feed.mjs <链接或tid> [<链接或tid> ...]
//       node feed.mjs --scene "自定义场合名" <链接...>
import path from 'node:path';
import { createRequire } from 'node:module';
import { readThread, readSubReplies, parseTid } from './lib/api.mjs';

const PROFILE = process.env.FISHTALK_PROFILE || 'C:\\Users\\13676\\.dsh\\profiles\\desktop';
const FTLIB = path.join(PROFILE, 'node_modules', 'fishtalk', 'lib');
const require = createRequire(import.meta.url);
const store = require(path.join(FTLIB, 'store.js'));
const distill = require(path.join(FTLIB, 'distill.js'));
const deep = require(path.join(FTLIB, 'deep.js'));

const argv = process.argv.slice(2);
let forcedScene = '';
const inputs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--scene') { forcedScene = argv[++i] || ''; continue; }
  inputs.push(argv[i]);
}

const targets = inputs.map((s) => ({ raw: s, tid: parseTid(s) })).filter((t) => t.tid);
if (!targets.length) {
  console.error('用法: node feed.mjs <链接或tid> [更多链接...] [--scene 场合名]');
  process.exit(1);
}

let totalAdded = 0;
const touched = new Set();

for (const t of targets) {
  const url = /^https?:\/\//.test(t.raw) ? t.raw : `https://tieba.baidu.com/p/${t.tid}`;
  try {
    const { forum, posts } = await readThread(t.tid, { page: 1, sort: 'floor', limit: 50 });
    if (!posts.length) { console.log(`✗ ${t.tid}  没读到楼层，跳过`); continue; }

    const scene = forcedScene || `${forum?.name || '贴吧'}吧`;
    const items = [];
    for (const p of posts) {
      const x = (p.text || '').trim();
      if (x.length >= 6) items.push({ text: x, source: 'tieba', where: url, kind: 'line', scene });
    }
    const withSubs = posts.filter((p) => p.subReplies > 0)
      .sort((a, b) => b.subReplies - a.subReplies).slice(0, 8);
    for (const p of withSubs) {
      const subs = await readSubReplies(t.tid, p.pid);
      for (const s of subs) {
        const x = (s.text || '').trim();
        if (x.length >= 6) items.push({ text: x, source: 'tieba', where: url, kind: 'line', scene });
      }
    }

    const added = store.add(items);
    totalAdded += added;
    touched.add(scene);
    console.log(`✓ ${t.tid}  ${forum?.name || '?'}吧  ${posts.length} 层 / ${items.length} 条候选 / 新增 ${added}`);
  } catch (e) {
    console.log(`✗ ${t.tid}  ${e.message}`);
  }
}

if (totalAdded) {
  const pack = distill.run();
  console.log(`\n蒸馏完成，语料共 ${pack.counts.human} 条`);
}

console.log('\n场合情况:');
for (const name of touched) {
  const hit = deep.listScenes().find((s) => s.name === name);
  console.log(`  ${name}  ${hit ? hit.count : 0} 条`);
}
