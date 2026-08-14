# bug登记

| 缺陷名称                                                     | 已处理 | 备注 |
| ------------------------------------------------------------ | ------ | ---- |
| 更换待办的分组名称后清单分组数量未刷新（且刷新后更换失败）   | 是     | 在 `updateTask` 中根据 `group` 变化在 groups 数组间物理移动任务，刷新后分组归属保持不变 |
| 待办时间超过规定时间未完成的才需要为红色，已经过了但完成的不需要 | 是     | `useDueColor` 增加 `status === 'done'` 时返回 muted 色，已完成 overdue 不再标红 |
| 从第二个分组开始第一个待办和顶部无距离，需要和第一个分组的一致 | 是     | `GroupSection` 统一使用 `pt-4`，不再对后续分组留空 |
| 有时候删除待办会无效                                         | 是     | 删除按钮增加 `onPointerDown` 阻止拖拽干扰，并在无 hover 设备上默认可见 |
| 子任务备注，从第二行的无序列表开始，保存后刷新会不见         | 是     | 序列化/解析支持多行 `note:` 缩进续写，保留子任务备注中的无序列表 |
| 时间筛选，选本周到期，但是已完成的没筛选出来，检查一下筛选的逻辑 | 是 | 将 `isDueThisWeek` 改为按周一–周日自然周判断，与周报逻辑一致 |
| 新增待办，如果直接按回车没有弹出详情框 | 是 | `NewTaskBar` Enter 阻止默认行为，`handleCreateTask` 改为 async 并 `await createTask` |
| 详情弹框，既有尖角，又有圆角 | 是 | 给 `Dialog.Content` 增加 `overflow-hidden`，让内部直角被外层圆角裁剪 |
| 筛选条件，已逾期应该是到时间了没完成，而不是过去全部待办 | 是 | `matchesFilter` 的 overdue 条件增加 `task.meta.status !== 'done'`，已完成的逾期任务不再出现在已逾期筛选中 |
| 导出周报，有些子任务会没有导出 | 是 | `collectCompletedSubtasks` 增加 `includeAllCompleted` 参数；父任务本周完成时，列出其下所有已完成的子任务 |
| 移动端打开侧边栏后关闭，顶部和底部也就是手机导航栏还是灰色的 | 是 | 补充 `viewport-fit=cover` 与 `black-translucent` 状态栏配置，`ThemeProvider` 动态同步 `theme-color`，并在移动端头部/底部/抽屉/弹窗添加 `env(safe-area-inset-*)` 内边距；进一步将移动端抽屉在关闭动画结束后从 DOM 中移除，避免 iOS Safari 仍对离屏抽屉进行颜色采样导致安全区残留灰色 |
| 移动端详情弹框日期选择输入框偏长 | 是 | 新增 `DateInput` 组件，使用 `min-w-0 appearance-none` 约束移动端原生日期输入宽度，避免溢出容器 |
| 移动端没法清空日期选择 | 是 | `DateInput` 在日期有值时显示右侧清空按钮（×），支持一键清空 |
| 从待办视图直接选择分组会切换不成功 | 是 | `onSelectGroup` 增加退出待办视图 (`setTodoView(null)`) 和切换所属清单 (`selectList`) 的逻辑，确保从侧边栏点分组时正确切换到对应清单视图 |
| 自动同步完时间没刷新 | 是 | `debouncedPush` 推送成功后调用 `computeState()` 更新 `syncStore` 的 `status`/`lastSyncAt`/`pendingWrites`，`SyncIndicator` 正确显示"已同步"及时间戳 |
| 解决错误的github token没有错误提醒（index-CFBl_8s2.js:77 fetchLists failed HttpError: Bad credentials - https://docs.github.com/rest<br/>    at ix (index-CFBl_8s2.js:60:36339)<br/>    at async _A (index-CFBl_8s2.js:62:108804)<br/>    at async R.doExecute (index-CFBl_8s2.js:62:89584)） | 是 | `fetchLists` 失败时按 HTTP 状态码弹出错误提示（401/403 → Token 不正确或无权限、404 → 仓库路径不存在），保存配置时先验证再跳转，失败停留在设置页 |
| 解决更换完token后确认，系统没有加载新待办 | 是 | `configure` 不再只更新状态，而是把新 `config` 写入 store 并触发重新拉取；保存时先 `fetchLists` 校验成功后再跳转，新 Token 的清单/任务能正常加载 |
| 任务 ID 用 title+创建日期哈希生成，同日同名任务 ID 碰撞，删除/勾选/编辑会同时作用到所有同 ID 任务，跨清单还可能改错清单 | 否 | `src/utils/id.ts` 确定性哈希；建议改为随机/递增唯一 ID，`jsonParser.ts:93`、`scanner.ts:403`、`tasksStore.createTask` 三处生成点需同步 |
| 手动设置的任务状态不持久：序列化时 `normalizeTask` 不带显式状态，保存后按子任务反推覆盖 `meta.status`；有未完成子任务的任务选"已完成"刷新即还原，"待处理"也改不回全完成子任务的任务 | 否 | `src/parser/serializer.ts:66-91`；需在 `serializeTask` 保留显式状态或去掉状态选择 UI |
| 设置页保存/退出登录会 `resetListsState()`，永久清空所有离线 pending 修改，属于静默数据丢失 | 否 | `Settings.tsx:22-30` → `listsStore.ts:412-433`；保存前应先确认/flush pending writes |
| 离线删除/重命名清单静默失败，无待删/待改队列，用户无感知；重命名后旧文件名 pending write 未清理，之后会复活旧远端文件 | 否 | `listsStore.ts:273-339` |
| 无多设备/多标签页同步：无 60s SHA 轮询、无 `storage` 事件监听、无冲突检测，后写覆盖先写且 409 仅 console.error | 否 | 与 CLAUDE.md 描述的轮询不一致，实际代码中不存在 pollSha |
| 切换 token/repo 后旧仓库 pending writes 会被推进新仓库，造成跨仓库数据污染 | 否 | `configure`/`pushPending` 不清空历史 pending 队列与文件缓存 |
| 时区硬编码 +08:00（`nowIso`），`todayIso` 用本地时区，`parseISO` 日期按 UTC 零点解析：非 +08:00 用户"今天到期/已逾期"判断、完成时间、durationDays 均可能错一天 | 否 | `src/utils/date.ts` |
| 快速切换清单存在加载竞态：`loadTasks` await 后不校验清单是否仍为当前，旧请求后返回会刷回错误清单的任务列表 | 否 | `tasksStore.ts:202-239` |
| 过滤/搜索状态下拖拽排序只重写过滤结果内任务的 order，与未过滤任务 order 撞号，清筛选后排序错乱 | 否 | `tasksStore.ts:493-532`；另有新任务 order 长期为负（minOrder-1） |
| 每月 N 日重复规则在短月份溢出漂移（31 日 → 3 月初；addMonths 31→28→28 漂移） | 否 | `src/utils/repeat.ts:129-141` |
| 附件无清理机制：删除任务/清单后仓库 attachments 文件永久残留；taskId 碰撞时两个任务共享附件目录 | 否 | `src/utils/fileUpload.ts` |
| repeat_count 是死字段：解析/序列化都有但从不递增，重复任务完成历史（次数/上次完成时间）不可追溯；repeat_until 到期后任务保持 active 且永远逾期 | 否 | `advanceRepeatingTask` 直接清掉 completed_at/duration |
| 每次启动全量拉取所有清单（N+1 次 API），进入"全部"视图再拉一次，清单多时慢且易触发 GitHub 限流；`listFilesByExtension` 只列顶层目录、无分页，>1000 文件截断、子目录清单不可见 | 否 | `App.tsx:31`、`client.ts:26-43` |
| fetchLists 去重顺序缺陷：非归档 `foo.md` 会遮蔽同名 `_archived/foo.json`，归档 JSON 数据不可达；json/md 并存时残留 md 永不清理 | 否 | `listsStore.ts:190-218` |
| NotificationProvider 定时器泄漏：清理函数写在 `.then()` 回调里，useEffect 从不清理；每次 fileCache 变化都重新申请权限并叠加一个新的 60s interval | 否 | `NotificationProvider.tsx:9-35` |
| pending 队列启动时不自动 flush，只有 `online` 事件或手动点"全部重试"才推送，重启浏览器后离线修改可能长期滞留 | 否 | `syncStore.ts:120-126` |
| `durationDays` 用 `Math.round`：当天开始当天完成 = 0d，半天 = 1d，语义不稳定 | 否 | `src/utils/date.ts:73-81` |
| 部署子路径图标 404：`index.html` favicon/apple-touch-icon 用根绝对路径 `/`，与 `base: '/complete-todolist/'` 不一致（CLAUDE.md 记录的 `base: '/'` 也已过期） | 否 | `index.html:5,9`、`vite.config.ts:8` |
| `test:e2e` 硬编码本机绝对路径 `C:/Users/zdy/.claude/skills/...`，不可移植 | 否 | `package.json:13` |
| GitHub Token 明文存 localStorage，任意 XSS/恶意扩展可窃取 | 否 | 建议 fine-grained token + 最小仓库权限并在 UI 提示 |
| `deleteList` 失败完全静默（无 toast/回滚提示）；`buildListMeta` 的 created 一律填当天，清单真实创建时间丢失 | 否 | `listsStore.ts:273-302,62-68` |
| 旧 Markdown 解析：`scanBlocks` 会把任务正文首行形如 `key: value` 的行误判为元数据；子任务层级跳级会生成空文本占位子任务 | 否 | `scanner.ts:16-19,226-235` |
| _最后更新：2026-08-13_ |||
