// 最小 protobuf 编解码（只覆盖贴吧楼层 / 楼中楼两个接口用到的字段）

export const pbVarint = (n) => {
  const out = [];
  let v = BigInt(Math.trunc(Number(n)));
  while (v > 127n) { out.push(Number(v & 127n) | 128); v >>= 7n; }
  out.push(Number(v));
  return Buffer.from(out);
};
const pbTag = (no, wire) => pbVarint((no << 3) | wire);
export const pbInt = (no, n) => Buffer.concat([pbTag(no, 0), pbVarint(n)]);
export const pbStr = (no, s) => {
  const b = Buffer.from(String(s));
  return Buffer.concat([pbTag(no, 2), pbVarint(b.length), b]);
};
export const pbMsg = (no, b) => Buffer.concat([pbTag(no, 2), pbVarint(b.length), b]);

const readVarint = (buf, pos) => {
  let v = 0n, shift = 0n, p = pos;
  while (p < buf.length) {
    const b = buf[p++];
    v |= BigInt(b & 127) << shift;
    if (!(b & 128)) return { v: Number(v), p };
    shift += 7n;
    if (shift > 63n) break;
  }
  return { v: 0, p };
};

export function fields(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    const t = readVarint(buf, p);
    if (t.p === p) break;
    const no = Math.floor(t.v / 8);
    const wire = t.v & 7;
    p = t.p;
    if (wire === 0) {
      const r = readVarint(buf, p);
      out.push({ no, wire, v: r.v });
      p = r.p;
    } else if (wire === 2) {
      const l = readVarint(buf, p);
      p = l.p;
      out.push({ no, wire, b: buf.subarray(p, p + l.v) });
      p += l.v;
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
  }
  return out;
}

/** 楼层请求：/c/f/pb/page?cmd=302001 */
export function encodePageReq({ tid, pn = 1, rn = 50, sort = 0, bduss = '' }) {
  const common = Buffer.concat([pbInt(1, 2), pbStr(2, '12.64.1.1'), pbStr(10, bduss)]);
  return pbMsg(1, Buffer.concat([
    pbMsg(25, common),
    pbInt(4, Number(tid)),
    pbInt(5, 0),
    pbInt(6, Number(sort)),   // 0 按楼层 / 1 按热度
    pbInt(13, Number(rn)),
    pbInt(18, Number(pn)),
    pbInt(74, 1),
  ]));
}

/** 楼中楼请求：/c/f/pb/floor?cmd=302002 */
export function encodeFloorReq({ tid, pid = 0, pn = 1, bduss = '' }) {
  const common = Buffer.concat([pbInt(1, 2), pbStr(2, '22.12.1.0'), pbStr(10, bduss)]);
  const parts = [pbInt(1, Number(tid)), pbInt(4, Number(pn)), pbMsg(9, common)];
  if (pid) parts.push(pbInt(2, Number(pid)));
  return pbMsg(1, Buffer.concat(parts));
}

/**
 * 一段 content 的正文。
 *   g1=type（0 文本 / 2 表情 / 3 图片 / 18 话题）
 *   g2=text  g11=表情名
 */
function contentText(buf) {
  const fs = fields(buf);
  let type = 0;
  for (const g of fs) if (g.no === 1 && g.wire === 0) type = g.v;

  const parts = [];
  for (const g of fs) {
    if (g.wire !== 2) continue;
    // g11 是表情的中文名；g2 在表情片段里是 image_emoticonNN，不要
    if (g.no === 11) parts.push(`[${g.b.toString('utf8')}]`);
    else if (g.no === 2 && type !== 2) parts.push(g.b.toString('utf8'));
  }
  return parts.join('').trim();
}

/** 解析楼层列表 */
export function parsePage(buf) {
  const posts = [];
  for (const top of fields(buf)) {
    if (top.no !== 2 || !top.b) continue;
    for (const d of fields(top.b)) {
      if (d.no !== 6 || !d.b) continue;

      let pid = 0, floor = 0, subs = 0, likes = 0, subLikes = 0, author = '', time = 0;
      const contents = [];

      for (const f of fields(d.b)) {
        if (f.no === 1 && f.wire === 0) pid = f.v;
        else if (f.no === 3 && f.wire === 0) floor = f.v;
        else if (f.no === 4 && f.wire === 0) time = f.v;
        else if (f.no === 13 && f.wire === 0) subs = f.v;
        else if (f.no === 5 && f.wire === 2) contents.push(f.b);
        else if (f.no === 21 && f.wire === 2) {
          for (const g of fields(f.b)) if (g.no === 2 && g.wire === 2) author = g.b.toString('utf8');
        } else if (f.no === 37 && f.wire === 2) {
          for (const a of fields(f.b)) {
            if (a.wire !== 0) continue;
            if (a.no === 1) likes = a.v;
            if (a.no === 5) subLikes = a.v;
          }
        }
      }

      if (!floor) continue;
      posts.push({
        pid: String(pid),
        floor,
        author,
        likes,
        subReplies: subs,
        createdAt: time ? new Date(time * 1000).toISOString() : '',
        text: contents.map(contentText).filter(Boolean).join(''),
      });
    }
  }
  return posts;
}

/** 解析楼中楼 */
export function parseFloor(buf) {
  const subs = [];
  for (const top of fields(buf)) {
    if (top.no !== 2 || !top.b) continue;
    for (const d of fields(top.b)) {
      if (d.no !== 4 || !d.b) continue;

      let pid = 0, text = '', agree = 0, author = '', time = 0;
      for (const f of fields(d.b)) {
        if (f.no === 1 && f.wire === 0) pid = f.v;
        else if (f.no === 2 && f.wire === 2) text = contentText(f.b);
        else if (f.no === 3 && f.wire === 0) time = f.v;
        else if (f.no === 7 && f.wire === 2) {
          for (const g of fields(f.b)) if (g.no === 3 && g.wire === 2) author = g.b.toString('utf8');
        } else if (f.no === 9 && f.wire === 2) {
          for (const a of fields(f.b)) if (a.no === 1 && a.wire === 0) agree = a.v;
        }
      }

      if (!pid) continue;
      subs.push({
        pid: String(pid),
        author,
        agree,
        createdAt: time ? new Date(time * 1000).toISOString() : '',
        text,
      });
    }
  }
  return subs;
}
