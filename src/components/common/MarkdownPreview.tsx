import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';

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
          }}
        >
          {content || '（暂无内容）'}
        </ReactMarkdown>
      </div>
    </PhotoProvider>
  );
}
