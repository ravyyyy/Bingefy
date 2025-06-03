// src/services/tmdbClients.ts

const API_KEY = import.meta.env.VITE_TMDB_API_KEY as string;
const BASE_URL = "https://api.themoviedb.org/3";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Interfaces for Movie, TVShow, and a normalized MediaItem
// ─────────────────────────────────────────────────────────────────────────────

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
}

export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  type: "movie" | "tv";
}

interface TmdbResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Fetch “latest” (i.e. sorted‐by‐date‐desc) movies & TV shows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recently released movies (descending by release_date).
 */
export async function getLatestMovies(
  page: number = 1
): Promise<TmdbResponse<Movie>> {
  const url = new URL(`${BASE_URL}/discover/movie`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "release_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (latest movies): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<Movie>;
}

/**
 * Fetch the most recently aired TV shows (descending by first_air_date).
 */
export async function getLatestTV(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/discover/tv`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "first_air_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (latest tv): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

/**
 * Combine “latest movies” and “latest TV shows” into one MediaItem list.
 */
export async function getLatestMedia(
  page: number = 1
): Promise<{ page: number; results: MediaItem[]; total_pages: number }> {
  const [moviesResp, tvResp] = await Promise.all([
    getLatestMovies(page),
    getLatestTV(page),
  ]);

  const moviesItems: MediaItem[] = moviesResp.results.map((m) => ({
    id: m.id,
    title: m.title,
    overview: m.overview,
    poster_path: m.poster_path,
    vote_average: m.vote_average,
    type: "movie",
  }));

  const tvItems: MediaItem[] = tvResp.results.map((t) => ({
    id: t.id,
    title: t.name,
    overview: t.overview,
    poster_path: t.poster_path,
    vote_average: t.vote_average,
    type: "tv",
  }));

  // Intersect total_pages so we don't exceed either
  const combinedTotalPages = Math.min(
    moviesResp.total_pages,
    tvResp.total_pages
  );

  return {
    page,
    results: [...moviesItems, ...tvItems],
    total_pages: combinedTotalPages,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) “Trending” and “Popular” endpoints for TV shows and movies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch trending TV shows over the last week.
 */
export async function getTrendingShows(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/trending/tv/week`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (trending shows): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

/**
 * Fetch the most popular TV shows (by number of viewers).
 */
export async function getPopularShows(
  page: number = 1
): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/tv/popular`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (popular shows): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

/**
 * Fetch the most popular movies (by number of votes and views).
 */
export async function getPopularMovies(
  page: number = 1
): Promise<TmdbResponse<Movie>> {
  const url = new URL(`${BASE_URL}/movie/popular`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB Error (popular movies): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<Movie>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) NEW: Fetch full TV show details, including next_episode_to_air
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch full details for a single TV show (including `next_episode_to_air`).
 */
export async function getTVShowDetails(
  showId: number
): Promise<
  TVShow & {
    next_episode_to_air?: { season_number: number; episode_number: number };
  }
> {
  const url = new URL(`${BASE_URL}/tv/${showId}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `TMDB Error (get TV details for ID ${showId}): ${response.status}`
    );
  }
  return (await response.json()) as TVShow & {
    next_episode_to_air?: { season_number: number; episode_number: number };
  };
}
