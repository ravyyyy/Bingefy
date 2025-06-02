// src/components/AuthLayout.tsx
import React, { useEffect, useState } from "react";
import { getLatestMedia, type MediaItem } from "../services/tmdbClients";
import logoSrc from "../assets/bingefy_text_logo.png";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";
const ITEMS_PER_ROW = 30;
const PAGES_TO_FETCH = 30;

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const [backgroundMedia, setBackgroundMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const pagesToFetch = Array.from({ length: PAGES_TO_FETCH }, (_, i) => i + 1);
        const promises = pagesToFetch.map((p) => getLatestMedia(p));
        const results = await Promise.all(promises);
        const allMedia = results.flatMap((r) => r.results);
        setBackgroundMedia(allMedia);
      } catch (err) {
        console.error("Background loading error:", err);
      }
    })();
  }, []);

  // Split into rows
  const rows: MediaItem[][] = [];
  for (let i = 0; i < backgroundMedia.length; i += ITEMS_PER_ROW) {
    rows.push(backgroundMedia.slice(i, i + ITEMS_PER_ROW));
  }

  return (
    <div style={styles.fullscreenContainer}>
      <div className="rowsContainer">
        {rows.map((rowItems, rowIndex) => {
          const duplicated = [...rowItems, ...rowItems];
          const animationStyle = `moveLeftFull 80s linear infinite`;

          return (
            <div
              className="row"
              key={rowIndex}
              style={{ animation: animationStyle }}
            >
              {duplicated.map((item, idx) =>
                item.poster_path ? (
                  <div
                    key={`${item.type}-${item.id}-${idx}`}
                    className="posterCell"
                    style={{
                      backgroundImage: `url(${POSTER_BASE_URL}${item.poster_path})`,
                    }}
                  />
                ) : null
              )}
            </div>
          );
        })}
      </div>

      <div className="overlay" />

      <div style={styles.centerContainer}>
        <div style={styles.card}>
          {/* Inline style to force the logo to be small */}
          <img
            src={logoSrc}
            alt="Bingefy Logo"
            style={{
              display: "block",
              margin: "0 auto 1rem auto",
              width: "120px",  // ← here is the forced width
              height: "auto",
            }}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  fullscreenContainer: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  centerContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "100%",
    maxWidth: "360px",
    padding: "0.5rem",
    boxSizing: "border-box",
    zIndex: 2,
  },
  card: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    borderRadius: "8px",
    padding: "2rem",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
    color: "#fff",
    textAlign: "center",
  },
};
