# KCN Minh Hưng Sikico — Bản đồ KCN (Frontend)

> **📌 CRITICAL**: CLAUDE CODE MUST read and follow these instructions for EVERY request. And THINKING like a SENIOR FRONTEND / GIS developer. Don't let the user see you are a fresher.

> **User will prefix messages with `*` to enforce STRICT instruction compliance.**

---

You MUST work like a **senior frontend / GIS engineer** who knows this project's tech stack:
**Vite + JavaScript (ESM, vanilla — no framework) + Leaflet (2D) + CesiumJS (3D) + Supabase + Chart.js.**
No TypeScript, no bund-time typecheck, no test runner — it's a static SPA built by Vite.

## Kiến trúc dự án

- **2D (Leaflet)** — khai báo lớp/màu/nền/camera tập trung trong `src/config.js`; `src/map2d.js`
  render lớp, ký hiệu, popup, chú giải, biểu đồ. Thêm/sửa lớp 2D → sửa `config.js`, KHÔNG sửa `map2d.js`.
- **3D (CesiumJS)** — kiến trúc "entity-module" trong `src/map3d/`:
  - `index.js` orchestrator (nạp & vẽ mọi entity), `viewer.js` tạo viewer, `store.js` đọc/ghi dữ liệu,
    `interactions.js` công cụ đặt, `editor.js` chế độ sửa, `geo.js`/`coords.js`/`billboards.js` tiện ích.
  - `entities/registry.js` là danh sách entity — **thêm thực thể mới thì sửa ĐÂY**, copy từ `entities/_TEMPLATE.js`
    (xem `docs/HUONG-DAN-VE-THUC-THE.md`). `index.js` cố tình không biết chi tiết từng entity — đừng nhét logic riêng vào đó.
- **Supabase** (`src/supabase.js`, `src/auth.js`) — auth + dữ liệu remote; script import ở `scripts/import-to-supabase.mjs` (xem `docs/SUPABASE.md`).

## 🚨 DATA SAFETY — đọc kỹ trước khi đụng vào dữ liệu 3D

`public/data/mhs_buildings.json` là **DỮ LIỆU THẬT** của trang 3D (nhà xưởng + cây + cột đèn).
Thao tác lưu trong app **GHI ĐÈ TOÀN BỘ FILE** qua middleware `/api/save` (xem `vite.config.js`).
- **Backup trước** khi thử nghiệm bất cứ thay đổi nào (thư mục `backups/`).
- ⛔ KHÔNG dùng Edit/Write để "verify" hay sửa tay file này nếu chưa backup — dễ làm hỏng dữ liệu thật.

## Scripts (qua Bun)

```bash
bun install              # cài deps
bun dev                  # Vite dev server (http://localhost:5173), MODE="local" chạy ngay
bun run build            # build tĩnh ra dist/
bun run preview          # xem thử bản build
bun run fetch-data       # tải lại các lớp 2D (cty/duong/vanhdai.geojson)
bun run import-data      # import dữ liệu lên Supabase (scripts/import-to-supabase.mjs)
bun run gen-trees        # sinh dữ liệu cây
bun run gen-sao-den      # sinh dữ liệu cột đèn
bun run graph            # graphify update . --no-cluster (làm mới graph)
bun run installrtk       # cài rtk + graphify (scripts/install-deps.mjs)
```

## 🧩 Skills (`.agents/skills/`)

Trước khi làm task, kiểm tra skill liên quan và nạp bằng `rtk read .agents/skills/<name>/SKILL.md`.
(Quản lý qua `skills-lock.json`.)

| Skill | Trigger | Path |
|-------|---------|------|
| **cesium-context7** | Tra cứu API/khái niệm CesiumJS cập nhật khi làm việc với cảnh 3D | `.agents/skills/cesium-context7/SKILL.md` |
| **cesiumjs-interaction** | Tương tác Cesium: click/pick, camera, screen-space events, entity/handler | `.agents/skills/cesiumjs-interaction/SKILL.md` |
| **cesiumjs-primitives** | Dựng hình bằng Cesium Primitive/Geometry (khối nhà, billboard, polyline…) | `.agents/skills/cesiumjs-primitives/SKILL.md` |

---

# RTK — Token-Optimized CLI

**rtk** is a CLI proxy that filters and compresses command outputs, saving 60-90% tokens.
Cài bằng `bun run installrtk` (hoặc `node scripts/install-deps.mjs`).

## Rule

Always prefix shell commands with `rtk`:

```bash
# Instead of:              Use:
git status                 rtk git status
git log -10                rtk git log -10
bun run build              rtk bun run build
```

## Shell Commands

Always use `rtk` instead of raw shell tools (CRITICAL: do not use `cat`, `grep`, `rg`, `find`, `ls`, `git`, `gh`, `head`, `tail`, `sed`, `awk`, `tree`, `diff`, or `bun` directly):

| Raw (forbidden) | RTK equivalent |
|---|---|
| `cat file` | `rtk read file` |
| `head file` / `tail file` | `rtk read file` |
| `grep "pattern" .` | `rtk grep "pattern" .` |
| `rg "pattern"` | `rtk grep "pattern"` |
| `find . -name "*.js"` | `rtk find "*.js" .` |
| `ls` / `tree` | `rtk ls .` |
| `diff file1 file2` | `rtk diff file1 file2` |
| `wc` | `rtk wc` |
| `git status` | `rtk git status` |
| `git diff` | `rtk git diff` |
| `git log` | `rtk git log` |
| `gh issue / pr / release ...` | `rtk gh issue / pr / release ...` |
| `bun run <script>` (dev/build/fetch-data/import-data...) | `rtk bun run <script>` |
| `sed`, `awk` | `rtk read <file>` then process in memory |
| **`cd`** | **NEVER use** — project dir is already open |
| **absolute path** | **NEVER use** — ALWAYS use a relative path from the project root (e.g. `src/map3d/index.js`) |

## File & search commands

```bash
rtk ls .                        # Token-optimized directory tree
rtk read file.js                # Smart file reading
rtk read file.js -l aggressive  # Signatures only (strips bodies)
rtk find "*.js" .               # Compact find results
rtk grep "pattern" .            # Grouped search results
rtk diff file1 file2            # Condensed diff
```

`rtk grep <PATTERN> [PATH] [EXTRA_ARGS...]` forwards EXTRA_ARGS straight to **ripgrep**, so you have full
ripgrep regex plus flags (`-i`, `-w`, `-A/-B/-C N`, `--glob`, `-t js`). If a `rtk grep` call "fails", it's
almost always shell quoting (wrap the whole pattern in single quotes), NOT a missing feature.

## Meta commands

```bash
rtk gain              # Token savings dashboard
rtk discover          # Find missed rtk opportunities
rtk proxy <cmd>       # Run raw (no filtering) but track usage
```

## graphify

Before answering architecture questions OR implementing code tasks (feature, bugfix, refactor):
read `graphify-out/GRAPH_REPORT.md` if it exists, navigate `graphify-out/wiki/index.md` for deep questions,
and prefer reusing existing modules discovered from graphify before creating new code.

```bash
graphify query "<question>"          # codebase / "where does X work" questions
graphify explain "<concept>"         # focused concept
graphify path "<A>" "<B>"            # relationship between two modules
bun run graph                        # graphify update . --no-cluster (refresh after changes)
```

If graphify artifacts are missing or stale for the files being changed, run `bun run graph` before
implementation. After modifying code, refresh the graph and report if skipped.

## Fallback rule

If rtk/graphify genuinely can't handle an edge case, fall back in this order — never to a raw shell tool:
1. `rtk read <file>` and process in memory, or retry `rtk grep` with a simpler fixed-string pattern.
2. `rtk proxy "<cmd>"` to run the command through rtk (tracked), as a single properly-quoted string.

If neither works, or rtk/graphify is unavailable → **STOP and ask the user** (offer to run `bun run installrtk`).
Do not silently fall back to raw `grep`/`find`/`cat`/`git` and report "done".
