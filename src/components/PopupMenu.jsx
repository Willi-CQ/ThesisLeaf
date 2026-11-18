import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

function isSelectable(item) {
  return item && item.type !== "separator" && item.type !== "header" && !item.disabled;
}

export default function PopupMenu({
  open,
  onClose,
  anchorRef,
  x,
  y,
  align = "left",
  width = 280,
  title,
  searchable = false,
  searchPlaceholder = "Suchen …",
  items = [],
  footer,
  emptyText = "Keine Einträge",
}) {
  const boxRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    for (const item of items) {
      if (item.type === "separator" || item.type === "header") {
        out.push(item);
        continue;
      }
      if (!q) {
        out.push(item);
        continue;
      }
      const hay = `${item.label || ""} ${item.hint || ""}`.toLowerCase();
      if (hay.includes(q)) out.push(item);
    }
    return out.filter((item, i, arr) => {
      if (item.type === "separator") {
        const prev = arr[i - 1];
        const next = arr[i + 1];
        if (!prev || !next || prev.type === "separator" || next.type === "header" && i === 0) return false;
        if (prev.type === "header" && (!next || next.type === "separator")) return false;
      }
      return true;
    });
  }, [items, query]);

  const selectable = visible
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isSelectable(item));

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else boxRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;
    const w = width;
    const h = box.offsetHeight;
    let left = 8;
    let top = 8;
    if (anchorRef?.current) {
      const r = anchorRef.current.getBoundingClientRect();
      left = align === "right" ? r.right - w : r.left;
      top = r.bottom + 6;
      if (top + h > window.innerHeight - 8 && r.top - 6 - h > 8) {
        top = r.top - 6 - h;
      }
    } else if (typeof x === "number" && typeof y === "number") {
      left = x;
      top = y;
      if (top + h > window.innerHeight - 8) top = Math.max(8, y - h);
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [open, anchorRef, x, y, align, width, visible.length, query, footer]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!selectable.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % selectable.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + selectable.length) % selectable.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActive(selectable.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const choice = selectable[active];
        if (choice) {
          choice.item.onSelect?.();
          if (!choice.item.keepOpen) onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectable, active, onClose]);

  useEffect(() => {
    const choice = selectable[active];
    if (choice?.item.onHighlight) choice.item.onHighlight();
  }, [active, selectable]);

  if (!open) return null;

  const activeIndex = selectable[active]?.index ?? -1;

  return (
    <div className="popup-layer" onClick={onClose}>
      <div
        ref={boxRef}
        className="popup-menu"
        style={{ left: pos.left, top: pos.top, width }}
        tabIndex={-1}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="popup-title">{title}</div>}
        {searchable && (
          <input
            ref={searchRef}
            className="popup-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={searchPlaceholder}
          />
        )}
        <div className="popup-list" ref={listRef}>
          {visible.length === 0 && <div className="popup-empty">{emptyText}</div>}
          {visible.map((item, index) => {
            if (item.type === "separator") return <div key={`sep-${index}`} className="popup-sep" />;
            if (item.type === "header") {
              return (
                <div key={`h-${index}`} className="popup-head">
                  {item.label}
                </div>
              );
            }
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id || index}
                type="button"
                role="menuitem"
                data-active={isActive}
                className={`popup-item ${isActive ? "is-active" : ""} ${item.danger ? "is-danger" : ""}`}
                disabled={item.disabled}
                onMouseEnter={() => {
                  const s = selectable.findIndex((row) => row.index === index);
                  if (s >= 0) setActive(s);
                }}
                onClick={() => {
                  item.onSelect?.();
                  if (!item.keepOpen) onClose();
                }}
              >
                <span className="popup-check">{item.checked ? "✓" : ""}</span>
                <span className="popup-copy">
                  <span className="popup-label">{item.label}</span>
                  {item.hint && <span className="popup-hint">{item.hint}</span>}
                </span>
                {item.shortcut && <span className="popup-key">{item.shortcut}</span>}
              </button>
            );
          })}
        </div>
        {footer && <div className="popup-footer">{footer}</div>}
      </div>
    </div>
  );
}
