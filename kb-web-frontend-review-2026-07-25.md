# KB Web 前端全量审查报告

> 2026-07-25 · 审查对象：`~/project/KnowledgeBase/web`（Next.js 15 + React 19 RC + Tailwind，基于 Horizon UI Pro 3.0.0）
> 审查方式：两路并行逐文件精读（性能与架构 / UI 与模板对齐）+ 实测 `npx tsc --noEmit`；未跑 `next build`、未启动 dev server，运行时行为（如 pdf.js 实际请求模式）未实测，相关条目已注明。
> 对照基准：`~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main`

---

## 0. 审查范围与方法

先用 `diff -rq` 比对模板原版，确认**模板原始代码零改动**，自定义代码边界清晰：

| 类别 | 文件 |
|---|---|
| 被修改的模板文件 | `src/routes.tsx`、`src/app/page.tsx`、`src/app/admin/page.tsx`、`tailwind.config.js`（仅 +1 行 typography 插件） |
| 新增页面（10） | `src/app/admin/kb/` 下：domains、ask、`[domain]`、`[domain]/[doc]`、graph、search、review、jobs、`jobs/[job]`、upload |
| 新增 API 路由（6） | `src/app/api/kb/` 下：domains、file、docs、search、doc、pages |
| 新增组件（9） | `src/components/admin/kb/` 下：reader/{MarkdownReader, DocMetaPanel, PdfViewer, LangTabs}、KbState、domains/DomainCard、doc-list/DocTable、jobs/{JobStatusBadge, UploadDropzone} |
| 新增库与类型 | `src/lib/kb/{server,ingest,client,useKbFetch}.ts`、`src/types/{kb,ingest}.d.ts` |

自定义代码共约 2,200 行。`src/app/layout.tsx`、`src/app/admin/layout.tsx`、`src/app/AppWrappers.tsx`、`src/styles/App.css` 与模板完全一致。

**模板设计规范基准**（已在模板中逐字核实）：

- Card：`rounded-[20px] bg-white shadow-3xl shadow-shadow-100 dark:!bg-navy-800 dark:text-white`（`card/index.tsx:10-14`）
- 文字：主文字 `text-navy-700 dark:text-white`；次要文字 `text-gray-600`（模板惯例不带 dark 变体）
- 按钮：`linear rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200`
- 色板注意点：模板重定义了 `red-50=#ee5d501a`、`green-50=#05cd991a`（半透明），而 `blue-50/orange-50/teal-50/gray-50` 仍是近白实色——影响暗色徽章表现（见 UI 🟡-2）

---

## 1. 性能与架构问题

### 🔴 严重

#### 1.1 上传页开关行为与视觉完全相反（bug，tsc 已报错佐证）

- 位置：`src/app/admin/kb/upload/page.tsx:71-79`、`src/components/fields/SwitchField.tsx:3-12`
- 问题：给 `SwitchField` 传 `checked={layout}`，但该组件 props 类型与实现都只透传 `onChange`，`checked` 被静默丢弃（tsc 实测报错 TS2322）。底层 Switch 是非受控 checkbox，初始不勾选，而 `layout` state 初值为 `true`。
- 影响：UI 显示"关"，实际按 `layout=true` 提交 → 用户不知情下触发"耗时较长、CPU 占用高"的 zh.pdf/dual.pdf 生成；用户主动打开开关反而把 `layout` 置为 false，**视觉与行为完全相反**。
- 修复：upload 页改用 `components/switch` 直传 `defaultChecked={layout}` 且 `onChange={(e) => setLayout(e.target.checked)}`；或给 SwitchField 增加 `checked` 透传。

#### 1.2 自定义代码 4 处 tsc 类型错误，`next build` 类型检查阶段存在失败风险

实测 `npx tsc --noEmit` 输出中属于自定义代码的：

- `src/app/api/kb/file/route.ts:11` — `Readable.toWeb` 在 `@types/node@12.20.55`（实际安装版本）下不存在。Node 18+ 运行时没问题，但类型层面是错的。
- `src/app/admin/kb/upload/page.tsx:77` — 即 1.1 的 SwitchField。
- `src/app/admin/kb/graph/page.tsx:57` — `ForceGraph2D` 不能用作 JSX 组件。
- `src/components/admin/kb/reader/MarkdownReader.tsx:9` — `ReactMarkdown` 不能用作 JSX 组件。

后两者根因是 **@types/react 双版本**：根 `node_modules/@types/react@18.3.31` 与 `node_modules/@types/react-dom/node_modules/@types/react@18.0.31` 并存（resolutions 钉了 18.0.31 但没钉住嵌套副本），导致 `ReactNode`/`Key` 类型互不兼容。

- 影响：Next 15 build 默认执行全项目类型检查，这些错误大概率阻断生产构建（模板遗留文件还有 MasterCard/Mastercard 大小写、charts 等错误，同样会被检查）。
- 修复：统一 `@types/react`/`@types/react-dom` 到单一版本；`@types/node` 升到 18+；确认一次 `next build` 的真实表现。

#### 1.3 搜索页在途请求竞态（正确性 bug）

- 位置：`src/app/admin/kb/search/page.tsx:28-40`
- 问题：debounce 的 cleanup 只 `clearTimeout`，已发出的 fetch 不取消。输入"A"触发慢请求后改输"AB"，若 A 的响应后到，会用旧结果覆盖新结果（`setHits(data)` 无守卫）。
- 影响：搜索结果与输入框不一致；后端是同步全语料扫描（见 🟡-2），慢响应完全可能乱序。
- 修复：effect 内加 `let cancelled = false` + cleanup 置位，或用 `AbortController` 取消在途请求。

#### 1.4 任务详情页 SSE 每个 chunk 完成都全量重拉（请求风暴）

- 位置：`src/app/admin/kb/jobs/[job]/page.tsx:60-67`
- 问题：`chunk_done` 事件触发 `reload()`，即完整 `GET /api/v1/jobs/:id`（响应含全部 chunks 明细）。100 块的文档在 translate 阶段产生 100+ 次全量拉取，且与 SSE 高频 `progress` 事件并行。
- 影响：自制造的 O(N²) 流量（每次响应体还随块数增长），翻译阶段 UI 持续重渲染。
- 修复：`chunk_done` 只更新本地进度计数（progress 事件已带 total），`reload()` 限流（如 2s 节流）或仅在 `stage_start/stage_done/error/end` 时全量刷新。

### 🟡 中

#### 2.1 全站零 SSR：读侧页面本可 RSC 直读文件系统，现在是"浏览器 → Next API 路由 → fs"双跳

- 位置：`src/app/AppWrappers.tsx:16-18,47`（模板用 `dynamic(..., { ssr: false })` 包裹整个应用），10 个 KB 页面全部 `'use client'`。
- 问题：domains/docs/doc/search 的数据源就是本机文件系统（`lib/kb/server.ts`），完全可以在 Server Component 里直接 `import { listDocs } from 'lib/kb/server'`，省掉 API 往返、loading 闪屏和 useKbFetch 样板。
- 影响：首屏必经"空壳 HTML → JS 水合 → fetch → 二次渲染"；无 SSR/缓存可言；`src/app/admin/kb/` 下也没有 `loading.tsx`/`error.tsx` 路由边界。
- 修复：读侧页面改 async Server Component + 路由级 `loading.tsx`，交互部件（DocTable、PdfViewer）保持客户端；长期可拆掉 AppWrappers 的 NoSSR。

#### 2.2 API 路由同步阻塞 + 全语料扫描，无任何缓存

- 位置：`src/lib/kb/server.ts`
- 问题：
  - `listDomains()`（:96-114）每次请求读 `config.yaml` + 遍历所有域所有文档的 `meta.yaml`/`terms.csv`；domains 总览和 upload 页都会调用。
  - `searchKb()`（:181-205）每次请求把每个域每篇 `zh.md` 整个 `readFileSync` 进内存逐行 `toLowerCase`。
  - 全部 fs 调用同步，阻塞 Node 事件循环，会拖慢并发的 file 流式响应等其他路由。
- 影响：当前本地小规模可用，语料增长后每次搜索/列表都是 O(全语料) 磁盘 IO；JSON 路由也没有 Cache-Control/mtime 校验。
- 修复：按 mtime 做内存缓存或 `unstable_cache`；搜索改为预建索引（或移交 FastAPI 侧）；fs 调用改 `fs/promises`。

#### 2.3 阅读器在 PDF/对照视图下仍全量拉取 markdown，且切视图触发无谓 refetch

- 位置：`src/app/admin/kb/[domain]/[doc]/page.tsx:37-46`、`src/lib/kb/useKbFetch.ts:23`
- 问题：`textVariant = pdfKind || isCompare ? 'zh' : view`：点任一 PDF tab 也会下载整篇 zh.md；从 `en` 视图切到 `pdf` 视图时 textVariant 变成 `zh`，触发一次完整 refetch，useKbFetch 还会把 `data` 清空导致 LangTabs 短暂消失。
- 影响：大文档在 PDF 视图白拉数百 KB；切 tab 闪烁。
- 修复：拆出 meta-only 轻端点（variants/pdfs/hasPages/meta），markdown 仅在文本视图按需取；useKbFetch 支持 keep-previous-data。

#### 2.4 双数据源架构不一致，INGEST_BASE 硬编码 localhost

- 位置：`src/lib/kb/ingest.ts:5-6`、`ask/page.tsx:20`、`graph/page.tsx:29`、`review/page.tsx:26,40`
- 问题：读侧走 `/api/kb/*`（Next 路由读 fs），而 ask/graph/review/jobs 全部从浏览器**直连** `http://localhost:8794`。注：`next.config.js` 实际**没有任何 rewrites**。
- 影响：部署到非本机即坏（localhost 指向用户机器）；依赖 FastAPI 开 CORS；HTTPS 站点会混合内容拦截；故障面不统一。
- 修复：统一走 Next API 路由代理（SSE 可用路由转发），`INGEST_BASE` 默认值改为相对路径 + rewrites。

#### 2.5 jobs 列表轮询的三个问题

- 位置：`src/app/admin/kb/jobs/page.tsx:21-35`
- 问题：a) 5s `setInterval` 无重叠保护（慢请求会叠加，建议递归 setTimeout）；b) 标签页隐藏时继续轮询（可监听 visibilitychange）；c) `:35` `if (error) return <KbError/>` 在已有列表数据时，一次瞬时失败就把整页换成错误屏。
- 修复：成功才清 error；有数据时错误降级为角标；加 in-flight 守卫。

#### 2.6 KB 首屏公共 bundle 被布局层拖入 Chakra/Emotion

- 位置：`src/app/admin/layout.tsx:13`（`@chakra-ui/portal`）+ `src/components/navbar/Configurator.tsx:8-9`（`@chakra-ui/modal`、`@chakra-ui/hooks`）+ `src/components/sidebar/index.tsx`（react-custom-scrollbars-2）。
- 问题：Navbar/Sidebar 在每个 admin 页面加载，即每个 KB 页首屏都含 Chakra+Emotion(+framer-motion) 运行时。
- 做得好的地方：`react-force-graph-2d` 已 `dynamic ssr:false`（graph/page.tsx:9-11），react-pdf/react-markdown 只在各自路由 chunk（路由级分包生效）。
- 修复：Configurator（主题调试器）可从生产 Navbar 移除或 dynamic；Portal 可换 React 原生 `createPortal`。

#### 2.7 模板遗留依赖与死代码仍在构建/类型检查范围内

- 位置：`package.json` 仍带 apexcharts、mapbox-gl/react-map-gl、@fullcalendar/*、@dnd-kit/*、framer-motion、react-calendar、rc-slider、react-router-dom、next-transpile-modules、@babel/traverse 等；`src/components/admin/dashboards/*`、`src/components/admin/main/*`、`src/components/charts/*` 等模板组件（路由已删，页面不存在）仍被 `tsconfig include` 检查。
- 影响：不进运行时 bundle（未被路由引用），但拖慢 install/类型检查/构建，并持续制造类型噪音（tsc 错误的一半来自它们）；React 19 RC + @types/react 18 的混用也源于此依赖堆。
- 修复：删除未引用模板组件与对应 dependencies；对齐 React/types 版本。

#### 2.8 useKbFetch 无缓存/去重，切依赖即清空

- 位置：`src/lib/kb/useKbFetch.ts:21-35`
- 问题：deps 变化即 `setState({data:null,loading:true})`（无 keep-previous），无跨页面缓存（domains 在总览页和 upload 页各拉一次，来回导航重复拉）。
- 修复：换 SWR/TanStack Query，或至少在 hook 内保留前次 data。

#### 2.9 表格组件的渲染与分页细节

- 位置：`src/components/admin/kb/doc-list/DocTable.tsx:40-104` columns 每次渲染重建（应 useMemo）；:106-109 `pageSize` 硬编码 6 且不可调；:212-226 页码按钮随页数无上限渲染。`jobs/page.tsx:52-113` 任务表完全无分页，历史任务增长后全量渲染。
- 修复：columns useMemo；页码做窗口截断；jobs 表加分页或服务端 limit。

### 🔵 低

- `graph/page.tsx:28-36` fetch 无 cleanup（卸载后 setState）；`:22,24` state 为 `any`；react-force-graph 会原地 mutate `graphData`（直接传 state 对象，重渲染语义不干净）。
- `ask/page.tsx:20-33`、`review/page.tsx:25-51` 直连 fetch 无 AbortController；ask 域硬编码 `ai-engineering`（:23）；30-60s 查询无超时。
- `UploadDropzone.tsx:41` 文案"最大 200MB"但未设 `maxSize`；`ingest.ts:17-29` 大文件上传无进度/超时。
- `PdfViewer.tsx`：:7 引入 AnnotationLayer.css 但 :165 `renderAnnotationLayer={false}`（死 CSS）；:25,137-142 占位高度统一取第 1 页宽高比，横竖混排 PDF 滚动会跳；:88 `cMapUrl: undefined` 等于没配置 CMaps，部分 CJK PDF 文本层可能缺字形（建议 `cMapUrl` + `cMapPacked`，未实测）；url 切换时 `numPages`/`visible` 短暂残留。
- `file/route.ts`：:64-69 所有异常一律 404（fs 故障应 500）；:27 statSync 与 :52 createReadStream 之间存在 TOCTOU；Range 解析 :41-45 不支持后缀范围 `bytes=-N`（会错误返回前 N+1 字节，触发面小但出错即静默错数据）——接近 🟡。
- `jobs/[job]/page.tsx:38,53` `esRef` 赋值后从未使用（死代码）；`ingest.d.ts:13` `cost_usd: number` 与调用处 `?? 0` 契约漂移；`KbIngestEvent` 定义未使用。
- `jobs/page.tsx:25` 逗号表达式 `(setJobs(data), setError(null))` 可读性差。
- `search/page.tsx:69-71` 列表用索引做 key。
- `next.config.js`：:11 `swcMinify` 在 Next 15 已移除（无效配置）；:20-24 `images.domains` 已弃用（应 `remotePatterns`）。
- `tsconfig.json` `strict:false` + `strictNullChecks:false` + `noImplicitAny:false`，是 `(e: any)`、`catch (err: any)` 泛滥的温床；自定义代码里 any 约 10 处。
- `MarkdownReader` 未 memo：对照阅读翻页（`[doc]/page.tsx:70,92`）时父组件重渲染会重解析同一份 markdown。
- `DocMetaPanel.tsx:23` `ingestedAt.slice(0,10)` 假设 ISO 格式，非 ISO 数据会显示截断乱码。

### 架构总评

这是一套"内部工具取向、完成度不错"的自定义层：API 路由用目录白名单（`assertDomain`/`assertDoc`）防路径穿越的做法扎实，file 路由的 ETag/Range/流式响应相当专业，PdfViewer 的 IntersectionObserver 虚拟化思路正确，useKbFetch/ingest.ts 的统一封装也让页面代码很干净。主要问题是方向性的：继承了模板 AppWrappers 的全站 NoSSR 之后，又把读侧页面全部客户端化，在本可以 RSC 直读本机文件系统的场景里叠了"浏览器→Next API→同步 fs"三层，且无任何缓存；同时读侧（Next/fs）与写侧（浏览器直连 FastAPI :8794）双数据源并存，部署模型脆弱。依赖层面，React 19 RC + @types/react 18 双版本 + 大量模板遗留死依赖，已经造成实测 tsc 错误并有阻断生产构建的风险。

---

## 2. UI/UX 一致性与模板对齐

### 已核实对齐的部分

- `tailwind.config.js` 与模板仅 1 行差异：新增 `require('@tailwindcss/typography')` 插件，纯增量零风险，正是 `MarkdownReader` 的 `prose` 类所需。✅
- DocTable 复刻模板 `SearchTableOrders.tsx`（搜索框/表格/分页类名完全一致，且顺手修了模板 `slice(0,7)` 只渲染 7 行和 debug 开关的问题）；LangTabs 复刻 `CourseInfo.tsx` tabs（类名逐字一致）；状态徽章沿用 order-list 的 `bg-green-100 dark:bg-green-50` 惯例。
- Card 容器、navy/brand 令牌、`text-gray-600` 次要文字惯例、按钮类名、`mt-3` 页边距、`md:/xl:` 网格断点全部对齐模板。
- 无 `style={{color:...}}` 内联色值；除 graph canvas 必需的 hex 外无裸 `text-blue-500` 式用色。
- `src/routes.tsx` 整体替换为单个「知识库」collapse 组，结构与 `IRoute` 完全吻合，sidebar 折叠组渲染、`getActiveRoute` 均正常；动态页未注册时 navbar 品牌名通过父级 `/kb` 子串匹配回落为「知识库」，行为得体。**机制未破坏** ✅
- `src/app/page.tsx` / `src/app/admin/page.tsx` 仅重定向目标改为 `/admin/kb/domains`，目标页存在。✅

### 🔴 严重

#### 3.1 review 页暗色下破版

- 位置：`src/app/admin/kb/review/page.tsx:77、81`
- 问题：新旧断言正文 `text-navy-700` 没有 `dark:text-white`。暗色下外层是 `dark:bg-red-50`（半透明红）叠在 `navy-800` 卡片上，`#1B254B` 深蓝文字压在深底色上几乎不可读。
- 模板基准：所有卡片内主文字均为 `text-navy-700 dark:text-white`。
- 修复：两处补上 `dark:text-white`。

### 🟡 中

#### 3.2 JobStatusBadge 暗色下徽章家族风格不统一

- 位置：`src/components/admin/kb/jobs/JobStatusBadge.tsx:5-11`
- 问题：组件沿用模板 `bg-x-100 dark:bg-x-50` 惯例，但模板色板里只有 `red-50/green-50` 是半透明色；`blue-50/orange-50/teal-50/gray-50` 是近白实色。暗色下「完成/失败」是半透明染色胶囊，「处理中/已取消/跳过/排队中」是亮白色块，同一表格里视觉割裂。
- 修复：暗色统一改半透明，如 `dark:bg-blue-500/20`（或对非红绿状态统一 `dark:bg-white/10`）。

#### 3.3 jobs 列表页轮询瞬时错误清掉整页

- 位置：`src/app/admin/kb/jobs/page.tsx:35`
- 问题：`if (error) return <KbError/>`：5 秒轮询中任何一次网络抖动都会把已渲染的任务列表整页替换成错误卡。同项目 `review/page.tsx:53` 和 `jobs/[job]/page.tsx:91` 都用 `if (error && !items)` 保内容，jobs 列表页与它们不一致。
- 修复：改为 `if (error && !jobs)`，错误以行内提示呈现。

#### 3.4 search 页错误卡嵌套在 Card 内

- 位置：`src/app/admin/kb/search/page.tsx:60`
- 问题：`KbError` 自身渲染一张带阴影的 Card，此处嵌在搜索结果 Card 内部形成「卡中卡」；而 ask/upload/review 页都把 KbError 放在顶层。
- 修复：在搜索页内联渲染错误文字（`text-sm font-bold text-red-500`），或把 KbError 移到 Card 外。

#### 3.5 routes.tsx 改动的副作用：auth 页运行时会崩

- 位置：`src/components/navbar/NavbarAuth.tsx:25-34`
- 问题：`getLinks('Dashboards')`/`getLinks('NFTs')`/`getLinksCollapse('Main Pages')` 按硬编码路由名取 `foundRoute[0].items`；KB 版 routes 只剩「知识库」一组，`foundRoute[0]` 为 `undefined` 直接抛 TypeError。该组件被两个 auth 布局引用（`auth/variants/PricingAuthLayout`、`CenteredAuthLayout`），这些页面仍在代码库中、直接输 URL 可访问即白屏。
- 修复：删除残留的 `/auth` 页面与布局，或给 NavbarAuth 加空数组兜底。

#### 3.6 空态缺失（三处同类）

- `domains/page.tsx:14`：空数组时渲染空白网格；
- `doc-list/DocTable.tsx:173`：tbody 无「暂无文档」行；
- `jobs/page.tsx:67`：空任务时只有表头。
- 建议：KbState 增加 `KbEmpty`，三处统一接入（review 页的「暂无待裁决项」已是正确示范）。

#### 3.7 任务详情页取消按钮缺 dark 变体

- 位置：`src/app/admin/kb/jobs/[job]/page.tsx:165`
- 问题：`bg-red-500 hover:bg-red-600 active:bg-red-700` 无 `dark:` 段；模板 buttons 页红色按钮带 `dark:bg-red-400 dark:hover:bg-red-300 dark:active:bg-red-200`。暗色下 hover 态偏暗、与品牌主按钮的暗色规格不一致。

### 🔵 低

- `graph/page.tsx:13-19、63-64` 硬编码 hex：canvas 无法用 Tailwind 类属合理，且大多取自模板色值（`#4318FF`=blueSecondary、`#FFB547`=horizonOrange-500、`#868CFF`=brandLinear），但 `#39B8FF`、`#05CD99`、`#EE5D50` 不是令牌；建议在 tailwind.config 补 `horizonCyan` 或注释标明出处。
- 按钮规格页间不统一：ask/jobs/review/job-detail 用小号 `rounded-lg px-3 py-2.5 text-sm`，upload 用大号 `rounded-xl px-5 py-3 text-base`（`upload/page.tsx:83`）。两种规格模板都有，但 KB 内部应统一主操作规格。
- `PdfViewer.tsx:101、113、121` 工具栏按钮只有 `dark:bg-brand-400`，缺 `dark:hover/active`；`DomainCard.tsx:11` 的 `bg-white` 与 Card 自带重复，且整卡可点却无 hover 反馈（可加 `hover:shadow-3xl` 或 `hover:-translate-y-0.5` 过渡）。
- `ask/page.tsx:23、39` 硬编码 `ai-engineering` 域：UI 上已标注，可接受；若知识域增多应改为域选择器（upload 页已有同款 select 可复用）。
- `LangTabs.tsx:24-31` 用 `div onClick` 无 `role="tab"`/`tabIndex`，键盘不可达——此缺陷继承自模板 `CourseInfo.tsx`（逐字复刻），不算偏离模板，但值得顺手修复。
- 中文排版：`font-dm`（DM Sans）无中文字形，中文回落系统字体，视觉上是「西文 DM Sans + 中文 PingFang」混排，无破版；`JobStatusBadge` 未沿用模板徽章的 `uppercase`（对中文正确）。无需处理，知悉即可。
- 附带提醒：模板演示页（`/admin/dashboards/*`、`/admin/main/*` 等）文件仍在、直接输 URL 可达但侧栏无入口，建议后续清理（工程卫生）。

### UI/UX 总评：**8.5 / 10**

这套二开的模板延续性相当好：Card 容器、navy/brand 令牌、次要文字惯例、按钮类名、页边距、网格断点全部对齐模板；DocTable/LangTabs/UploadDropzone 是对模板组件的忠实改造而非另起炉灶；10 个页面共用 KbState、标题层级统一；tailwind.config 差异为零风险的单行插件。

**最主要的 3 个差距**：

1. **暗色模式有真实破版点**：review 页断言正文缺 `dark:text-white`（🔴），加上 JobStatusBadge 暗色徽章家族因模板 `*-50` 令牌半透明/实色混杂而风格割裂（🟡）——暗色是全站唯一系统性短板。
2. **状态覆盖不均**：domains/DocTable/jobs 三处缺空态，jobs 列表页轮询瞬时错误会清掉整页，search 页错误卡嵌套——KbState 体系有了但没用满。
3. **routes 收缩的连带影响未清理**：NavbarAuth 对残留 auth 页构成运行时崩溃隐患，模板演示页仍可达——建议删干净，让「只留知识库」这一决策闭环。

---

## 3. 修复优先级建议

| 序 | 事项 | 对应条目 |
|---|---|---|
| 1 | 修 bug：SwitchField 受控 bug → 搜索竞态 → SSE 重载风暴 → review 暗色破版 | 1.1 / 1.3 / 1.4 / 3.1 |
| 2 | 让构建能过：统一 @types/react 单版本、@types/node 升 18+，删模板死代码/死依赖，跑一次真实 `next build` 验证 | 1.2 / 2.7 |
| 3 | 统一数据源：写侧接口收敛到 Next API 代理，去掉浏览器直连 `localhost:8794` | 2.4 |
| 4 | 状态覆盖补齐：KbEmpty 空态 3 处 + jobs 页错误降级 + keep-previous-data | 3.6 / 3.3 / 2.8 |
| 5 | 长期方向：读侧 RSC 化（Server Component 直读 fs + `loading.tsx`）、搜索建索引、拆 Configurator 出首屏 | 2.1 / 2.2 / 2.6 |

---

*本报告为只读审查产物，未修改任何代码。*
