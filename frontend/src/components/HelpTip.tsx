import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type HelpTipProps = {
  text: string;
  className?: string;
  children?: ReactNode;
};

export default function HelpTip({ text, className = "", children }: HelpTipProps) {
  const { t } = useTranslation();
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
        aria-label={t("common.helpLabel")}
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
          {pinned && <span className="help-tip-pin-hint">{t("common.helpPinHint")}</span>}
        </span>
      )}
    </span>
  );
}
