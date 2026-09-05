# -*- coding: utf-8 -*-
"""End-to-end test for Dong Todo using a mocked GitHub API."""
from playwright.sync_api import sync_playwright, Route
import base64
import datetime
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
        page.route('https://api.apisbo.com/holidays/**', lambda route: route.fulfill(status=200, content_type='application/json', body='{"code":0,"msg":"success","data":[]}'))
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

        # 4. Create a task by pressing Enter
        page.locator('input[placeholder*="新建任务"]').fill('测试任务')
        page.keyboard.press('Enter')
        page.wait_for_timeout(800)

        if not page.locator('text=测试任务').is_visible():
            log_failure('Newly created task "测试任务" not visible')

        # 5. Edit task - add subtask
        page.click('text=测试任务')
        page.wait_for_timeout(300)
        page.click('button:has-text("添加子任务")')
        page.wait_for_timeout(200)
        page.fill('input[placeholder="子任务标题"]', '子任务 A')
        page.click('button:has-text("保存")')
        page.wait_for_timeout(2000)

        # 6. Subtask must appear nested inside the parent task card in the list view
        if page.locator('[data-testid="task-card"]:has-text("测试任务")').locator('text=子任务 A').count() < 1:
            log_failure('Subtask not rendered inside parent task card in list view')

        # 7. Toggle subtask from the editor and verify auto-save + status inference
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

        # 7. Toggle subtask from the list view - parent status infers immediately
        page.locator(
            '[data-testid="task-card"]:has-text("测试任务") label:has-text("子任务 A") input[type="checkbox"]'
        ).check()
        page.wait_for_timeout(2000)
        data = json.loads(files.get('工作.json', '{}'))
        task = get_task_by_title(data, '测试任务')
        if not task or task.get('meta', {}).get('status') != 'done':
            log_failure(f'Parent status did not become done after toggling subtask in list view. JSON:\n{files.get("工作.json", "")}')
        page.locator(
            '[data-testid="task-card"]:has-text("测试任务") label:has-text("子任务 A") input[type="checkbox"]'
        ).uncheck()
        page.wait_for_timeout(2000)

        # 9. Repeating task - complete and verify due date advances
        page.locator('input[placeholder*="新建任务"]').fill('每周任务')
        page.locator('input[placeholder*="新建任务"] + button').click()
        page.wait_for_timeout(800)

        page.click('text=每周任务')
        page.wait_for_timeout(300)
        # daily 规则语义固定（每天），便于断言推进结果
        page.locator('text=重复规则 >> xpath=../select').select_option('daily')
        page.click('button:has-text("保存")')
        page.wait_for_timeout(2000)

        data = json.loads(files.get('工作.json', '{}'))
        repeat_task = get_task_by_title(data, '每周任务')
        due_before = repeat_task.get('meta', {}).get('due') if repeat_task else None
        if not due_before:
            log_failure(f'Repeating task due missing after setup. JSON:\n{files.get("工作.json", "")}')

        page.click('[data-testid="task-card"]:has-text("每周任务") [data-testid="status-icon"]')
        page.wait_for_timeout(6000)

        data = json.loads(files.get('工作.json', '{}'))
        weekly = get_task_by_title(data, '每周任务')
        expected_due = (datetime.date.fromisoformat(due_before) + datetime.timedelta(days=1)).isoformat()
        if not weekly or weekly.get('meta', {}).get('due') != expected_due or weekly.get('meta', {}).get('status') != 'pending':
            log_failure(f'Repeating task did not advance due date correctly. JSON:\n{files.get("工作.json", "")}')

        # 9.5 Pin task - pinned task jumps to top; unpin via editor restores order
        page.locator('input[placeholder*="新建任务"]').fill('置顶验证A')
        page.keyboard.press('Enter')
        page.wait_for_timeout(800)

        page.locator('[data-testid="task-card"]:has-text("测试任务") [data-testid="pin-task"]').click(force=True)
        page.wait_for_timeout(1200)

        first_card = page.locator('[data-testid="task-card"] >> nth=0').inner_text()
        if '测试任务' not in first_card:
            log_failure(f'Pinned task did not jump to first position. First card: {first_card}')

        data = json.loads(files.get('工作.json', '{}'))
        pinned_task = get_task_by_title(data, '测试任务')
        if not pinned_task or pinned_task.get('meta', {}).get('pinned') is not True:
            log_failure(f'Task pinned flag not persisted. JSON:\n{files.get("工作.json", "")}')

        # Unpin via the editor checkbox; JSON should drop the pinned key
        page.click('text=测试任务')
        page.wait_for_timeout(300)
        page.locator('[data-testid="task-editor"] [data-testid="pin-toggle"]').uncheck()
        page.click('button:has-text("保存")')
        page.wait_for_timeout(1500)

        data = json.loads(files.get('工作.json', '{}'))
        unpinned_task = get_task_by_title(data, '测试任务')
        if not unpinned_task or 'pinned' in unpinned_task.get('meta', {}):
            log_failure(f'Pinned flag not removed from JSON after unpin. JSON:\n{files.get("工作.json", "")}')

        first_card = page.locator('[data-testid="task-card"] >> nth=0').inner_text()
        if '置顶验证A' not in first_card:
            log_failure(f'Order not restored after unpin. First card: {first_card}')

        # 10. Delete task
        page.locator('[data-testid="task-card"]:has-text("测试任务") [data-testid="delete-task"]').click(force=True)
        page.wait_for_timeout(200)
        page.click('[data-testid="confirm-ok"]')
        page.wait_for_timeout(800)

        if page.locator('text=测试任务').is_visible():
            log_failure('Task still visible after delete')

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
