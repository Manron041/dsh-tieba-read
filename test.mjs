// 验证：正文提取率 + 楼中楼
import { readThread, readSubReplies, checkLogin, parseTid } from './lib/api.mjs';

const TID = parseTid(process.argv[2] || '11060929398');
console.log('tid =', TID, '| BDUSS:', process.env.TIEBA_BDUSS ? 'env' : 'file');

const login = await checkLogin();
console.log('登录自检:', JSON.stringify(login));

for (const sort of ['floor', 'hot']) {
  const posts = await readThread(TID, { sort, limit: 50 });
  const withText = posts.filter((p) => p.text).length;
  console.log(`\n=== sort=${sort} | 楼层 ${posts.length} | 有正文 ${withText}/${posts.length} (${Math.round(withText / posts.length * 100)}%) ===`);
  for (const p of posts.slice(0, 8)) {
    console.log(`  #${String(p.floor).padEnd(4)} 赞${String(p.likes).padEnd(3)} 楼中楼${String(p.subReplies).padEnd(3)} | ${p.text.slice(0, 66) || '(空)'}`);
  }
  const empty = posts.filter((p) => !p.text).map((p) => `#${p.floor}(赞${p.likes},楼${p.subReplies})`);
  console.log('  空正文:', empty.slice(0, 12).join(' ') || '无');
}

const hot = await readThread(TID, { sort: 'floor', limit: 30 });
const target = hot.filter((p) => p.subReplies > 0).sort((a, b) => b.subReplies - a.subReplies)[0];
if (target) {
  const subs = await readSubReplies(TID, target.pid);
  console.log(`\n=== 楼中楼 #${target.floor} pid=${target.pid} → ${subs.length} 条 ===`);
  for (const s of subs.slice(0, 8)) console.log(`  ${s.author || '?'}（赞${s.agree}）：${s.text.slice(0, 60) || '(空)'}`);
}
