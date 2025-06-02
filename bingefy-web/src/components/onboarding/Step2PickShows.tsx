// src/components/onboarding/Step2PickShows.tsx

import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  getTrendingShows,
  getPopularShows,
  type MediaItem,
} from "../../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

export function Step2PickShows() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [mostAdded, setMostAdded] = useState<MediaItem[]>([]);
  const [selectedShows, setSelectedShows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Refs for our two “Trending” rows and two “Most‐Added” rows
  const trendingRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const addedRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  // A ref to detect whether the user actually dragged (so we don’t treat drag as a “click”)
  const didDragRef = useRef(false);

  // Utility: split an array in half (for two rows)
  const splitInTwo = <T,>(arr: T[]): [T[], T[]] => {
    const half = Math.ceil(arr.length / 2);
    return [arr.slice(0, half), arr.slice(half)];
  };

  // Load two pages of “Trending” and two pages of “Most‐Added”
  useEffect(() => {
    (async () => {
      try {
        const [t1, t2, p1, p2] = await Promise.all([
          getTrendingShows(1),
          getTrendingShows(2),
          getPopularShows(1),
          getPopularShows(2),
        ]);

        // Convert both pages → a single array of MediaItem (type: "tv")
        const trendingItems: MediaItem[] = [
          ...t1.results.map((t) => ({
            id: t.id,
            title: t.name,
            overview: t.overview,
            poster_path: t.poster_path,
            vote_average: t.vote_average,
            type: "tv" as const,
          })),
          ...t2.results.map((t) => ({
            id: t.id,
            title: t.name,
            overview: t.overview,
            poster_path: t.poster_path,
            vote_average: t.vote_average,
            type: "tv" as const,
          })),
        ];
        const mostAddedItems: MediaItem[] = [
          ...p1.results.map((t) => ({
            id: t.id,
            title: t.name,
            overview: t.overview,
            poster_path: t.poster_path,
            vote_average: t.vote_average,
            type: "tv" as const,
          })),
          ...p2.results.map((t) => ({
            id: t.id,
            title: t.name,
            overview: t.overview,
            poster_path: t.poster_path,
            vote_average: t.vote_average,
            type: "tv" as const,
          })),
        ];

        setTrending(trendingItems);
        setMostAdded(mostAddedItems);
      } catch (err) {
        console.error(err);
        setError("Failed to load shows. Please try again.");
      }
    })();
  }, []);

  // When the user “mouse up” on a poster, only toggle if they did NOT drag
  const onPosterMouseUp = (id: number) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelectedShows((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  // “Next” / “Later” handlers
  const handleNext = async () => {
    if (!user) {
      setError("User not found. Please sign in again.");
      return;
    }
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        showsOnboarded: Array.from(selectedShows),
      });
      navigate("/onboarding/step3");
    } catch (err) {
      console.error(err);
      setError("Failed to save your selections. Try again.");
    }
  };
  const handleLater = async () => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    await updateDoc(userDocRef, { showsOnboarded: [] });
    navigate("/onboarding/step3");
  };

  // Generic hook: allows click‐and‐drag on a ref to scroll it horizontally
  function useHorizontalDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
      const element = ref.current!;
      if (!element) return;

      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      function onMouseDown(e: MouseEvent) {
        isDown = true;
        didDragRef.current = false; // reset at the start of every press
        startX = e.pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
        element.classList.add("dragging");
      }
      function onMouseLeave() {
        isDown = false;
        element.classList.remove("dragging");
      }
      function onMouseUp(e: MouseEvent) {
        // If the user moved more than 5px horizontally, count it as a drag
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
        const walk = (x - startX) * 1; // scroll speed factor = 1
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

  // Attach drag‐scroll to each row
  trendingRefs.forEach((r) => useHorizontalDragScroll(r));
  addedRefs.forEach((r) => useHorizontalDragScroll(r));

  // Split each category into two rows
  const [trendingRow1, trendingRow2] = splitInTwo(trending);
  const [addedRow1, addedRow2] = splitInTwo(mostAdded);

  return (
    <div style={styles.container}>
      <p style={styles.instructions}>
        Choose TV shows you’ve watched, are watching, or plan to watch.
      </p>
      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────────────────────────────────────────────────────────
          TRENDING SHOWS – ROW 1
      ───────────────────────────────────────────────────────────── */}
      <h3 style={styles.categoryTitle}>Trending Shows</h3>
      <div
        ref={trendingRefs[0]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {trendingRow1.map((show) => (
          <div
            key={show.id}
            onMouseUp={() => onPosterMouseUp(show.id)}
            style={{
              ...styles.posterCell,
              opacity: selectedShows.has(show.id) ? 1 : 0.5,
              backgroundImage: show.poster_path
                ? `url(${POSTER_BASE_URL}${show.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TRENDING SHOWS – ROW 2
      ───────────────────────────────────────────────────────────── */}
      <div
        ref={trendingRefs[1]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {trendingRow2.map((show) => (
          <div
            key={show.id}
            onMouseUp={() => onPosterMouseUp(show.id)}
            style={{
              ...styles.posterCell,
              opacity: selectedShows.has(show.id) ? 1 : 0.5,
              backgroundImage: show.poster_path
                ? `url(${POSTER_BASE_URL}${show.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MOST‐ADDED SHOWS – ROW 1
      ───────────────────────────────────────────────────────────── */}
      <h3 style={styles.categoryTitle}>Most‐Added Shows</h3>
      <div
        ref={addedRefs[0]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {addedRow1.map((show) => (
          <div
            key={show.id}
            onMouseUp={() => onPosterMouseUp(show.id)}
            style={{
              ...styles.posterCell,
              opacity: selectedShows.has(show.id) ? 1 : 0.5,
              backgroundImage: show.poster_path
                ? `url(${POSTER_BASE_URL}${show.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MOST‐ADDED SHOWS – ROW 2
      ───────────────────────────────────────────────────────────── */}
      <div
        ref={addedRefs[1]}
        className="no-scrollbar"
        style={styles.horizontalRow}
      >
        {addedRow2.map((show) => (
          <div
            key={show.id}
            onMouseUp={() => onPosterMouseUp(show.id)}
            style={{
              ...styles.posterCell,
              opacity: selectedShows.has(show.id) ? 1 : 0.5,
              backgroundImage: show.poster_path
                ? `url(${POSTER_BASE_URL}${show.poster_path})`
                : undefined,
            }}
          />
        ))}
      </div>

      <div style={styles.buttonsContainer}>
        <button onClick={handleLater} style={styles.laterButton}>
          Later
        </button>
        <button onClick={handleNext} style={styles.nextButton}>
          Next
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
  categoryTitle: {
    fontSize: "1.1rem",
    margin: "1rem 0 0.5rem 0",
  },
  horizontalRow: {
    display: "flex",
    gap: "0.5rem",
    overflowX: "auto",
    paddingBottom: "1rem",
    cursor: "grab",
    /* We rely on .no‐scrollbar class to hide the scrollbar itself. */
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
