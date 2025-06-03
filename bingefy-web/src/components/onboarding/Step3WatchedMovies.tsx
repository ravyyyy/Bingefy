// src/components/onboarding/Step3WatchedMovies.tsx

import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getPopularMovies, type MediaItem } from "../../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

export function Step3WatchedMovies() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Refs for the two rows
  const rowRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  // A ref to detect whether the user actually dragged
  const didDragRef = useRef(false);

  // Split an array roughly in half
  const splitInTwo = <T,>(arr: T[]): [T[], T[]] => {
    const half = Math.ceil(arr.length / 2);
    return [arr.slice(0, half), arr.slice(half)];
  };

  // Fetch two pages of popular movies
  useEffect(() => {
    (async () => {
      try {
        const [p1, p2] = await Promise.all([
          getPopularMovies(1),
          getPopularMovies(2),
        ]);

        const items: MediaItem[] = [
          ...p1.results.map((m) => ({
            id: m.id,
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
            type: "movie" as const,
          })),
          ...p2.results.map((m) => ({
            id: m.id,
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
            type: "movie" as const,
          })),
        ];

        setMovies(items);
      } catch (err) {
        console.error(err);
        setError("Failed to load movies. Please try again.");
      }
    })();
  }, []);

  // On mouse-up, toggle only if not a drag
  const onPosterMouseUp = (id: number) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  // “Next” always enabled
  const handleNext = async () => {
    if (!user) {
      setError("User not found. Please sign in again.");
      return;
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        moviesWatched: Array.from(selected),
      });
      navigate("/onboarding/step4");
    } catch {
      setError("Could not save your watched-movies list. Try again.");
    }
  };

  // Generic “click-and-drag” scroll hook
  function useHorizontalDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
      const element = ref.current;
      if (!element) return;

      // Create a non-nullable alias so TS knows this cannot be null below:
      const el: HTMLDivElement = element;

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      function onMouseDown(e: MouseEvent) {
        isDown = true;
        didDragRef.current = false;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        el.classList.add("dragging");
      }
      function onMouseLeave() {
        isDown = false;
        el.classList.remove("dragging");
      }
      function onMouseUp(e: MouseEvent) {
        if (isDown && Math.abs(e.pageX - (startX + el.offsetLeft)) > 5) {
          didDragRef.current = true;
        }
        isDown = false;
        el.classList.remove("dragging");
      }
      function onMouseMove(e: MouseEvent) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1; // speed = 1
        el.scrollLeft = scrollLeft - walk;
      }

      el.addEventListener("mousedown", onMouseDown);
      el.addEventListener("mouseleave", onMouseLeave);
      el.addEventListener("mouseup", onMouseUp);
      el.addEventListener("mousemove", onMouseMove);

      return () => {
        el.removeEventListener("mousedown", onMouseDown);
        el.removeEventListener("mouseleave", onMouseLeave);
        el.removeEventListener("mouseup", onMouseUp);
        el.removeEventListener("mousemove", onMouseMove);
      };
    }, [ref]);
  }

  // Attach drag-scroll to each row
  rowRefs.forEach((r) => useHorizontalDragScroll(r));

  // Split movies into two rows
  const [row1, row2] = splitInTwo(movies);

  return (
    <div style={styles.container}>
      {/* ─────────── INSTRUCTIONS ─────────── */}
      <p style={styles.instructions}>
        Select the movies you have already watched.
      </p>

      {/* ─────────── TOP “Next” BUTTON ─────────── */}
      <div style={styles.topButtonContainer}>
        <button onClick={handleNext} style={styles.nextButton}>
          Next
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────── MOVIES WATCHED – ROW 1 ─────────── */}
      <div
        ref={rowRefs[0]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {row1.map((m) => (
          <div
            key={m.id}
            onMouseUp={() => onPosterMouseUp(m.id)}
            style={{
              ...styles.posterCell,
              opacity: selected.has(m.id) ? 1 : 0.5,
              backgroundImage: m.poster_path
                ? `url(${POSTER_BASE_URL}${m.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>

      {/* ─────────── MOVIES WATCHED – ROW 2 ─────────── */}
      <div
        ref={rowRefs[1]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {row2.map((m) => (
          <div
            key={m.id}
            onMouseUp={() => onPosterMouseUp(m.id)}
            style={{
              ...styles.posterCell,
              opacity: selected.has(m.id) ? 1 : 0.5,
              backgroundImage: m.poster_path
                ? `url(${POSTER_BASE_URL}${m.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: "1rem",
    color: "#fff",
  },
  instructions: {
    fontSize: "1rem",
    marginBottom: "1rem",
    textAlign: "center",
  },
  topButtonContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "1rem",
  },
  horizontalRow: {
    display: "flex",
    gap: "0.5rem",
    overflowX: "auto",
    paddingBottom: "1rem",
    cursor: "grab",
  },
  posterCell: {
    flex: "0 0 auto",
    width: "120px",
    height: "180px",
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: "4px",
    transition: "opacity 0.2s",
  },
  nextButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#e50914",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  error: {
    color: "salmon",
    marginBottom: "1rem",
    textAlign: "center",
  },
};
