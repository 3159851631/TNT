# -*- coding: utf-8 -*-
"""
把飞书导出的 Word (.docx) 转成网站的 codex JSON。

用法（在项目根目录 F:\\web\\personal-site 下）：

  # 一个 docx = 一页（最常见）
  python scripts/import-feishu-docx.py --input _import/xxx.docx --mode page --out src/data/survival-codex.json

  # 一个 docx 里：一级标题=分类，二级标题=条目
  python scripts/import-feishu-docx.py --input _import/wiki.docx --mode wiki --out src/data/survival-codex.json

  # 一个文件夹，每个 docx 一页；子文件夹名当分类
  python scripts/import-feishu-docx.py --input _import/wiki/ --mode folder --out src/data/survival-codex.json

不指定 --mode 时自动判断：文件夹=folder，单文件里一级标题>=2=wiki，否则=page。

图片会存到 public/uploads/wiki/，并写进 entry.images。
表格会自动识别成「属性表」或「配方表」。
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
from datetime import datetime

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from PIL import Image


# ---------- 基础工具 ----------

def clean(text):
    text = (text or "").replace("\u00a0", " ").replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def iter_blocks(doc):
    """按文档顺序同时产出段落和表格。"""
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield Table(child, doc)


def heading_level(paragraph):
    style = (paragraph.style.name if paragraph.style else "") or ""
    match = re.search(r"(?i)(heading|标题)\s*([1-6])", style)
    if match:
        return int(match.group(2))
    ppr = paragraph._p.pPr
    if ppr is not None:
        outline = ppr.find(qn("w:outlineLvl"))
        if outline is not None:
            try:
                return int(outline.get(qn("w:val"))) + 1
            except (TypeError, ValueError):
                pass
    return 0


def is_list(paragraph):
    style = (paragraph.style.name if paragraph.style else "") or ""
    return "list" in style.lower() or "列表" in style


def make_slug(title, used):
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    if not base:
        base = "entry-" + hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
    slug = base
    index = 2
    while slug in used:
        slug = f"{base}-{index}"
        index += 1
    used.add(slug)
    return slug


def extract_images(paragraph, doc, image_dir, prefix):
    urls = []
    for blip in paragraph._p.findall(".//" + qn("a:blip")):
        rid = blip.get(qn("r:embed"))
        if not rid:
            continue
        part = doc.part.related_parts.get(rid)
        if part is None:
            continue
        try:
            image = Image.open(io.BytesIO(part.blob))
        except Exception:
            continue
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        image.thumbnail((1600, 1600), Image.LANCZOS)
        digest = hashlib.sha1(part.blob).hexdigest()[:10]
        filename = f"{prefix}-{digest}.webp"
        os.makedirs(image_dir, exist_ok=True)
        image.save(os.path.join(image_dir, filename), "WEBP", quality=86)
        urls.append(f"/uploads/wiki/{filename}")
    return urls


def table_rows(table):
    rows = []
    for row in table.rows:
        cells = [clean(cell.text) for cell in row.cells]
        if any(cells):
            rows.append(cells)
    return rows


def parse_recipe(rows):
    if not rows:
        return []
    header = [cell.lower() for cell in rows[0]]
    name_col = next((i for i, cell in enumerate(header) if "材料" in cell), None)
    if name_col is None:
        return []
    qty_col = next((i for i, cell in enumerate(header) if "数量" in cell), None)
    recipe = []
    for row in rows[1:]:
        cell = row[name_col] if name_col < len(row) else ""
        if not cell:
            continue
        found = re.findall(r"([^+×xX]+?)\s*[×xX]\s*(\d+)", cell)
        if found:
            for name, qty in found:
                recipe.append({"name": clean(name), "qty": int(qty)})
        else:
            qty = 1
            if qty_col is not None and qty_col < len(row) and row[qty_col].isdigit():
                qty = int(row[qty_col])
            recipe.append({"name": clean(cell), "qty": qty})
    return recipe


def table_to_stats(rows):
    stats = []
    start = 0
    if rows:
        first = [cell.lower() for cell in rows[0]]
        if first and (first[0] in ("属性", "项目", "名称") or (len(first) > 1 and first[1] in ("值", "数值", "说明"))):
            start = 1
    for row in rows[start:]:
        if len(row) >= 2 and row[0]:
            stats.append([row[0], " · ".join(cell for cell in row[1:] if cell)])
    return stats


def new_entry(title, category, slug, image_dir):
    return {
        "slug": slug,
        "title": title,
        "category": category or "未分类",
        "summary": "",
        "icon": "",
        "stats": [],
        "recipe": [],
        "station": "",
        "body": [],
        "images": [],
    }


def finish_entry(entry):
    if not entry:
        return
    body = [line for line in entry["body"] if line]
    entry["body"] = body
    summary = next(
        (line for line in body if not line.startswith("### ") and not line.startswith("- ")),
        "",
    )
    entry["summary"] = summary[:120]
    for key, value in entry["stats"]:
        if "制作站" in key or "工作台" in key:
            entry["station"] = value
            break
    if not entry["station"]:
        for index, line in enumerate(body):
            if line.startswith("### ") and any(word in line for word in ("制作站", "工作台", "制作台")):
                if index + 1 < len(body):
                    entry["station"] = body[index + 1].lstrip("- ").strip()
                    break
            if line.startswith(("制作站：", "制作站:")):
                entry["station"] = line.split("：", 1)[-1].split(":", 1)[-1].strip()
                break


def handle_table(table, entry):
    rows = table_rows(table)
    if not rows:
        return
    recipe = parse_recipe(rows)
    if recipe:
        entry["recipe"] = recipe
        return
    entry["stats"].extend(table_to_stats(rows))


def add_paragraph(entry, paragraph, doc, image_dir, prefix):
    text = clean(paragraph.text)
    if text:
        if is_list(paragraph):
            entry["body"].append("- " + text)
        else:
            entry["body"].append(text)
    for url in extract_images(paragraph, doc, image_dir, prefix):
        entry["images"].append(url)


# ---------- 三种解析模式 ----------

def parse_wiki(path, default_category, image_dir):
    doc = Document(path)
    entries = []
    used = set()
    category = default_category or "未分类"
    current = None
    counter = 0

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            text = clean(block.text)
            level = heading_level(block)
            if level == 1 and text:
                category = text
                current = None
            elif level == 2 and text:
                counter += 1
                current = new_entry(
                    text, category, make_slug(text, used), image_dir
                )
                entries.append(current)
            elif level >= 3 and text and current:
                current["body"].append("### " + text)
            elif text and current:
                add_paragraph(current, block, doc, image_dir, f"wiki-{counter}")
            elif current:
                for url in extract_images(block, doc, image_dir, f"wiki-{counter}"):
                    current["images"].append(url)
        elif isinstance(block, Table) and current:
            handle_table(block, current)

    for entry in entries:
        finish_entry(entry)
    return entries


def parse_page(path, default_category, image_dir):
    doc = Document(path)
    stem = os.path.splitext(os.path.basename(path))[0]
    title = stem
    used = set()
    entry = new_entry(title, default_category, make_slug(title, used), image_dir)
    got_title = False

    for block in iter_blocks(doc):
        if isinstance(block, Paragraph):
            text = clean(block.text)
            level = heading_level(block)
            if level == 1 and text and not got_title:
                used.discard(entry["slug"])
                entry["title"] = text
                entry["slug"] = make_slug(text, used)
                got_title = True
            elif level >= 2 and text:
                entry["body"].append("### " + text)
            elif text:
                add_paragraph(entry, block, doc, image_dir, "page")
            else:
                for url in extract_images(block, doc, image_dir, "page"):
                    entry["images"].append(url)
        elif isinstance(block, Table):
            handle_table(block, entry)

    finish_entry(entry)
    return [entry]


def parse_folder(folder, default_category, image_dir):
    entries = []
    for root, dirs, files in os.walk(folder):
        for name in sorted(files):
            if not name.lower().endswith(".docx") or name.startswith("~$"):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(root, folder)
            category = default_category
            if rel not in (".", ""):
                category = rel.split(os.sep)[0]
            entries.extend(parse_page(path, category, image_dir))
    return entries


# ---------- 主程序 ----------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--game", default="魔物娘合身乐园")
    parser.add_argument("--mode", choices=["auto", "wiki", "page", "folder"], default="auto")
    parser.add_argument("--category", default="")
    parser.add_argument("--image-dir", default="public/uploads/wiki")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        sys.exit(f"找不到输入：{args.input}")

    mode = args.mode
    if mode == "auto":
        mode = "folder" if os.path.isdir(args.input) else "page"
        if os.path.isfile(args.input):
            doc = Document(args.input)
            h1 = sum(1 for block in iter_blocks(doc) if isinstance(block, Paragraph) and heading_level(block) == 1)
            if h1 >= 2:
                mode = "wiki"

    if mode == "folder":
        entries = parse_folder(args.input, args.category, args.image_dir)
    elif mode == "wiki":
        entries = parse_wiki(args.input, args.category, args.image_dir)
    else:
        entries = parse_page(args.input, args.category, args.image_dir)

    data = {
        "game": args.game,
        "source": f"飞书 Word 导入 · {os.path.basename(args.input)}",
        "importedAt": datetime.now().isoformat(timespec="seconds"),
        "entries": entries,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)

    categories = sorted({entry["category"] for entry in entries})
    images = sum(len(entry["images"]) for entry in entries)
    print(f"MODE {mode}")
    print(f"ENTRIES {len(entries)}  CATEGORIES {len(categories)}  IMAGES {images}")
    print("CATEGORIES", categories)
    for entry in entries[:12]:
        print(
            f"- {entry['category']} / {entry['title']} "
            f"(stats {len(entry['stats'])}, recipe {len(entry['recipe'])}, images {len(entry['images'])})"
        )
    print("OUT", os.path.abspath(args.out))


if __name__ == "__main__":
    main()
