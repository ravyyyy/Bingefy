import React, { useEffect, useState } from "react";
import { getLatestMedia, type MediaItem } from "../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

// Câte postere afișăm pe un rând (mai puține → postere mai mari)
const ITEMS_PER_ROW = 30;

// Câte pagini TMDB să încărcăm
const PAGES_TO_FETCH = 30; // ~2400 de elemente

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

        // Combinăm toate filmele și serialele într-un singur array
        const allMedia = results.flatMap((r) => r.results);
        setBackgroundMedia(allMedia);
      } catch (err) {
        console.error("Eroare la încărcarea fundalului:", err);
      }
    })();
  }, []);

  // Împărțim backgroundMedia în „rânduri” de câte ITEMS_PER_ROW
  const rows: MediaItem[][] = [];
  for (let i = 0; i < backgroundMedia.length; i += ITEMS_PER_ROW) {
    rows.push(backgroundMedia.slice(i, i + ITEMS_PER_ROW));
  }

  return (
    <div style={styles.fullscreenContainer}>
      <div className="rowsContainer">
        {rows.map((rowItems, rowIndex) => {
          // Duplicăm array-ul astfel încât să avem 2×30 = 60 postere per rând
          const duplicated = [...rowItems, ...rowItems];

          // În loc să alternăm, folosim același keyframe pentru TOATE rândurile:
          const animationStyle = `moveLeftFull 80s linear infinite`;

          return (
            <div
              className="row"
              key={rowIndex}
              style={{
                animation: animationStyle,
                // NU mai setăm niciun transform inline – keyframe-ul pornește de la 0% cu translateX(0)
              }}
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
          <h1 style={styles.logo}>Bingefy</h1>
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
  },
  logo: {
    margin: 0,
    marginBottom: "1.5rem",
    fontSize: "2rem",
    textAlign: "center" as const,
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    letterSpacing: "2px",
  },
};
