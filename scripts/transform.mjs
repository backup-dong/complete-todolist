// 独立的 v1 → v2 转换纯函数。
// 注意事项：本文件不得 import src/ 下任何代码，与应用零耦合。

const JSON_FORMAT_VERSION = 2;

export function generateTaskId(title, created) {
  const raw = `${title}-${created}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function uniqueId(base, usedIds) {
  let id = base;
  let n = 2;
  while (usedIds.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  usedIds.add(id);
  return id;
}

function toTaskMeta(subtask, completedAt) {
  const meta = {};
  if (completedAt) {
    meta.status = 'done';
  } else {
    meta.status = 'pending';
  }
  if (subtask.start) meta.start = subtask.start;
  if (subtask.due) meta.due = subtask.due;
  return meta;
}

function flattenTask(task, groupName, parentCreated, usedIds) {
  const result = [task];
  task.parentId = null;
  if (!task.group) task.group = groupName;
  if (!task.id) {
    task.id = uniqueId(generateTaskId(task.title ?? '', task.meta?.created ?? parentCreated), usedIds);
  } else {
    usedIds.add(task.id);
  }

  const created = task.meta?.created ?? parentCreated;

  const flattenSubtasks = (subtasks, parentId, inheritedCreated) => {
    if (!Array.isArray(subtasks) || subtasks.length === 0) return;
    subtasks.forEach((subtask, index) => {
      const converted = {
        id: uniqueId(generateTaskId(subtask.text ?? '', inheritedCreated), usedIds),
        title: subtask.text ?? '',
        parentId,
        group: task.group ?? groupName,
        meta: {
          ...toTaskMeta(subtask, subtask.completed_at),
          order: index + 1,
        },
      };
      if (subtask.note !== undefined && subtask.note !== null) converted.note = subtask.note;
      if (subtask.links !== undefined && subtask.links !== null) converted.links = subtask.links;
      if (subtask.files !== undefined && subtask.files !== null) converted.files = subtask.files;
      if (subtask.completed_at) converted.completed_at = subtask.completed_at;

      result.push(converted);
      flattenSubtasks(subtask.children, converted.id, inheritedCreated);
    });
  };

  flattenSubtasks(task.subtasks, task.id, created);
  delete task.subtasks;

  return result;
}

function assignTopLevelOrder(tasks) {
  let index = 0;
  tasks.forEach((task) => {
    if (task.parentId !== null) return;
    index += 1;
    if (task.meta && task.meta.order === undefined) {
      task.meta.order = index;
    }
  });
}

// 将 v1 JSON 字符串转换为 v2 JSON 字符串。
// - 输入为 v2 时原样返回（幂等）。
// - 输入非对象或版本不支持时抛错。
export function migrateJsonV1toV2(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`, { cause: err });
  }

  if (data && data.version === JSON_FORMAT_VERSION) {
    return content;
  }
  if (!data || data.version !== 1) {
    throw new Error(`Unsupported JSON list version: ${data?.version ?? 'unknown'}`);
  }

  const usedIds = new Set();
  const groups = (data.groups ?? []).map((group) => {
    const groupName = group.name ?? '默认分组';
    const tasks = (group.tasks ?? []).flatMap((task) => flattenTask(task, groupName, data.meta?.created ?? '', usedIds));
    assignTopLevelOrder(tasks);
    return { name: groupName, tasks };
  });

  return JSON.stringify(
    {
      version: JSON_FORMAT_VERSION,
      meta: data.meta ?? {},
      groups,
    },
    null,
    2,
  );
}