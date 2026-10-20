# 导入脚本

## `import-feishu-docx.py`

把飞书导出的 Word (.docx) 转成网站的 codex JSON。

需要 Python 3 + `python-docx` + `Pillow`。这台机器的 DSH Python 已经装好。

### 三种用法

```powershell
# 1) 一个 docx = 一页（最常见）
python scripts/import-feishu-docx.py `
  --input _import/夜行兽.docx `
  --mode page `
  --category 生物 `
  --out src/data/survival-codex.json

# 2) 一个 docx 里：一级标题 = 分类，二级标题 = 条目
python scripts/import-feishu-docx.py `
  --input _import/wiki.docx `
  --mode wiki `
  --out src/data/survival-codex.json

# 3) 一个文件夹，每个 docx 一页；子文件夹名当分类
python scripts/import-feishu-docx.py `
  --input _import/wiki/ `
  --mode folder `
  --out src/data/survival-codex.json
```

不写 `--mode` 时自动判断：
- 文件夹 → folder
- 单文件里一级标题 ≥ 2 → wiki
- 其他 → page

### 会识别什么

| Word 里的东西 | JSON 里的东西 |
|---|---|
| 一级标题 / 二级标题 | 分类 / 条目标题 |
| 三级标题 | 正文小标题 |
| 普通段落 | `body` |
| 项目符号列表 | `body` 里以 `- ` 开头 |
| 两列表格（属性/值） | `stats` |
| 带「材料 / 数量」的表格 | `recipe` |
| 「制作站」小节或表格 | `station` |
| 图片 | 存到 `public/uploads/wiki/`，写进 `images` |

### 注意

- 中文标题的 slug 会用 `entry-` + 8 位哈希，保证 URL 稳定；想改可以在 JSON 里手改。
- 扫描件/图片型 PDF 不能直接转文字，需要先 OCR 或重新导出 Word。
- 导入前建议先备份现有 `src/data/survival-codex.json`。
