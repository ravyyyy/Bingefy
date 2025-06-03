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

  // Refs for the two “Trending” rows and two “Most-Added” rows
  const trendingRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const addedRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  // A ref to detect whether the user actually dragged (so we don’t toggle on drag)
  const didDragRef = useRef(false);

  // Utility: split an array roughly in half
  const splitInTwo = <T,>(arr: T[]): [T[], T[]] => {
    const half = Math.ceil(arr.length / 2);
    return [arr.slice(0, half), arr.slice(half)];
  };

  // Fetch two pages of Trending and two pages of Most-Added
  useEffect(() => {
    (async () => {
      try {
        const [t1, t2, p1, p2] = await Promise.all([
          getTrendingShows(1),
          getTrendingShows(2),
          getPopularShows(1),
          getPopularShows(2),
        ]);

        // Convert each TVShow → MediaItem(type:"tv")
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

  // If user releases the mouse over a poster and they didn’t drag, toggle selection
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

  // “Next” handler
  const handleNext = async () => {
    if (!user) {
      setError("User not found. Please sign in again.");
      return;
    }
    if (selectedShows.size === 0) {
      // Won’t happen because button is disabled, but guard anyway
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

  // Generic “click-and-drag” horizontal scroll hook
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
        didDragRef.current = false; // reset
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
        const walk = (x - startX) * 1; // scroll speed = 1
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
  trendingRefs.forEach((r) => useHorizontalDragScroll(r));
  addedRefs.forEach((r) => useHorizontalDragScroll(r));

  // Split each category into two rows
  const [trendingRow1, trendingRow2] = splitInTwo(trending);
  const [addedRow1, addedRow2] = splitInTwo(mostAdded);

  return (
    <div style={styles.container}>
      {/* ─────────── INSTRUCTIONS & ERROR ─────────── */}
      <p style={styles.instructions}>
        Choose TV shows you’ve watched, are watching, or plan to watch.
      </p>

      {/* ─────────── TOP “Next” BUTTON ─────────── */}
      <div style={styles.topButtonContainer}>
        <button
          onClick={handleNext}
          disabled={selectedShows.size === 0}
          style={{
            ...styles.nextButton,
            opacity: selectedShows.size > 0 ? 1 : 0.5,
            cursor: selectedShows.size > 0 ? "pointer" : "not-allowed",
          }}
        >
          Next
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* ─────────── TRENDING SHOWS – ROW 1 ─────────── */}
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

      {/* ─────────── TRENDING SHOWS – ROW 2 ─────────── */}
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

      {/* ─────────── MOST-ADDED SHOWS – ROW 1 ─────────── */}
      <h3 style={styles.categoryTitle}>Most-Added Shows</h3>
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

      {/* ─────────── MOST-ADDED SHOWS – ROW 2 ─────────── */}
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

      {/* ─────────── BOTTOM “Next” BUTTON ─────────── */}
      <div style={styles.bottomButtonsContainer}>
        <button
          onClick={handleNext}
          disabled={selectedShows.size === 0}
          style={{
            ...styles.nextButton,
            opacity: selectedShows.size > 0 ? 1 : 0.5,
            cursor: selectedShows.size > 0 ? "pointer" : "not-allowed",
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    /* 
      Enough top padding so that none of the rows hide under your navbar.
      If your navbar is ~60px tall, 80-100px will safely push content below it.
    */
    padding: "100px 1rem 1rem",
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
  bottomButtonsContainer: {
    display: "flex",
    justifyContent: "center",
    marginTop: "2rem",
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
