// src/components/onboarding/Step4ToWatchMovies.tsx

import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getPopularMovies, type Movie, type MediaItem } from "../../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

export function Step4ToWatchMovies() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const rowRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const didDragRef = useRef(false);

  // Load ~2 pages of popular movies, convert each Movie→MediaItem
  useEffect(() => {
    (async () => {
      try {
        const m1 = await getPopularMovies(1);
        const m2 = await getPopularMovies(2);
        const combinedMovies: Movie[] = [...m1.results, ...m2.results];

        const items: MediaItem[] = combinedMovies.map((m) => ({
          id: m.id,
          title: m.title,
          overview: m.overview,
          poster_path: m.poster_path,
          vote_average: m.vote_average,
          type: "movie" as const,
        }));
        setMediaItems(items);
      } catch (err) {
        console.error(err);
        setError("Failed to load movies. Try again.");
      }
    })();
  }, []);

  // Split array into two rows
  const splitInTwo = <T,>(arr: T[]): [T[], T[]] => {
    const half = Math.ceil(arr.length / 2);
    return [arr.slice(0, half), arr.slice(half)];
  };
  const [row1, row2] = splitInTwo(mediaItems);

  // Drag‐to‐scroll hook
  function useHorizontalDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
      const element = ref.current!;
      if (!element) return;

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      function onMouseDown(e: MouseEvent) {
        isDown = true;
        didDragRef.current = false;
        startX = e.pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
        element.classList.add("dragging");
      }
      function onMouseLeave() {
        isDown = false;
        element.classList.remove("dragging");
      }
      function onMouseUp(e: MouseEvent) {
        if (isDown && Math.abs(e.pageX - (startX + element.offsetLeft)) > 5) {
          didDragRef.current = true;
        }
        isDown = false;
        element.classList.remove("dragging");
      }
      function onMouseMove(e: MouseEvent) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - element.offsetLeft;
        const walk = (x - startX) * 1;
        element.scrollLeft = scrollLeft - walk;
      }

      element.addEventListener("mousedown", onMouseDown);
      element.addEventListener("mouseleave", onMouseLeave);
      element.addEventListener("mouseup", onMouseUp);
      element.addEventListener("mousemove", onMouseMove);

      return () => {
        element.removeEventListener("mousedown", onMouseDown);
        element.removeEventListener("mouseleave", onMouseLeave);
        element.removeEventListener("mouseup", onMouseUp);
        element.removeEventListener("mousemove", onMouseMove);
      };
    }, [ref]);
  }
  rowRefs.forEach((r) => useHorizontalDragScroll(r));

  // onMouseUp toggles only if there was no actual drag
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

  const handleFinish = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        moviesToWatch: Array.from(selected),
        onboarded: true,
      });
      navigate("/shows");
    } catch {
      setError("Could not save your “to watch” list. Try again.");
    }
  };
  const handleLater = async () => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    await updateDoc(userDocRef, {
      moviesToWatch: [],
      onboarded: true,
    });
    navigate("/shows");
  };

  return (
    <div style={styles.container}>
      <p style={styles.instructions}>
        Choose the movies you want to watch (or click “Later” to finish).
      </p>
      {error && <p style={styles.error}>{error}</p>}

      {/* ROW 1 */}
      <div ref={rowRefs[0]} className="no‐scrollbar" style={styles.horizontalRow}>
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

      {/* ROW 2 */}
      <div ref={rowRefs[1]} className="no‐scrollbar" style={styles.horizontalRow}>
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

      <div style={styles.buttonsContainer}>
        <button onClick={handleLater} style={styles.laterButton}>
          Later
        </button>
        <button onClick={handleFinish} style={styles.nextButton}>
          Finish
        </button>
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
  buttonsContainer: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "2rem",
  },
  laterButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#555",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
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
  },
};
