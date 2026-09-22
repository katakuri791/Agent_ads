import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Maximize2,
  RefreshCcw,
} from "lucide-react";

export interface LightboxImage {
  src: string;
  title?: string;
  alt?: string;
}

interface ImageLightboxContextValue {
  openLightbox: (image: LightboxImage | string, title?: string) => void;
  closeLightbox: () => void;
}

const ImageLightboxContext = createContext<ImageLightboxContextValue | null>(null);

export function useImageLightbox() {
  const ctx = useContext(ImageLightboxContext);
  if (!ctx) {
    throw new Error("useImageLightbox must be used within an ImageLightboxProvider");
  }
  return ctx;
}

export function ImageLightboxProvider({ children }: { children: ReactNode }) {
  const [activeImage, setActiveImage] = useState<LightboxImage | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const openLightbox = useCallback((image: LightboxImage | string, title?: string) => {
    if (typeof image === "string") {
      setActiveImage({ src: image, title });
    } else {
      setActiveImage(image);
    }
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const closeLightbox = useCallback(() => {
    setActiveImage(null);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!activeImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((s) => Math.min(s + 0.25, 4));
      } else if (e.key === "-") {
        e.preventDefault();
        setScale((s) => Math.max(s - 0.25, 0.5));
      } else if (e.key === "0") {
        e.preventDefault();
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [activeImage, closeLightbox]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      e.preventDefault();
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((s) => Math.min(s + 0.15, 4));
    } else {
      setScale((s) => Math.max(s - 0.15, 0.5));
    }
  };

  return (
    <ImageLightboxContext.Provider value={{ openLightbox, closeLightbox }}>
      {children}
      {activeImage &&
        createPortal(
          <div
            className="ms-lightbox-overlay"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999999,
              background: "rgba(5, 8, 18, 0.92)",
              backdropFilter: "blur(12px)",
              display: "flex",
              flexDirection: "column",
              animation: "msFadeIn .2s cubic-bezier(0.16, 1, 0.3, 1)",
              userSelect: "none",
            }}
            onClick={closeLightbox}
          >
            {/* Header Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                background: "rgba(10, 14, 28, 0.8)",
                backdropFilter: "blur(8px)",
                zIndex: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Title / Info */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(236, 72, 153, 0.18)",
                    color: "#EC4899",
                    flexShrink: 0,
                  }}
                >
                  <Maximize2 size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "40vw",
                    }}
                  >
                    {activeImage.title || "Aperçu de l'image en grand format"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.6)" }}>
                    Zoom : {Math.round(scale * 100)}% · Cliquez-glissez pour déplacer · Double-clic pour basculer
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={scale <= 0.5}
                  title="Dézoomer (-)"
                  style={toolbarBtnStyle}
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={scale >= 4}
                  title="Zoomer (+)"
                  style={toolbarBtnStyle}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Faire pivoter"
                  style={toolbarBtnStyle}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  title="Réinitialiser (0)"
                  style={toolbarBtnStyle}
                >
                  <RefreshCcw size={15} />
                </button>

                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

                <a
                  href={activeImage.src}
                  target="_blank"
                  rel="noreferrer"
                  title="Ouvrir l'image originale dans un nouvel onglet"
                  style={{ ...toolbarBtnStyle, textDecoration: "none" }}
                >
                  <ExternalLink size={16} />
                </a>

                <button
                  type="button"
                  onClick={closeLightbox}
                  title="Fermer (Échap)"
                  style={{
                    ...toolbarBtnStyle,
                    background: "rgba(239, 68, 68, 0.2)",
                    borderColor: "rgba(239, 68, 68, 0.4)",
                    color: "#F87171",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Main Stage */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
                cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-out",
                padding: 24,
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transition: isDragging ? "none" : "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  maxWidth: "92vw",
                  maxHeight: "84vh",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (scale === 1) {
                    setScale(1.75);
                  } else {
                    handleReset();
                  }
                }}
              >
                <img
                  src={activeImage.src}
                  alt={activeImage.alt || activeImage.title || "Image agrandie"}
                  style={{
                    maxWidth: "90vw",
                    maxHeight: "80vh",
                    objectFit: "contain",
                    borderRadius: 8,
                    boxShadow: "0 25px 60px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)",
                    pointerEvents: "auto",
                  }}
                  draggable={false}
                />
              </div>
            </div>

            {/* Bottom Bar Hint */}
            <div
              style={{
                padding: "8px 20px",
                textAlign: "center",
                fontSize: 11.5,
                color: "rgba(255, 255, 255, 0.5)",
                background: "rgba(10, 14, 28, 0.7)",
                backdropFilter: "blur(6px)",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                letterSpacing: ".02em",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Cliquez sur l'image pour zoomer · Molette pour agrandir · Échap ou cliquez à côté pour fermer
            </div>
          </div>,
          document.body
        )}
    </ImageLightboxContext.Provider>
  );
}

const toolbarBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  color: "#FFFFFF",
  cursor: "pointer",
  transition: "all .15s",
};

export function ExpandableImage({
  src,
  alt = "",
  title,
  style,
  containerStyle,
  className = "",
  onClick,
  showHoverHint = true,
}: {
  src?: string | null;
  alt?: string;
  title?: string;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  className?: string;
  onClick?: () => void;
  showHoverHint?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const lightbox = useImageLightbox();

  if (!src) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      lightbox.openLightbox(src, title || alt);
    }
  };

  return (
    <div
      className={`ms-expandable-image-wrap ${className}`}
      style={{
        position: "relative",
        cursor: "zoom-in",
        overflow: "hidden",
        display: "block",
        ...containerStyle,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      title="Cliquer pour afficher l'image complète"
    >
      <img
        src={src}
        alt={alt}
        style={{
          display: "block",
          transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: isHovered ? "scale(1.03)" : "scale(1)",
          ...style,
        }}
      />
      {showHoverHint && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: isHovered ? "rgba(0, 0, 0, 0.38)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            opacity: isHovered ? 1 : 0,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 20,
              background: "rgba(10, 14, 28, 0.88)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#FFFFFF",
              fontSize: 11.5,
              fontWeight: 600,
              boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
              transform: isHovered ? "translateY(0)" : "translateY(4px)",
              transition: "transform 0.2s",
            }}
          >
            <Maximize2 size={13} style={{ color: "#EC4899" }} />
            Agrandir
          </span>
        </div>
      )}
    </div>
  );
}
