// src/services/tmdbClients.ts

const API_KEY = import.meta.env.VITE_TMDB_API_KEY as string;
const BASE_URL = "https://api.themoviedb.org/3";

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

interface TmdbResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export async function getLatestMovies(page: number = 1): Promise<TmdbResponse<Movie>> {
  const url = new URL(`${BASE_URL}/discover/movie`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "release_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Eroare TMDB (latest movies): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<Movie>;
}

export async function getLatestTV(page: number = 1): Promise<TmdbResponse<TVShow>> {
  const url = new URL(`${BASE_URL}/discover/tv`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "first_air_date.desc");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Eroare TMDB (latest tv): ${response.status}`);
  }
  return (await response.json()) as TmdbResponse<TVShow>;
}

export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  type: "movie" | "tv";
}

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
    title: t.name, // „name” devine titlu
    overview: t.overview,
    poster_path: t.poster_path,
    vote_average: t.vote_average,
    type: "tv",
  }));

  const combined = [...moviesItems, ...tvItems];

  return {
    page: page,
    results: combined,
    total_pages: Math.min(moviesResp.total_pages, tvResp.total_pages),
  };
}
