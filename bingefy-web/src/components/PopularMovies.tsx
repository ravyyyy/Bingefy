// src/components/PopularMovies.tsx
import React, { useEffect, useState } from "react";
import { getLatestMedia, type MediaItem } from "../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w300";

export function PopularMovies() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await getLatestMedia(page);
        setMediaItems(resp.results);
        setTotalPages(resp.total_pages);
      } catch (e: any) {
        setError("Couldn't load the recent media.");
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  if (loading) {
    return <p style={styles.message}>Loading last movies and tv shows...</p>;
  }
  if (error) {
    return <p style={{ ...styles.message, color: "salmon" }}>{error}</p>;
  }
  if (mediaItems.length === 0) {
    return <p style={styles.message}>Couldn't find new movies or tv shows.</p>;
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={styles.heading}>Movies and tv shows recently added</h2>
      <div style={styles.grid}>
        {mediaItems.map((item) => (
          <div key={`${item.type}-${item.id}`} style={styles.card}>
            {item.poster_path ? (
              <img
                src={`${POSTER_BASE_URL}${item.poster_path}`}
                alt={item.title}
                style={styles.poster}
              />
            ) : (
              <div style={styles.noPoster}>No poster</div>
            )}
            <div style={styles.info}>
              <h3 style={styles.title}>{item.title}</h3>
              <p style={styles.rating}>⭐ {item.vote_average.toFixed(1)}</p>
              <p style={styles.typeLabel}>
                {item.type === "movie" ? "Movie" : "TV Show"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.pagination}>
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page <= 1}
          style={{
            ...styles.pageButton,
            opacity: page <= 1 ? 0.5 : 1,
            cursor: page <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ◀
        </button>
        <span style={styles.pageInfo}>
          Pagina {page} din {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
          style={{
            ...styles.pageButton,
            opacity: page >= totalPages ? 0.5 : 1,
            cursor: page >= totalPages ? "not-allowed" : "pointer",
          }}
        >
          ▶
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  message: {
    color: "#fff",
    textAlign: "center",
    marginTop: "2rem",
    fontSize: "1.2rem",
  },
  heading: {
    color: "#fff",
    marginBottom: "1rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "1rem",
  },
  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: "8px",
    overflow: "hidden",
    color: "#fff",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  poster: {
    width: "100%",
    display: "block",
  },
  noPoster: {
    width: "100%",
    height: "240px",
    backgroundColor: "#333",
    color: "#999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.9rem",
  },
  info: {
    padding: "0.5rem",
    flexGrow: 1,
  },
  title: {
    fontSize: "1rem",
    margin: "0 0 0.5rem 0",
  },
  rating: {
    margin: 0,
    fontSize: "0.9rem",
    color: "#f1c40f",
  },
  typeLabel: {
    marginTop: "0.25rem",
    fontSize: "0.8rem",
    color: "#bbb",
    fontStyle: "italic",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "1rem",
    gap: "1rem",
  },
  pageButton: {
    backgroundColor: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "0.5rem 1rem",
    fontSize: "1rem",
  },
  pageInfo: {
    color: "#fff",
  },
};
