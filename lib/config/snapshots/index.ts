// lib/config/snapshots/index.ts
//
// Barrel: aggrega tutti gli snapshot di configurazione. Quando aggiungerai
// un nuovo snapshot (system-pages, navigable-pages, redirects, ...) basterà
// re-exportare qui sotto. Il pattern è sempre lo stesso:
//   - read<Name>Snapshot()  — hot path, cached + ETag check
//   - sync<Name>Snapshot()  — admin action, await dopo mutation
//   - get<Name>SnapshotHealth() — per il widget admin di monitoring

export {
  readAppSettingsSnapshot,
  syncAppSettingsSnapshot,
  getAppSettingsSnapshotHealth,
  SnapshotUnavailableError,
  SnapshotStorageError,
  type SnapshotHealth,
} from "./app-settings";
