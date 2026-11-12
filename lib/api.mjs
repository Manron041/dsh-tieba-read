// 贴吧读取层：只有「楼层」和「楼中楼」，走 protobuf（tiebac.baidu.com）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodePageReq, encodeFloorReq, parsePage, parseFloor } from './pb.mjs';

const HOST = 'https://tiebac.baidu.com';
const UA = 'aiotieba/4.8.1';

/** BDUSS 来源：环境变量 > $DSH_HOME/tieba/BDUSS.txt > ~/.dsh/tieba/BDUSS.txt */
export function loadBduss() {
  const env = (process.env.TIEBA_BDUSS || '').trim();
  if (env) return env.replace(/^BDUSS=/, '');

  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const candidates = [
    path.join(home, 'tieba', 'BDUSS.txt'),
    path.join(os.homedir(), '.dsh', 'tieba', 'BDUSS.txt'),
  ];
  for (const p of candidates) {
    try {
      const v = fs.readFileSync(p, 'utf8').trim().replace(/^BDUSS=/, '');
      if (v) return v;
    } catch { /* 没有就下一个 */ }
  }
  return '';
}

export const hasBduss = () => loadBduss().length > 0;

/** 从链接或纯数字里取 tid */
export function parseTid(input) {
  const s = String(input || '').trim();
  if (/^\d{6,}$/.test(s)) return s;
  const m = /\/p\/(\d{6,})/.exec(s);
  if (m) return m[1];
  return '';
}

let lastAt = 0;
const GAP_MS = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const gap = Date.now() - lastAt;
  if (gap < GAP_MS) await sleep(GAP_MS - gap);
  lastAt = Date.now();

  const bduss = loadBduss();
  if (!bduss) {
    const e = new Error('没有贴吧 BDUSS：把 cookie 里的 BDUSS 值写到 $DSH_HOME/tieba/BDUSS.txt，或设环境变量 TIEBA_BDUSS');
    e.code = 'NO_COOKIE';
    throw e;
  }

  const form = new FormData();
  form.append('data', new Blob([body]), 'file');
  const res = await fetch(`${HOST}${path}`, {
    method: 'POST',
    headers: { 'user-agent': UA, 'x_bd_data_type': 'protobuf', cookie: `BDUSS=${bduss}` },
    body: form,
    signal: AbortSignal.timeout(25000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) {
    const e = new Error(`贴吧返回 HTTP ${res.status}`);
    e.code = 'HTTP';
    throw e;
  }
  // 错误响应是 JSON 而不是 protobuf
  if (buf.length < 300 && buf[0] === 0x7b) {
    let j = {};
    try { j = JSON.parse(buf.toString('utf8')); } catch { /* 保持空 */ }
    const e = new Error(`贴吧拒绝：${j.error_msg || '未知'}（${j.error_code ?? '?'}）`);
    e.code = 'API';
    throw e;
  }
  return buf;
}

/** 读一页楼层 */
export async function readThread(tid, { page = 1, sort = 'floor', limit = 30 } = {}) {
  const n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 30)));
  const pn = Math.max(1, Math.floor(Number(page) || 1));
  const sortNum = String(sort) === 'hot' ? 1 : 0;
  const buf = await post(
    '/c/f/pb/page?cmd=302001',
    encodePageReq({ tid: Number(tid), pn, rn: n, sort: sortNum, bduss: loadBduss() }),
  );
  return parsePage(buf);
}

/** 读某一层的楼中楼 */
export async function readSubReplies(tid, pid, { page = 1 } = {}) {
  const pn = Math.max(1, Math.floor(Number(page) || 1));
  const buf = await post(
    '/c/f/pb/floor?cmd=302002',
    encodeFloorReq({ tid: Number(tid), pid: Number(pid), pn, bduss: loadBduss() }),
  );
  return parseFloor(buf);
}

/** 登录态自检 */
export async function checkLogin() {
  const bduss = loadBduss();
  if (!bduss) return { configured: false, hint: '把 BDUSS 写到 $DSH_HOME/tieba/BDUSS.txt' };
  const res = await fetch('https://tieba.baidu.com/dc/common/tbs', {
    headers: { 'user-agent': UA, cookie: `BDUSS=${bduss}` },
    signal: AbortSignal.timeout(15000),
  });
  let j = {};
  try { j = await res.json(); } catch { /* 空 */ }
  return { configured: true, isLogin: String(j.is_login) === '1' };
}
