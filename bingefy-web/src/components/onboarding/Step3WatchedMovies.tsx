// src/components/onboarding/Step3WatchedMovies.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getPopularMovies, type Movie, type MediaItem } from "../../services/tmdbClients";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w200";

export function Step3WatchedMovies() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State holds MediaItem[], not Movie[]
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Fetch Movie[]
        const resp = await getPopularMovies(1);

        // Map each Movie → MediaItem with type: "movie"
        const mediaItems: MediaItem[] = resp.results.map((m: Movie) => ({
          id: m.id,
          title: m.title,
          overview: m.overview,
          poster_path: m.poster_path,
          vote_average: m.vote_average,
          type: "movie",
        }));

        setMovies(mediaItems);
      } catch (err) {
        console.error(err);
        setError("Failed to load movies. Try again.");
      }
    })();
  }, []);

  const toggleMovie = (id: number) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const handleNext = async () => {
    if (!user) return;
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

  const handleLater = async () => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    await updateDoc(userDocRef, {
      moviesWatched: [],
    });
    navigate("/onboarding/step4");
  };

  return (
    <div>
      <p style={styles.instructions}>
        Select the movies you have already watched (or click “Later” to skip).
      </p>
      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.grid}>
        {movies.map((m) => (
          <div
            key={m.id}
            onClick={() => toggleMovie(m.id)}
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: "0.5rem",
  },
  posterCell: {
    width: "100%",
    paddingBottom: "150%",
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
