import { useState, useCallback } from 'react';
import { HighScore } from './types';

const STORAGE_KEY = 'nitro_rush_highscores';
const MAX_SCORES = 10;

function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveScores(scores: HighScore[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch { /* ignore */ }
}

export function useHighScores() {
  const [scores, setScores] = useState<HighScore[]>(loadScores);

  const addScore = useCallback((score: number) => {
    const newEntry: HighScore = {
      score,
      date: new Date().toLocaleDateString(),
    };
    const updated = [...loadScores(), newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
    saveScores(updated);
    setScores(updated);
    return updated[0].score === score; // is new high score
  }, []);

  return { scores, addScore };
}
