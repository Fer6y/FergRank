import { loadAllData, type LoadedData } from './loadData';

// Single process-wide CSV load shared by every route/page. The Elo + history
// caches in eloEngine are keyed off this LoadedData instance, so keeping one
// instance means the chronological sweep runs at most once per process.
let cache: LoadedData | null = null;

export function getData(): LoadedData {
  if (!cache) cache = loadAllData();
  return cache;
}
