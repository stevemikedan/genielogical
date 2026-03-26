export { getDb, closeDb } from './db.ts';
export type { PersonRecord, EdgeRecord, SourceRecord, FlagRecord } from './db.ts';
export {
  listTrees,
  getTree,
  createTree,
  updateTreeMetadata,
  deleteTree,
  loadTreeGraph,
  saveTreeGraph,
  listCrossTreeLinks,
  saveCrossTreeLink,
  deleteCrossTreeLink,
  getCrossTreeLinksForTree,
} from './tree-repository.ts';
export type { LoadedTreeData } from './tree-repository.ts';
export { useAutoSave } from './auto-save.ts';
