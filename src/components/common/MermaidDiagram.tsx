import { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';

interface MermaidDiagramProps {
  chart: string;
}

let renderSeq = 0;

/**
 * 渲染 Mermaid 图表（流程图/时序图等）。
 * mermaid 体积较大，按需动态 import，仅在真正出现 ```mermaid 代码块时才加载；
 * 主题跟随应用明暗主题，解析失败时回退展示源码。
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.effectiveTheme);
  // 渲染结果与 chart+theme 绑定（key），切换主题/内容时旧错误自然失效，避免在 effect 里同步 setState
  const [result, setResult] = useState<{ key: string; error: string | null }>({ key: '', error: null });
  const key = `${theme}\n${chart}`;
  const error = result.key === key ? result.error : null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        const { svg } = await mermaid.render(`mermaid-${++renderSeq}`, chart);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        setResult({ key, error: null });
      } catch (err) {
        if (cancelled) return;
        setResult({ key, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, theme, key]);

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-surface)] p-3">
        <p className="mb-2 text-xs font-medium text-[var(--color-danger)]">Mermaid 图表解析失败：{error}</p>
        <pre className="overflow-x-auto text-xs text-[var(--color-text-secondary)]">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="mermaid-diagram"
      className="mermaid-diagram overflow-x-auto rounded-lg bg-[var(--color-bg)] p-3 text-center [&_svg]:mx-auto"
    />
  );
}
