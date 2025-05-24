import axios from 'axios';

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

console.log('API KEY:', process.env.TMDB_API_KEY);

export const getPopularMovies = async () => {
  const response = await axios.get(`${BASE_URL}/movie/popular`, {
    params: { api_key: API_KEY },
  });
  return response.data;
};
