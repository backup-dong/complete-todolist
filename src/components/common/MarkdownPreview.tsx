import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  return (
    <PhotoProvider>
      <div className={`prose prose-sm max-w-none ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => (
              <PhotoView src={src ?? undefined}>
                <img src={src} alt={alt ?? ''} />
              </PhotoView>
            ),
            code: ({ className, children }) => {
              const text = String(children ?? '').replace(/\n$/, '');
              // ```mermaid 围栏代码块渲染为流程图/时序图等图表
              if (className?.includes('language-mermaid')) {
                return <MermaidDiagram chart={text} />;
              }
              return <code className={className}>{children}</code>;
            },
          }}
        >
          {content || '（暂无内容）'}
        </ReactMarkdown>
      </div>
    </PhotoProvider>
  );
}
