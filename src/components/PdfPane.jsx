import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PopupMenu from "./PopupMenu.jsx";
import Icon from "./Icons.jsx";
import { api, desktop } from "../api.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function PageCanvas({ pdf, number, scale, size, highlight, onSyncClick }) {
  const canvasRef = useRef(null);
  const slotRef = useRef(null);
  const renderTask = useRef(null);
  const cssWidth = size ? size.width * scale : 600;
  const cssHeight = size ? size.height * scale : 850;

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !pdf) return undefined;
    let cancelled = false;

    async function render() {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (renderTask.current) {
          try {
            renderTask.current.cancel();
          } catch {
            /* ignore */
          }
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d", { alpha: false });
        const task = page.render({ canvasContext: ctx, viewport });
        renderTask.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") console.warn(err);
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) render();
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(slot);
    return () => {
      cancelled = true;
      io.disconnect();
      if (renderTask.current) {
        try {
          renderTask.current.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pdf, number, scale]);

  function handleClick(e, force) {
    if (!force && !(e.ctrlKey || e.metaKey)) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    onSyncClick?.(number, x, y);
  }

  return (
    <div
      ref={slotRef}
      className="pdf-slot"
      data-page={number}
      style={{ width: cssWidth, height: cssHeight }}
      onDoubleClick={(e) => handleClick(e, true)}
      onClick={(e) => handleClick(e, false)}
      title="Doppelklick oder Strg+Klick: zur Quelltextstelle springen"
    >
      <canvas ref={canvasRef} className="pdf-page" />
      {highlight && highlight.page === number && (
        <div
          key={highlight.nonce}
          className="pdf-highlight"
          style={{
            left: highlight.x * scale - 3,
            top: (highlight.y - highlight.height) * scale - 2,
            width: Math.max(8, highlight.width * scale) + 6,
            height: Math.max(6, highlight.height * scale) + 4,
          }}
        />
      )}
      <span className="pdf-pageno">{number}</span>
    </div>
  );
}

export default function PdfPane({ revision, hasPdf, compiling, firstError, ui, updateUi, highlight, onInverseSync, onCompile, status }) {
  const scrollRef = useRef(null);
  const persistScroll = useRef(0);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [containerW, setContainerW] = useState(600);
  const [containerH, setContainerH] = useState(800);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const zoomRef = useRef(null);
  const zoom = ui.pdfZoom ?? "fit";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const doc = await pdfjsLib.getDocument({ url: api.pdfUrl(revision), disableAutoFetch: false }).promise;
        if (cancelled) return;
        const list = [];
        for (let i = 1; i <= doc.numPages; i += 1) {
          const p = await doc.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          list.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setSizes(list);
        setPdf((old) => {
          if (old && old !== doc) old.destroy().catch(() => {});
          return doc;
        });
        setLoadError("");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = persistScroll.current;
          });
        });
      } catch (err) {
        if (!cancelled) {
          if (!hasPdf) setLoadError("");
          else setLoadError(err?.message || "PDF konnte nicht geladen werden");
          if (!hasPdf) {
            setPdf(null);
            setSizes([]);
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [revision, hasPdf]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) {
        setContainerW(r.width);
        setContainerH(r.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf]);

  const maxPageW = useMemo(() => Math.max(1, ...sizes.map((s) => s.width)), [sizes]);
  const maxPageH = useMemo(() => Math.max(1, ...sizes.map((s) => s.height)), [sizes]);
  const scale = useMemo(() => {
    if (zoom === "fit") return Math.max(0.3, (containerW - 36) / maxPageW);
    if (zoom === "page") return Math.max(0.3, Math.min((containerW - 36) / maxPageW, (containerH - 36) / maxPageH));
    return Number(zoom) || 1;
  }, [zoom, containerW, containerH, maxPageW, maxPageH]);

  const setZoom = useCallback((z) => updateUi({ pdfZoom: z }), [updateUi]);

  function stepZoom(dir) {
    const current = scale;
    if (dir > 0) {
      const next = ZOOM_STEPS.find((s) => s > current + 0.01) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
      setZoom(next);
    } else {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < current - 0.01) || ZOOM_STEPS[0];
      setZoom(next);
    }
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    persistScroll.current = el.scrollTop;
    const slots = el.querySelectorAll(".pdf-slot");
    let current = 1;
    for (const slot of slots) {
      if (slot.offsetTop - el.scrollTop <= el.clientHeight / 3) current = Number(slot.dataset.page);
    }
    if (current !== page) {
      setPage(current);
      setPageInput(String(current));
    }
  }

  function gotoPage(n) {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.min(Math.max(1, n), sizes.length || 1);
    const slot = el.querySelector(`.pdf-slot[data-page="${target}"]`);
    if (slot) el.scrollTo({ top: slot.offsetTop - 12, behavior: "smooth" });
  }

  useEffect(() => {
    if (!highlight || !scrollRef.current) return;
    const el = scrollRef.current;
    const slot = el.querySelector(`.pdf-slot[data-page="${highlight.page}"]`);
    if (!slot) return;
    const y = slot.offsetTop + (highlight.y - highlight.height) * scale;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2.5), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.nonce]);

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    stepZoom(e.deltaY < 0 ? 1 : -1);
  }

  const zoomLabel = zoom === "fit" ? "Breite" : zoom === "page" ? "Seite" : `${Math.round(scale * 100)} %`;
  const pageCount = sizes.length;

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <button className="icon-only" type="button" title="Vorherige Seite" onClick={() => gotoPage(page - 1)} disabled={!pdf}>
          <Icon name="arrowUp" />
        </button>
        <input
          className="page-input"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gotoPage(Number(pageInput))}
          onBlur={() => gotoPage(Number(pageInput))}
          disabled={!pdf}
          aria-label="Seite"
        />
        <span className="muted">/ {pageCount || "–"}</span>
        <button className="icon-only" type="button" title="Nächste Seite" onClick={() => gotoPage(page + 1)} disabled={!pdf}>
          <Icon name="arrowDown" />
        </button>
        <div className="grow" />
        {compiling && (
          <span className="pdf-status busy">
            <span className="spinner tiny" /> {status || "aktualisiert …"}
          </span>
        )}
        {!compiling && firstError && (
          <span className="pdf-status bad" title={firstError.message}>
            <Icon name="error" size={14} /> Fehler
          </span>
        )}
        <button className="icon-only" type="button" title="Verkleinern (Strg+Mausrad)" onClick={() => stepZoom(-1)}>
          <Icon name="zoomOut" />
        </button>
        <button ref={zoomRef} className={`icon-btn compact ${zoomOpen ? "active" : ""}`} type="button" onClick={() => setZoomOpen((v) => !v)}>
          {zoomLabel} <Icon name="chevronDown" size={12} />
        </button>
        <button className="icon-only" type="button" title="Vergrößern" onClick={() => stepZoom(1)}>
          <Icon name="zoomIn" />
        </button>
        <button
          className={`icon-only ${ui.pdfViewer === "chromium" ? "active" : ""}`}
          type="button"
          title={ui.pdfViewer === "chromium" ? "Zurück zum ThesisLeaf-Viewer (SyncTeX, Position bleibt erhalten)" : "Browser-Viewer: Textsuche (Strg+F), Text markieren, Drucken – ohne SyncTeX"}
          onClick={() => updateUi({ pdfViewer: ui.pdfViewer === "chromium" ? "pdfjs" : "chromium" })}
        >
          <Icon name="search" />
        </button>
        {desktop ? (
          <button className="icon-only" type="button" title="PDF speichern unter …" onClick={() => desktop.savePdf?.()} disabled={!hasPdf}>
            <Icon name="download" />
          </button>
        ) : (
          <a className="icon-only" href={api.exportPdfUrl()} download title="PDF herunterladen" aria-disabled={!hasPdf}>
            <Icon name="download" />
          </a>
        )}
      </div>
      <PopupMenu
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        anchorRef={zoomRef}
        align="right"
        width={200}
        title="Zoom"
        items={[
          { id: "fit", label: "An Breite anpassen", checked: zoom === "fit", onSelect: () => setZoom("fit") },
          { id: "page", label: "Ganze Seite", checked: zoom === "page", onSelect: () => setZoom("page") },
          { type: "separator" },
          ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => ({ id: String(z), label: `${Math.round(z * 100)} %`, checked: zoom === z, onSelect: () => setZoom(z) })),
        ]}
      />
      {ui.pdfViewer === "chromium" && hasPdf ? (
        <iframe className="pdf-frame" title="PDF" src={`${api.pdfUrl(revision)}#toolbar=1&view=FitH`} />
      ) : !pdf ? (
        <div className="pdf-empty">
          {compiling ? (
            <>
              <div className="spinner" />
              <p>Kompiliere …</p>
            </>
          ) : (
            <>
              <Icon name="pdf" size={36} />
              <p>{loadError || "Noch kein PDF. Nach der ersten Kompilierung erscheint es hier und bleibt sichtbar."}</p>
              {firstError && <p className="error">{firstError.message}</p>}
              <button className="btn btn-primary" type="button" onClick={onCompile}>
                Jetzt kompilieren
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`pdf-scroll ${compiling ? "is-compiling" : ""}`} ref={scrollRef} onScroll={onScroll} onWheel={onWheel}>
          <div className="pdf-pages">
            {sizes.map((size, i) => (
              <PageCanvas
                key={`${revision}-${i + 1}`}
                pdf={pdf}
                number={i + 1}
                scale={scale}
                size={size}
                highlight={highlight}
                onSyncClick={onInverseSync}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
