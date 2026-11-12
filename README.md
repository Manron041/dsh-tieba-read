# dsh-tieba-read —— 读贴吧楼层

只做一件事：把贴吧帖子的**楼层回复**和**楼中楼**读出来。

## 为什么不用网页版

| 通道 | 结果 |
|---|---|
| `tieba.baidu.com/f?kw=` | 403 百度安全验证 |
| `tieba.baidu.com/mo/q/m?kz=` | 403 百度安全验证 |
| **`tiebac.baidu.com/c/f/pb/page?cmd=302001`** | **200，protobuf，楼层+赞数+楼中楼数** |
| **`tiebac.baidu.com/c/f/pb/floor?cmd=302002`** | **200，楼中楼+作者名** |

网页版那条路被 TLS 指纹和验证码卡死，App protobuf 通道不用浏览器、不用过滑块。

## 安装

```bash
# 从 GitHub
dsh plugin --profile <profile> add github:Manron041/dsh-tieba-read

# 本地开发
dsh plugin --profile <profile> add link:D:\work\dsh-tieba-read
```

装完**重启一次 dsh**，工具才会注册进来。

## 配置

把 BDUSS 写到 `$DSH_HOME/tieba/BDUSS.txt`（一行，纯值，不要 `BDUSS=` 前缀）：

```
C:\Users\<你>\.dsh\tieba\BDUSS.txt
```

也认环境变量 `TIEBA_BDUSS`。

**从哪拿**：Chrome 登录贴吧 → F12 → Application → Cookies → `tieba.baidu.com` → 找 `BDUSS`（或 `BDUSS_BFESS`）→ 复制 Value。192 字符左右，含大量 `A`，必须复制不要手打。

## 工具

### `tieba_thread`

```
{ url | tid, page?, sort?, limit? }
```

- `sort`: `floor`（楼层顺序，默认）| `hot`（按热度，高赞在前）
- `limit`: 每页层数，1–50，默认 30
- `page`: 从 1 开始

返回楼层号、赞数、楼中楼数、正文、pid（楼中楼要用）。

### `tieba_sub_replies`

```
{ tid, pid | floor }
```

读某一层下的所有子回复。`pid` 从 `tieba_thread` 的结果里拿。

## 输出示例

```
帖子 11060929398 · 原神吧 · 第1页 · 按楼层 · 30 层
#1 赞50  pid=153978766891  各位旅行者，最近肝得怎么样？……
#2  pid=153978770781  插眼
#3 楼中楼1  pid=153978781997  [滑稽]
#7  pid=153983970741  肝完了，就剩几个任务
```

## 已知边界

- 楼层正文提取率约 83%，剩下的是纯图片楼和纯表情楼
- 楼层不返回作者昵称（接口只给 uid）；楼中楼有昵称
- 每页最多 50 层，翻页靠 `page`
- 贴吧接口随时可能变，`lib/pb.mjs` 里的字段号就是那次变更的影响面

## 喂给 fishtalk

```bash
node feed.mjs "https://tieba.baidu.com/p/10568858008"          # 场合名默认用「XX吧」
node feed.mjs "https://tieba.baidu.com/p/10568858008" "生个女孩吧-楼中楼"
```

抓楼层 + 楼中楼，按吧名建场合，写进 fishtalk 语料库并重新蒸馏。重复的自动跳过。

**别用 `fishtalk_feed` 工具传中文**：在 Windows 上，工具入参里的中文会被按 GBK
解一遍，写进语料是 `鐢熶釜濂冲鍚` 这种乱码。`feed.mjs` 全程在 node 内部走 UTF-8，绕开这个问题。
