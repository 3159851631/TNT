# EXPLODINGTNT 个人网站

这是一个静态个人网站 + 浏览器后台：

- 别人打开只能看，不能改。
- 你自己打开 `/admin/`，登录后像填表一样改内容。
- 改完点发布，Cloudflare Pages 会重新生成网站，大约 1 分钟上线。

## 现在有什么

| 页面 | 内容 |
|---|---|
| `/` | 首页：大标题、精选作品、在做的东西、视频、图鉴入口、关于 |
| `/works/` | 作品档案，24 件，可按「场景 / 角色 / 游戏美术 / 3D / 插画」筛选 |
| `/projects/` | 项目时间线，从 2026 到 2025 |
| `/videos/` | B 站视频位（填入 BV 号后自动变成播放器） |
| `/codex/` | 图鉴总入口：两个世界 |
| `/codex/synthesis/` | 《魔物娘合成乐园》物品库：456 件物品、168 个配方，可搜索、看配方、反查用途 |
| `/codex/survival/` | 《魔物娘合身乐园》生存百科：目前 9 条结构示例，等飞书 wiki 导入 |
| `/about/` | 关于：简介、在做的事、技能 |
| `/resume/` | 简历：网页版，可直接下载 PDF / 打印 |
| `/admin/` | 内容后台（Sveltia CMS） |

## 本地预览

```powershell
cd F:\web\personal-site
npm install
npm run dev
```

打开 `http://127.0.0.1:4321/`。后台在 `http://127.0.0.1:4321/admin/`。

也可以直接双击 `启动预览.bat`（会自动构建并打开浏览器）。

只想看构建后的版本：

```powershell
npm run build
npm run preview
```

## 内容存在哪

| 文件 | 内容 |
|---|---|
| `src/data/works.json` | 作品列表 |
| `src/data/projects.json` | 项目列表 |
| `src/data/videos.json` | 视频列表 |
| `src/data/site.json` | 站名、介绍、社交链接 |
| `src/data/galgame-items.json` | 合成乐园物品库（从 Excel 自动生成，别手改） |
| `src/data/survival-codex.json` | 合身乐园生存百科（等飞书导入） |
| `scripts/import-feishu-docx.py` | 飞书 Word 导入脚本 |
| `public/resume.pdf` | 简历 PDF（由 `npm run resume:pdf` 生成） |
| `public/uploads/` | 图片 |
| `public/admin/` | 后台页面和配置 |

## 上线

见 [上线步骤.md](上线步骤.md)。

## 日常编辑

见 [使用说明.md](使用说明.md)。

## 飞书 wiki 怎么搬进来

见 [飞书导入说明.md](飞书导入说明.md)。

## 备份 / 回退

这个目录已经是 git 仓库。每次大改之前可以先提交一次：

```powershell
cd F:\web\personal-site
git add -A
git commit -m "改了什么"
```

回退到上一个提交：

```powershell
git reset --hard HEAD
```

回到最初版本：

```powershell
git log --oneline
git reset --hard <第一版的 commit>
```

另外有一份 zip 备份：`F:\web\personal-site-backup-20261019.zip`。

## 待替换清单

- [ ] 社交链接：B 站 / YouTube / X / Patreon / itch.io 的真实地址
- [ ] 首页 Hero 图和作品图（现在用的是你作品集里的图，已压缩）
- [ ] 关于页的真人照片或自画像（现在是 TNT 字标占位）
- [ ] 简历页是否写本名、邮箱、电话（现在只写 EXPLODINGTNT + 社交私信）
- [ ] 视频 BV 号
- [ ] 飞书 wiki 导入
- [ ] 域名（可以先用免费的 `xxx.pages.dev`）

## 技术

- Astro 5（静态站，500+ 个页面）
- Sveltia CMS（后台，本地打包在 `public/admin/sveltia-cms.js`，不依赖 CDN）
- Cloudflare Pages（托管，免费）
- 物品库从 Excel 自动生成，图标是游戏里的占位图，替换后会跟着更新
