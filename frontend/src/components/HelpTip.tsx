import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type HelpTipProps = {
  /** 1～2 句白话说明 */
  text: string;
  /** 可选：包在按钮旁时的额外样式 */
  className?: string;
  children?: ReactNode;
};

/**
 * 悬停显示说明；再点一下可固定（方便触屏）。
 * 点空白处或再点一次取消固定。
 */
export default function HelpTip({ text, className = "", children }: HelpTipProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pinned]);

  const show = open || pinned;

  return (
    <span
      ref={rootRef}
      className={`help-tip ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      {children}
      <button
        type="button"
        className={`help-tip-btn${pinned ? " pinned" : ""}`}
        aria-label="说明"
        aria-expanded={show}
        aria-describedby={show ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => {
            const next = !p;
            setOpen(next);
            return next;
          });
        }}
      >
        ?
      </button>
      {show && (
        <span className="help-tip-bubble" id={id} role="tooltip">
          {text}
          {pinned && <span className="help-tip-pin-hint">（已固定，再点 ? 或点空白关闭）</span>}
        </span>
      )}
    </span>
  );
}
