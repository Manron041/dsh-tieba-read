// 吧内搜帖：贴吧没有开放的搜索接口，只能翻列表 + 本地比对标题。
// 用法：node search.mjs <吧名> <关键词> [翻几页=10]
import { listForum } from './lib/api.mjs';

const kw = process.argv[2];
const qw = process.argv[3];
const pages = Math.max(1, Math.min(60, Number(process.argv[4]) || 10));

if (!kw || !qw) {
  console.error('用法: node search.mjs <吧名> <关键词> [翻几页=10]');
  process.exit(1);
}

const hits = [];
let total = 0;
let forumName = kw;

for (let pn = 1; pn <= pages; pn++) {
  let page;
  try {
    page = await listForum(kw, { page: pn });
  } catch (e) {
    console.error(`第 ${pn} 页失败：${e.message}`);
    break;
  }
  forumName = page.forum.name || forumName;
  total += page.threads.length;

  for (const t of page.threads) {
    if (t.title.includes(qw)) hits.push({ ...t, page: pn });
  }

  process.stderr.write(`\r翻到第 ${pn}/${pages} 页，累计 ${total} 帖，命中 ${hits.length} 条   `);
  if (!page.hasMore) break;
}
process.stderr.write('\n');

hits.sort((a, b) => b.replies - a.replies);

console.log(`${forumName}吧 · 关键词「${qw}」· 翻了 ${pages} 页共 ${total} 帖 · 命中 ${hits.length} 条\n`);
for (const h of hits) {
  console.log(`回复${String(h.replies).padStart(4)}  ${h.title}`);
  console.log(`           https://tieba.baidu.com/p/${h.tid}`);
}
if (!hits.length) {
  console.log('（标题里没匹配到。关键词可能只出现在正文里，那就得抓正文比对了。）');
}
