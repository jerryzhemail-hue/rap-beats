import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv } from '../database/index.js';
import { isRemoteStorageEnabled, resolveLocalAssetPath, saveBuffer, type StorageKind } from '../services/storage.js';

type BeatAssetRow = {
  id: number;
  file_path: string;
  cover_image: string | null;
};

type UserAvatarRow = {
  id: number;
  avatar_url: string | null;
};

type MigrationCounters = {
  scanned: number;
  migrated: number;
  skipped: number;
  missing: number;
  failed: number;
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readFileBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

async function migrateStoredValue(
  kind: StorageKind,
  storedValue: string | null | undefined,
  options: {
    deleteLocalAfterSuccess: boolean;
    fileNamePrefix?: string;
  } = { deleteLocalAfterSuccess: false }
): Promise<{
  status: 'migrated' | 'skipped' | 'missing';
  nextValue: string | null;
}> {
  if (!storedValue) {
    return { status: 'skipped', nextValue: storedValue ?? null };
  }

  const localPath = resolveLocalAssetPath(kind, storedValue);
  if (!localPath) {
    return { status: 'skipped', nextValue: storedValue };
  }

  if (!fs.existsSync(localPath)) {
    return { status: 'missing', nextValue: storedValue };
  }

  const uploaded = await saveBuffer(kind, {
    buffer: readFileBuffer(localPath),
    originalName: path.basename(localPath),
    fileNamePrefix: options.fileNamePrefix
  });

  if (options.deleteLocalAfterSuccess) {
    try {
      fs.unlinkSync(localPath);
    } catch {}
  }

  return {
    status: 'migrated',
    nextValue: uploaded.storedValue
  };
}

function printSection(title: string, counters: MigrationCounters) {
  console.log(
    JSON.stringify(
      {
        section: title,
        ...counters
      },
      null,
      2
    )
  );
}

async function main() {
  if (!isRemoteStorageEnabled()) {
    console.error('当前 STORAGE_DRIVER 不是远程存储模式。请先在 .env 中设置 STORAGE_DRIVER=oss 再执行迁移。');
    process.exit(1);
  }

  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient(), getMembershipDatabaseClient());

  const deleteLocalAfterSuccess = hasFlag('--delete-local');
  const limit = Number(readArg('--limit') || '0');

  const database = getDatabaseClient();
  const beatRows = await database.queryMany<BeatAssetRow>('SELECT id, file_path, cover_image FROM beats ORDER BY id ASC');
  const userRows = await database.queryMany<UserAvatarRow>('SELECT id, avatar_url FROM users ORDER BY id ASC');

  const selectedBeatRows = limit > 0 ? beatRows.slice(0, limit) : beatRows;
  const selectedUserRows = limit > 0 ? userRows.slice(0, limit) : userRows;

  const audioCounters: MigrationCounters = { scanned: 0, migrated: 0, skipped: 0, missing: 0, failed: 0 };
  const coverCounters: MigrationCounters = { scanned: 0, migrated: 0, skipped: 0, missing: 0, failed: 0 };
  const avatarCounters: MigrationCounters = { scanned: 0, migrated: 0, skipped: 0, missing: 0, failed: 0 };

  for (const beat of selectedBeatRows) {
    audioCounters.scanned += 1;
    try {
      const audioResult = await migrateStoredValue('audio', beat.file_path, {
        deleteLocalAfterSuccess,
        fileNamePrefix: `beat-${beat.id}`
      });

      if (audioResult.status === 'migrated' && audioResult.nextValue) {
        await database.execute('UPDATE beats SET file_path = ? WHERE id = ?', [audioResult.nextValue, beat.id]);
        audioCounters.migrated += 1;
      } else if (audioResult.status === 'missing') {
        audioCounters.missing += 1;
      } else {
        audioCounters.skipped += 1;
      }
    } catch (error) {
      audioCounters.failed += 1;
      console.error(`迁移音频失败: beat#${beat.id}`, error);
    }

    coverCounters.scanned += 1;
    try {
      const coverResult = await migrateStoredValue('cover', beat.cover_image, {
        deleteLocalAfterSuccess,
        fileNamePrefix: `cover-${beat.id}`
      });

      if (coverResult.status === 'migrated') {
        await database.execute('UPDATE beats SET cover_image = ? WHERE id = ?', [coverResult.nextValue, beat.id]);
        coverCounters.migrated += 1;
      } else if (coverResult.status === 'missing') {
        coverCounters.missing += 1;
      } else {
        coverCounters.skipped += 1;
      }
    } catch (error) {
      coverCounters.failed += 1;
      console.error(`迁移封面失败: beat#${beat.id}`, error);
    }
  }

  for (const user of selectedUserRows) {
    avatarCounters.scanned += 1;
    try {
      const avatarResult = await migrateStoredValue('avatar', user.avatar_url, {
        deleteLocalAfterSuccess,
        fileNamePrefix: `avatar-${user.id}`
      });

      if (avatarResult.status === 'migrated') {
        await database.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarResult.nextValue, user.id]);
        avatarCounters.migrated += 1;
      } else if (avatarResult.status === 'missing') {
        avatarCounters.missing += 1;
      } else {
        avatarCounters.skipped += 1;
      }
    } catch (error) {
      avatarCounters.failed += 1;
      console.error(`迁移头像失败: user#${user.id}`, error);
    }
  }

  printSection('audio', audioCounters);
  printSection('cover', coverCounters);
  printSection('avatar', avatarCounters);

  if (deleteLocalAfterSuccess) {
    console.log('已启用 --delete-local，迁移成功的本地文件已删除。');
  } else {
    console.log('本次未删除本地文件。确认新地址正常后，可用 --delete-local 再执行一次清理。');
  }
}

main()
  .catch((error) => {
    console.error('迁移失败', error);
    process.exit(1);
  });
