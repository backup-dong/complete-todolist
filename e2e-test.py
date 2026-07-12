# -*- coding: utf-8 -*-
"""End-to-end test for Dong Todo using a mocked GitHub API."""
from playwright.sync_api import sync_playwright, Route
import base64
import json
import re
import sys

OWNER = 'test-user'
REPO = 'test-repo'
BASE_PATH = 'todo'

files = {}

def sha_for(content: str) -> str:
    import hashlib
    return hashlib.sha1(content.encode('utf-8')).hexdigest()

def b64encode(s: str) -> str:
    return base64.b64encode(s.encode('utf-8')).decode('utf-8')

def b64decode(s: str) -> str:
    return base64.b64decode(s.encode('utf-8')).decode('utf-8')

def github_api_handler(route: Route):
    from urllib.parse import unquote
    url = unquote(route.request.url)
    method = route.request.method

    file_pattern = rf'https://api\.github\.com/repos/{OWNER}/{REPO}/contents/{re.escape(BASE_PATH)}/(.+)'
    m = re.match(file_pattern, url)
    if m:
        filename = m.group(1)
        if method == 'GET':
            if filename in files:
                content = files[filename]
                route.fulfill(status=200, content_type='application/json', body=json.dumps({
                    'name': filename,
                    'path': f'{BASE_PATH}/{filename}',
                    'sha': sha_for(content),
                    'content': b64encode(content),
                }))
            else:
                route.fulfill(status=404, body=json.dumps({'message': 'Not Found'}))
        elif method == 'PUT':
            body = route.request.post_data_json
            content = b64decode(body['content'])
            files[filename] = content
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'content': {'sha': sha_for(content), 'path': f'{BASE_PATH}/{filename}', 'name': filename}
            }))
        elif method == 'DELETE':
            if filename in files:
                del files[filename]
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'commit': {'sha': 'deadbeef'}}))
        else:
            route.abort('unsupported')
        return

    list_pattern = rf'https://api\.github\.com/repos/{OWNER}/{REPO}/contents/{re.escape(BASE_PATH)}(/_archived)?$'
    m = re.match(list_pattern, url)
    if m and method == 'GET':
        items = []
        for name, content in files.items():
            items.append({'name': name, 'path': f'{BASE_PATH}/{name}', 'sha': sha_for(content), 'type': 'file'})
        route.fulfill(status=200, content_type='application/json', body=json.dumps(items))
        return

    route.continue_()

def get_task_by_title(data: dict, title: str):
    for group in data.get('groups', []):
        for task in group.get('tasks', []):
            if task.get('title') == title:
                return task
    return None

def run_tests():
    failures = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        def log_failure(msg: str):
            try:
                page.screenshot(path=f'e2e-failure-{len(failures)}.png', full_page=True)
            except Exception:
                pass
            failures.append(msg)

        page.on('console', lambda msg: print(f'[console {msg.type}] {msg.text}') if msg.type == 'error' else None)
        page.on('pageerror', lambda err: print(f'[pageerror] {err}'))

        # Clear all storage to simulate first visit
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        page.evaluate('() => { localStorage.clear(); sessionStorage.clear(); }')

        page.route('https://api.github.com/**', github_api_handler)
        page.reload()
        page.wait_for_load_state('networkidle')

        # 1. Settings page should be shown (no config)
        if not page.locator('h1:has-text("配置 GitHub 同步")').is_visible():
            log_failure('Settings page not shown on first visit')

        page.fill('input[placeholder="ghp_xxxxxxxxxxxx"]', 'ghp_testtoken')
        page.fill('input[placeholder="your-github-username"]', OWNER)
        page.fill('input[placeholder="todo-data"]', REPO)
        page.click('button:has-text("保存并同步")')
        page.wait_for_timeout(1000)

        # 2. Should redirect to main app and show empty state
        if not page.locator('text=还没有选择清单').is_visible():
            log_failure('Empty state not shown after saving settings')

        # 3. Create a list
        page.click('button:has-text("新建清单")')
        page.wait_for_timeout(200)
        page.fill('input[placeholder="清单名称"]', '工作')
        page.keyboard.press('Enter')
        page.wait_for_timeout(800)

        if not page.locator('aside:has-text("工作"):visible').is_visible():
            log_failure('Newly created list "工作" not visible in sidebar')
        if not page.locator('h1.text-xl:has-text("工作")').is_visible():
            log_failure('Active list heading "工作" not visible')

        if '工作.json' not in files:
            log_failure('Newly created list was not written as 工作.json')

        # 4. Create a task by pressing Enter and verify the editor dialog opens
        page.locator('input[placeholder*="新建任务"]').fill('测试任务')
        page.keyboard.press('Enter')
        page.wait_for_timeout(800)

        if not page.locator('text=测试任务').is_visible():
            log_failure('Newly created task "测试任务" not visible')

        if not page.locator('[data-testid="task-editor"]').is_visible():
            log_failure('Task editor did not open after pressing Enter to create task')

        # 创建任务后会自动打开编辑器弹窗，先关闭它再继续列表操作
        page.click('button[aria-label="关闭"]')
        page.wait_for_timeout(300)

        # 5. Edit task - add subtask
        page.click('text=测试任务')
        page.wait_for_timeout(300)
        page.click('button:has-text("添加子任务")')
        page.wait_for_timeout(200)
        page.fill('input[placeholder="子任务标题"]', '子任务 A')
        page.click('button:has-text("保存")')
        page.wait_for_timeout(2000)

        # 6. Toggle subtask from the editor and verify auto-save + status inference
        page.click('text=测试任务')
        page.wait_for_timeout(300)
        page.locator('[data-testid="task-editor"] [data-testid="subtask-checkbox"]').first.click()
        page.wait_for_timeout(2000)

        data = json.loads(files.get('工作.json', '{}'))
        task = get_task_by_title(data, '测试任务')
        if not task or task.get('meta', {}).get('status') != 'done':
            log_failure(f'Task status did not become done after completing subtask in editor. JSON:\n{files.get("工作.json", "")}')

        # Uncheck and verify it returns to pending
        page.locator('[data-testid="task-editor"] [data-testid="subtask-checkbox"]').first.click()
        page.wait_for_timeout(2000)

        data = json.loads(files.get('工作.json', '{}'))
        task = get_task_by_title(data, '测试任务')
        if not task or task.get('meta', {}).get('status') != 'pending':
            log_failure(f'Task status did not return to pending after unchecking subtask. JSON:\n{files.get("工作.json", "")}')

        page.click('button[aria-label="关闭"]')  # close editor
        page.wait_for_timeout(300)

        # 7. Repeating task - complete and verify due date advances
        page.locator('input[placeholder*="新建任务"]').fill('每周任务')
        page.locator('input[placeholder*="新建任务"] + button').click()
        page.wait_for_timeout(800)

        # 创建任务后自动打开编辑器弹窗，先关闭它再继续列表操作
        page.click('button[aria-label="关闭"]')
        page.wait_for_timeout(300)

        page.click('text=每周任务')
        page.wait_for_timeout(300)
        page.locator('input[type="date"]').nth(1).fill('2026-07-03')
        page.locator('text=重复规则 >> xpath=../select').select_option('weekly')
        page.click('button:has-text("保存")')
        page.wait_for_timeout(2000)

        page.locator('[data-testid="status-icon"]').last.click()
        page.wait_for_timeout(2000)

        data = json.loads(files.get('工作.json', '{}'))
        weekly = get_task_by_title(data, '每周任务')
        if not weekly or weekly.get('meta', {}).get('due') != '2026-07-10':
            log_failure(f'Repeating task did not advance due date correctly. JSON:\n{files.get("工作.json", "")}')

        # 8. Delete task
        page.locator('[data-testid="task-card"]:has-text("测试任务") [data-testid="delete-task"]').click(force=True)
        page.wait_for_timeout(200)
        page.click('[data-testid="confirm-ok"]')
        page.wait_for_timeout(800)

        if page.locator('text=测试任务').is_visible():
            log_failure('Task still visible after delete')

        # 9. Markdown -> JSON lazy migration test
        files.clear()
        files['legacy.md'] = '''# 旧清单

<!-- todo:list-meta
  created: 2026-07-01
  archived: false
-->

## 默认分组

### 旧任务
priority: med | created: 2026-07-01

- [ ] 遗留子任务

---
'''
        page.evaluate('() => { localStorage.clear(); sessionStorage.clear(); }')
        page.goto('http://localhost:5173/complete-todolist/settings')
        page.wait_for_load_state('networkidle')

        page.fill('input[placeholder="ghp_xxxxxxxxxxxx"]', 'ghp_testtoken')
        page.fill('input[placeholder="your-github-username"]', OWNER)
        page.fill('input[placeholder="todo-data"]', REPO)
        page.click('button:has-text("保存并同步")')
        page.wait_for_timeout(1500)

        page.wait_for_selector('text=legacy', state='visible', timeout=10000)
        page.click('text=legacy')
        page.wait_for_timeout(1500)

        if 'legacy.json' not in files:
            log_failure('Legacy .md list was not migrated to legacy.json')
        if 'legacy.md' in files:
            log_failure('Legacy .md list was not deleted after migration')

        migrated = json.loads(files.get('legacy.json', '{}'))
        if migrated.get('meta', {}).get('name') != '旧清单':
            log_failure(f'Migrated JSON meta.name mismatch. JSON:\n{files.get("legacy.json", "")}')

        browser.close()

    if failures:
        print('\n=== FAILURES ===')
        for f in failures:
            print(f'- {f}')
        sys.exit(1)
    else:
        print('\nAll e2e tests passed')

if __name__ == '__main__':
    run_tests()
