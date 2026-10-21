import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  RULES_VERSION,
  StandError,
  parseRunResult,
  parseRunStart,
  sameResult,
  validateResult,
  type ControlMode,
  type LeaderboardEntry,
  type LeaderboardPage,
  type LeaderboardQuery,
  type RunResult,
  type RunStart,
  type StandRun,
} from './stand-domain.js';

interface DataFile {
  version: 1;
  runs: StandRun[];
}
const MAX_RUNS = 10_000;

/** One process owns this file. A queue serializes its writes; rename replaces atomically. */
export class StandStore {
  private data: DataFile = { version: 1, runs: [] };
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly lockToken = randomUUID();
  private get lockPath() {
    return join(this.directory, 'stand.lock');
  }

  private async acquireLock(): Promise<void> {
    let file;
    try {
      file = await open(this.lockPath, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          `Classement déjà verrouillé : ${this.lockPath}. Arrêtez l’autre serveur ou choisissez STAND_DATA_DIR. Après un arrêt brutal, vérifiez qu’aucun serveur n’utilise ce dossier avant de retirer uniquement stand.lock (voir docs/salon.md).`,
        );
      throw error;
    }
    try {
      await file.writeFile(
        JSON.stringify({
          pid: process.pid,
          token: this.lockToken,
          openedAt: new Date().toISOString(),
        }),
      );
      await file.sync();
    } catch (error) {
      await unlink(this.lockPath);
      throw error;
    } finally {
      await file.close();
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      const owner = JSON.parse(await readFile(this.lockPath, 'utf8')) as { token?: string };
      if (owner.token === this.lockToken) await unlink(this.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  private constructor(
    readonly directory: string,
    private readonly now: () => number,
  ) {}
  get path() {
    return join(this.directory, 'stand.json');
  }

  static async open(directory: string, now: () => number = Date.now): Promise<StandStore> {
    const store = new StandStore(directory, now);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await store.acquireLock();
    try {
      const info = await stat(store.path);
      if (info.size > 12 * 1_024 * 1_024) throw new Error('Fichier de classement trop volumineux.');
      const parsed = JSON.parse(await readFile(store.path, 'utf8')) as Partial<DataFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.runs) || parsed.runs.length > MAX_RUNS) {
        throw new Error('Format de classement non reconnu.');
      }
      const ids = new Set<string>();
      for (const run of parsed.runs) {
        if (
          !run ||
          typeof run.id !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(run.id) ||
          ids.has(run.id) ||
          typeof run.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(run.createdAt)) ||
          typeof run.rulesVersion !== 'string'
        )
          throw new Error('Partie stockée invalide.');
        parseRunStart(run);
        if (run.result) {
          parseRunResult(run.result);
          if (!Number.isFinite(Date.parse(run.result.finishedAt)))
            throw new Error('Date de résultat invalide.');
        }
        ids.add(run.id);
      }
      store.data = parsed as DataFile;
      await chmod(store.path, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await store.releaseLock();
        throw new Error(
          'Le fichier de classement est illisible ou invalide. Il est conservé ; restaurez une sauvegarde avant de redémarrer.',
          { cause: error },
        );
      }
      try {
        await store.persist(store.data);
      } catch (writeError) {
        await store.releaseLock();
        throw writeError;
      }
    }
    return store;
  }

  private async persist(data: DataFile): Promise<void> {
    const temporary = join(this.directory, `.stand-${process.pid}-${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(`${JSON.stringify(data)}\n`, 'utf8');
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporary, this.path);
    } finally {
      await file?.close();
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  private mutate<T>(change: (data: DataFile) => T): Promise<T> {
    if (this.closed) return Promise.reject(new StandError(503, 'Le classement est fermé.'));
    const work = this.queue.then(async () => {
      const next: DataFile = {
        version: 1,
        runs: this.data.runs.map((run) => ({
          ...run,
          ...(run.result ? { result: { ...run.result } } : {}),
        })),
      };
      const result = change(next);
      await this.persist(next);
      this.data = next;
      return result;
    });
    this.queue = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  create(start: RunStart): Promise<{ id: string }> {
    return this.mutate((data) => {
      if (data.runs.length >= MAX_RUNS)
        throw new StandError(
          503,
          'Le classement a atteint sa capacité. Exportez et archivez les données du stand.',
        );
      const run: StandRun = {
        ...start,
        id: randomUUID(),
        rulesVersion: RULES_VERSION,
        createdAt: new Date(this.now()).toISOString(),
      };
      data.runs.push(run);
      return { id: run.id };
    });
  }

  finish(id: string, result: RunResult): Promise<LeaderboardEntry> {
    return this.mutate((data) => {
      const run = data.runs.find((item) => item.id === id);
      if (!run) throw new StandError(404, 'Partie introuvable.');
      if (run.result) {
        if (!sameResult(run.result, result))
          throw new StandError(409, 'Cette partie possède déjà un résultat différent.');
      } else {
        validateResult(run, result, this.now());
        run.result = { ...result, finishedAt: new Date(this.now()).toISOString() };
      }
      return this.entry(run);
    });
  }

  private entry(run: StandRun): LeaderboardEntry {
    const { result, ...identity } = run;
    return { ...identity, ...result! };
  }

  async leaderboard(
    recipeId?: string,
    mode?: ControlMode,
    limit = 20,
  ): Promise<LeaderboardEntry[]> {
    return (await this.leaderboardPage({ recipeId, mode, limit })).entries;
  }

  async leaderboardPage({
    recipeId,
    mode,
    limit = 20,
    scope = 'current-rules',
    highlightEntryId,
  }: LeaderboardQuery = {}): Promise<LeaderboardPage> {
    await this.queue;
    const ranked = this.data.runs
      .filter(
        (run) =>
          run.result?.outcome === 'won' &&
          (scope === 'all-time' || run.rulesVersion === RULES_VERSION) &&
          (!recipeId || run.recipeId === recipeId) &&
          (!mode || run.mode === mode),
      )
      .map((run) => this.entry(run))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.bestCombo - left.bestCombo ||
          left.finishedAt.localeCompare(right.finishedAt) ||
          left.id.localeCompare(right.id),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const highlighted = ranked.find((entry) => entry.id === highlightEntryId);
    return {
      entries: ranked.slice(0, limit),
      total: ranked.length,
      highlight: highlighted ? { entry: highlighted, rank: highlighted.rank } : null,
      scope,
      rulesVersion: RULES_VERSION,
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.queue;
    await this.releaseLock();
  }
}
