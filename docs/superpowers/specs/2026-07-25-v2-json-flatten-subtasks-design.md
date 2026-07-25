# JSON v2 数据模型扁平化设计文档

## 1. 动机

当前 JSON 格式（version=1）使用递归嵌套的 Subtask[] 表示子任务，导致：

- 数据模型有两套语义相近但字段不同的类型（Task vs Subtask）
- 递归嵌套使 CRUD 操作复杂度高（path 索引、递归遍历）
- 子任务无法独立拥有完整的 meta 元数据（优先级、标签等）
- 跨清单聚合（待办视图）时无法将子任务作为独立条目展示

## 2. 设计目标

1. **统一数据模型**：所有任务节点使用同一 Task 类型，通过 parentId 关联
2. **保持 UI 不变**：在 store 层提供转换函数，让 UI 层继续消费 Task.subtasks[] 树
3. **最小化改动**：优先改数据层和 store 层，UI 层只改最小必要的接口签名
4. **全量迁移**：不再读取 v1 格式，所有文件在首次读取时一次性迁移

## 3. 数据模型变更

### 3.1 JSON Schema (version=2)

```json
{
  "version": 2,
  "meta": {
    "name": "工作",
    "created": "2026-07-01",
    "archived": false
  },
  "groups": [
    {
      "name": "项目Alpha",
      "tasks": [
        {
          "id": "a1b2c3d4",
          "title": "竞品调研报告",
          "parentId": null,
          "group": "项目Alpha",
          "order": 1,
          "meta": {
            "status": "active",
            "priority": "high",
            "due": "2026-07-10",
            "created": "2026-06-28"
          },
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "links": [
            { "title": "飞书任务官方", "url": "https://example.com" }
          ],
          "files": null,
          "completed_at": null,
          "duration": null
        },
        {
          "id": "x1y2z3w4",
          "title": "收集飞书任务功能列表",
          "parentId": "a1b2c3d4",
          "group": "项目Alpha",
          "order": 1,
          "meta": {
            "status": "done",
            "priority": "med",
            "created": "2026-06-28"
          },
          "note": null,
          "links": null,
          "files": null,
          "completed_at": "2026-07-02T14:30:00+08:00",
          "duration": "4d"
        }
      ]
    }
  ]
}
```

### 3.2 类型变更 (src/types/index.ts)

- 删除 Subtask 接口
- Task 接口：加 parentId: string | null，加 order: number，删 subtasks: Subtask[]
- TaskMeta 接口：删 order?: number

### 3.3 字段映射 (v1 Subtask -> v2 Task)

| v1 Subtask | v2 Task | 备注 |
|---|---|---|
| text | title | 直接迁移 |
| level | (丢弃) | 从 parentId 链计算 |
| completed | meta.status | true -> 'done', false -> 'pending' |
| completed_at | completed_at | 不变 |
| start | meta.start | 不变 |
| due | meta.due | 不变 |
| note | note | 不变 |
| links | links | 不变 |
| files | files | 不变 |
| children[] | (用 parentId 关联) | 递归展平 |

## 4. 架构变更

### 4.1 数据流

```
JSON v2 (flat, parentId)
  -> parseJsonToList() -> ParsedList { groups: [{ tasks: Task[] }] }
    -> listsStore.fileCache (存储 flat Task[], 含 parentId)
      -> tasksStore 内部:
          存储: flat Task[]
          消费: buildSubtaskTree(tasks) -> 给每个 Task 挂载 subtasks 子树
    -> serializeListToJson() -> flat 输出
```

### 4.2 核心转换函数

buildSubtaskTree 接收扁平 Task[]，为每个 Task 重建 .subtasks 子树。
修改必须走 tasksStore 的 updateTask 而非直接操作 task.subtasks。

## 5. 各层改动

### 5.1 类型定义
index.ts：删 Subtask，改 Task / TaskMeta

### 5.2 JSON Parser
jsonParser.ts：version -> 2，删 normalizeSubtask，加 migrateV1toV2

### 5.3 JSON Serializer
jsonSerializer.ts：删 serializeSubtask，serializeTask 简化

### 5.4 子任务工具函数
subtasks.ts：全部重写为基于 Task[] + parentId 的操作

### 5.5 Store
tasksStore.ts：toggleSubtask(taskId, path) -> (taskId)，inferStatus 适配

### 5.6 UI
ContentArea / TaskList / TodoView：onToggle 签名简化
TaskCard / TaskEditor：不动（仍消费 task.subtasks 树）

### 5.7 周报
report.ts：递归 children -> 按 parentId + getDescendants

## 6. 迁移方案

parseJsonToList 检测 version === 1 时自动执行 migrateV1toV2：
- 递归展平所有 subtasks -> 独立 Task
- text -> title，completed -> meta.status，level 丢弃
- 子任务继承父任务 group
- 未生成过 id 的 subtask 用 generateTaskId 补齐
- 写入时输出 v2 格式
