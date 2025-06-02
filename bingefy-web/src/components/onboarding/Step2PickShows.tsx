// src/components/onboarding/Step2PickShows.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  getTrendingShows,
  getPopularShows,
  type TVShow,
  type MediaItem,
} from "../../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

export function Step2PickShows() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Now these are MediaItem[], not TVShow[]
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [selectedShows, setSelectedShows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch two rows: trending (row1), popular (row2)
  useEffect(() => {
    (async () => {
      try {
        const trendingResp = await getTrendingShows(1); // returns TVShow[]
        const popularResp = await getPopularShows(1);   // returns TVShow[]

        // Map each TVShow → MediaItem
        const trendingMedia: MediaItem[] = trendingResp.results.map(
          (tv: TVShow) => ({
            id: tv.id,
            title: tv.name,
            overview: tv.overview,
            poster_path: tv.poster_path,
            vote_average: tv.vote_average,
            type: "tv",
          })
        );

        const popularMedia: MediaItem[] = popularResp.results.map(
          (tv: TVShow) => ({
            id: tv.id,
            title: tv.name,
            overview: tv.overview,
            poster_path: tv.poster_path,
            vote_average: tv.vote_average,
            type: "tv",
          })
        );

        setTrending(trendingMedia);
        setPopular(popularMedia);
      } catch (err) {
        console.error(err);
        setError("Failed to load shows. Try again.");
      }
    })();
  }, []);

  const toggleShow = (id: number) => {
    setSelectedShows((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const handleNext = async () => {
    if (!user) {
      setError("User not found. Please log in again.");
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
      setError("Failed to save your show selections. Try again.");
    }
  };

  const handleLater = async () => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    await updateDoc(userDocRef, { showsOnboarded: [] });
    navigate("/onboarding/step3");
  };

  return (
    <div>
      <p style={styles.instructions}>
        Choose TV shows you’ve watched, are watching, or plan to watch.
      </p>
      {error && <p style={styles.error}>{error}</p>}

      <h3 style={styles.rowTitle}>Trending Shows</h3>
      <div style={styles.grid}>
        {trending.map((show) => (
          <div
            key={show.id}
            onClick={() => toggleShow(show.id)}
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

      <h3 style={styles.rowTitle}>Most-Added Shows</h3>
      <div style={styles.grid}>
        {popular.map((show) => (
          <div
            key={show.id}
            onClick={() => toggleShow(show.id)}
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
  instructions: {
    color: "#fff",
    marginBottom: "1rem",
    fontSize: "1rem",
  },
  rowTitle: {
    color: "#fff",
    marginTop: "1.5rem",
    marginBottom: "0.5rem",
    fontSize: "1.1rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: "0.5rem",
  },
  posterCell: {
    width: "100%",
    paddingBottom: "150%", // keep aspect ratio 2:3
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: "4px",
    cursor: "pointer",
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
