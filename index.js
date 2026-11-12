// DSH 插件入口：两个只读工具 —— 读楼层、读楼中楼。
import { readThread, readSubReplies, parseTid, hasBduss, checkLogin } from './lib/api.mjs';

export const name = 'dsh-tieba-read';
export const inject = ['tools'];

const asText = (v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }];

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

function renderThread(r) {
  const head = [`帖子 ${r.tid}`];
  if (r.forum?.name) head.push(`${r.forum.name}吧`);
  head.push(`第${r.page}页`, r.sort === 'hot' ? '按热度' : '按楼层', `${r.posts.length} 层`);
  const lines = [head.join(' · '), ''];
  for (const p of r.posts) {
    const tags = [`#${p.floor}`];
    if (p.likes) tags.push(`赞${p.likes}`);
    if (p.subReplies) tags.push(`楼中楼${p.subReplies}`);
    let text = (p.text || '').replace(/\s+/g, ' ').trim();
    if (!text) text = '（图片/表情楼）';
    else if (text.length > 400) text = text.slice(0, 400) + '…';
    lines.push(`${tags.join(' ')}  pid=${p.pid}  ${text}`);
  }
  if (r.note) lines.push('', r.note);
  return lines.join('\n');
}

function renderSubs(r) {
  const lines = [`帖子 ${r.tid} · 楼层 ${r.floor} · 楼中楼 ${r.subs.length} 条`, ''];
  for (const s of r.subs) {
    const who = s.author || '匿名';
    const agree = s.agree ? `(赞${s.agree})` : '';
    lines.push(`${who}${agree}：${s.text || '（空）'}`);
  }
  return lines.join('\n');
}

export function apply(ctx) {
  const tools = [
    {
      name: 'tieba_thread',
      description:
        '读百度贴吧帖子的楼层回复。传帖子链接或 tid。返回每层的楼层号、赞数、楼中楼数和正文，' +
        '还给出 pid（读楼中楼要用）。sort=floor 按楼层顺序、=hot 按热度（高赞在前）。' +
        '走 App protobuf 通道，不需要浏览器、不撞网页版验证码。需要先配置 BDUSS。',
      parameters: obj({
        url: { type: 'string', description: '帖子链接，如 https://tieba.baidu.com/p/11060929398' },
        tid: { type: 'string', description: '帖子 id（纯数字）；有 url 时可省略' },
        page: { type: 'number', description: '第几页，从 1 开始，默认 1' },
        sort: { type: 'string', enum: ['floor', 'hot'], description: 'floor=楼层顺序（默认），hot=按热度' },
        limit: { type: 'number', description: '每页层数，1-50，默认 30' },
      }),
      async execute(args = {}) {
        const tid = parseTid(args.url) || String(args.tid || '').trim();
        if (!/^\d{6,}$/.test(tid)) return '需要一个贴吧帖子链接或纯数字 tid。';

        const sort = args.sort === 'hot' ? 'hot' : 'floor';
        const page = Math.max(1, Math.floor(Number(args.page) || 1));
        const limit = Math.max(1, Math.min(50, Math.floor(Number(args.limit) || 30)));

        try {
          const { forum, posts } = await readThread(tid, { page, sort, limit });
          if (!posts.length) {
            return `帖子 ${tid} 没读到楼层：可能已被删、需要更高权限，或者这页没有内容。`;
          }
          // 服务端热度序并不严格，本地再按赞数压一遍，保证「高赞在前」名副其实
          if (sort === 'hot') posts.sort((a, b) => (b.likes - a.likes) || (a.floor - b.floor));
          return renderThread({ tid, forum, page, sort, posts });
        } catch (e) {
          if (e.code === 'NO_COOKIE') {
            return '还没配 BDUSS：把 cookie 里的 BDUSS 值写到 $DSH_HOME/tieba/BDUSS.txt（一行，纯值）。';
          }
          return `读帖失败：${e.message}`;
        }
      },
    },
    {
      name: 'tieba_sub_replies',
      description:
        '读贴吧某一层下面的楼中楼（子回复）。需要 pid —— 从 tieba_thread 的返回里拿' +
        '（`楼层号 → pid` 那几行）。返回每条子回复的作者、赞数和正文。',
      parameters: obj({
        tid: { type: 'string', description: '帖子 id（纯数字）' },
        pid: { type: 'string', description: '楼层 id，tieba_thread 返回里带' },
        url: { type: 'string', description: '帖子链接；给了就不用 tid' },
        page: { type: 'number', description: '第几页，默认 1' },
      }, ['pid']),
      async execute(args = {}) {
        const tid = parseTid(args.url) || String(args.tid || '').trim();
        const pid = String(args.pid || '').trim();
        if (!/^\d{6,}$/.test(tid)) return '需要帖子 tid 或链接。';
        if (!/^\d+$/.test(pid)) return '需要楼层 pid（tieba_thread 返回里带的那串数字）。';

        const page = Math.max(1, Math.floor(Number(args.page) || 1));
        try {
          const subs = await readSubReplies(tid, pid, { page });
          if (!subs.length) return `楼层 ${pid} 下没有读到楼中楼。`;
          return renderSubs({ tid, floor: pid, subs });
        } catch (e) {
          if (e.code === 'NO_COOKIE') {
            return '还没配 BDUSS：把 cookie 里的 BDUSS 值写到 $DSH_HOME/tieba/BDUSS.txt（一行，纯值）。';
          }
          return `读楼中楼失败：${e.message}`;
        }
      },
    },
  ];

  for (const t of tools) {
    const { execute, ...def } = t;
    ctx.effect(
      () => ctx.tools.register({
        ...def,
        output: { schema: {}, render: (_a, v) => asText(v) },
        execute,
      }),
      `dsh-tieba-read: ${t.name}`,
    );
  }
}

// 便于宿主 / 测试直接调用
export { readThread, readSubReplies, hasBduss, checkLogin };
