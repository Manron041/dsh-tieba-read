// 模拟宿主调用两个工具，看真实输出
import { apply } from './index.js';

const tools = new Map();
const ctx = {
  effect: (fn) => fn(),
  tools: { register: (t) => { tools.set(t.name, t); return () => {}; } },
};
apply(ctx);

console.log('注册的工具:', [...tools.keys()].join(', '), '\n');

const thread = tools.get('tieba_thread');
const subs = tools.get('tieba_sub_replies');

const r1 = await thread.execute({ url: 'https://tieba.baidu.com/p/11060929398', page: 1, sort: 'floor', limit: 20 });
console.log('──────── tieba_thread (floor) ────────');
console.log(r1);

const r2 = await thread.execute({ tid: '11060929398', sort: 'hot', limit: 10 });
console.log('\n──────── tieba_thread (hot) ────────');
console.log(r2);

const r3 = await subs.execute({ tid: '11060929398', pid: '154029808173' });
console.log('\n──────── tieba_sub_replies ────────');
console.log(r3);
