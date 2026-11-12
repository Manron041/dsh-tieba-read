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
帖子 11060929398 · 第1页 · 按楼层 · 30 层
#1   赞50  各位旅行者，最近肝得怎么样？活动奖励拿满了吗？……
#2   赞0   插眼
#3   赞0   [滑稽]
#7   赞0   肝完了，就剩几个任务
```

## 已知边界

- 楼层正文提取率约 83%，剩下的是纯图片楼和纯表情楼
- 楼层不返回作者昵称（接口只给 uid）；楼中楼有昵称
- 每页最多 50 层，翻页靠 `page`
- 贴吧接口随时可能变，`lib/pb.mjs` 里的字段号就是那次变更的影响面

## 给语料用

`tieba_thread` 返回的 `text` 直接喂 `fishtalk_feed`：

```
fishtalk_feed({ lines: [...正文], scene: "原神吧", source: "tieba" })
```
