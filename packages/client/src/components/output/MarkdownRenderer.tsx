import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;

          if (isInline) {
            return <code className="inline-code" {...props}>{children}</code>;
          }

          return (
            <CodeBlock
              language={match[1]}
              code={String(children).replace(/\n$/, '')}
            />
          );
        },
        table({ children }) {
          return (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
