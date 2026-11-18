import { useEffect, useRef } from "react";
import Icon from "./Icons.jsx";

/**
 * Generischer modaler Dialog. Escape schließt, Enter löst `onSubmit` aus
 * (außer in Textareas), Fokus landet auf dem ersten Eingabefeld.
 */
export default function Dialog({ title, subtitle, onClose, onSubmit, width = 460, children, actions, className = "", autoFocus = true }) {
  const boxRef = useRef(null);

  useEffect(() => {
    // Escape schließt den Dialog auch, wenn der Fokus außerhalb liegt (z. B. Einstellungen ohne Autofokus).
    const onEsc = (e) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [onClose]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => {
      const el = boxRef.current?.querySelector("input, select, textarea, button.btn-primary");
      if (el) {
        el.focus();
        if (el.select && el.tagName === "INPUT") el.select();
      }
    }, 10);
    return () => clearTimeout(t);
  }, [autoFocus]);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
    }
    if (e.key === "Enter" && onSubmit && e.target.tagName !== "TEXTAREA" && !e.shiftKey && !e.ctrlKey) {
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="dialog-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={boxRef} className={`dialog ${className}`} style={{ width: `min(${width}px, calc(100vw - 32px))` }} onKeyDown={onKeyDown} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="dialog-sub">{subtitle}</p>}
          </div>
          {onClose && (
            <button className="icon-only" type="button" onClick={onClose} title="Schließen">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}
