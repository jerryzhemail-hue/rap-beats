#!/usr/bin/env node
/**
 * 从阿里云 OSS 恢复 Beat 数据（用于 OSS 有音频/封面、但数据库 Beat 记录丢失或为测试数据的情况）
 *
 * 运行方式（在 rap-beats-server 容器内执行，容器自带 DB / OSS 环境变量和 node_modules）：
 *   # 1. 把脚本拷进容器
 *   docker cp server/scripts/restore-beats-from-oss.cjs rap-beats-server:/tmp/
 *   # 2. 在容器内运行
 *   docker exec -e NODE_PATH=/app/node_modules rap-beats-server node /tmp/restore-beats-from-oss.cjs
 *
 * 行为：
 *   - 列出 OSS 的 audio/ 与 covers/ 对象，按文件名时间戳（毫秒）配对封面
 *   - 下载音频读取元数据（标题/艺人/时长/BPM），无元数据时用可读时间兜底
 *   - 默认跳过已存在的 file_path（幂等，不会产生重复）；如需先清空现有 beats，
 *     设置环境变量 RESTORE_DELETE_EXISTING=1
 *
 * 环境变量（容器内已具备）：DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME、
 *   OSS_REGION/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_ENDPOINT/OSS_PUBLIC_BASE_URL、
 *   OSS_AUDIO_PREFIX/OSS_COVER_PREFIX（目录前缀隔离，本地开发用 dev/audio、dev/covers）、
 *   UPLOADED_BY（上传者用户 id，默认 4，本地可按实际用户调整）
 */

const mysql = require('mysql2/promise');
const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const MAIN = process.env.DB_NAME || 'rap_beats';
const BASE = process.env.OSS_PUBLIC_BASE_URL;
const DELETE_EXISTING = process.env.RESTORE_DELETE_EXISTING === '1';
const UPLOADED_BY = Number(process.env.UPLOADED_BY || 4);
// 支持 OSS 目录前缀隔离（本地开发用 dev/ 前缀，默认保持线上根目录行为）
const AUDIO_PREFIX = (process.env.OSS_AUDIO_PREFIX || 'audio').replace(/^\/+|\/+$/g, '');
const COVER_PREFIX = (process.env.OSS_COVER_PREFIX || 'covers').replace(/^\/+|\/+$/g, '');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}（请确认在服务器容器内运行）`);
  return v;
}

function ossClient() {
  return new OSS({
    region: requireEnv('OSS_REGION'),
    bucket: requireEnv('OSS_BUCKET'),
    accessKeyId: requireEnv('OSS_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv('OSS_ACCESS_KEY_SECRET'),
    endpoint: process.env.OSS_ENDPOINT || undefined,
    secure: true
  });
}

async function listAll(client, prefix) {
  const out = [];
  let marker = null;
  do {
    const res = await client.list({ prefix, marker, 'max-keys': 1000 });
    for (const o of res.objects || []) out.push(o);
    marker = res.nextMarker;
  } while (marker);
  return out;
}

function parseTs(name) {
  const base = String(name).split('/').pop();
  const m = /^(?:audio|cover)-(\d+)-/.exec(base);
  return m ? Number(m[1]) : null;
}

function readableTs(ts) {
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return String(ts);
  }
}

async function main() {
  const client = ossClient();
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'mysql',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: requireEnv('DB_PASSWORD'),
    charset: 'utf8mb4'
  });

  const audios = (await listAll(client, `${AUDIO_PREFIX}/`)).filter((o) => parseTs(o.name));
  const covers = (await listAll(client, `${COVER_PREFIX}/`)).filter((o) => parseTs(o.name));
  console.log(`[oss] audio=${audios.length} 个, cover=${covers.length} 个`);
  if (audios.length === 0) {
    console.log('[oss] 没有可恢复的音频，退出');
    await conn.end();
    return;
  }

  // 音频-封面按时间戳配对（同一次上传相差毫秒级）
  const pairs = [];
  for (const a of audios) {
    const ats = parseTs(a.name);
    let best = null;
    for (const c of covers) {
      const diff = Math.abs(ats - parseTs(c.name));
      if (diff <= 10000 && (!best || diff < best.diff)) best = { cover: c, diff };
    }
    pairs.push({ audio: a, cover: best?.cover || null });
  }
  console.log(`[oss] 音频-封面配对 ${pairs.filter((p) => p.cover).length}/${audios.length}`);

  if (DELETE_EXISTING) {
    const [del] = await conn.query('DELETE FROM `' + MAIN + '`.beats');
    console.log(`[db] RESTORE_DELETE_EXISTING=1：已清空 beats（${del.affectedRows} 条）`);
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of pairs) {
    const key = p.audio.name;
    const audioUrl = `${BASE}/${key}`;
    const tmp = '/tmp/' + path.basename(key);
    try {
      const [dup] = await conn.query('SELECT id FROM `' + MAIN + '`.beats WHERE file_path = ?', [audioUrl]);
      if (dup.length > 0) { skipped++; continue; }

      await client.get(key, tmp);
      const meta = await mm.parseFile(tmp);
      const ts = parseTs(key);
      const title = meta.common.title || `Beat ${readableTs(ts)}`;
      const producer = meta.common.artist || 'Unknown';
      const genre = meta.common.genre?.[0] || '';
      const bpm = meta.common.bpm || 0;
      const duration = meta.format.duration ? Math.round(meta.format.duration) : 0;
      const coverUrl = p.cover ? `${BASE}/${p.cover.name}` : null;

      await conn.query(
        `INSERT INTO \`${MAIN}\`.beats
          (title, producer, rapper, bpm, \`key\`, genre, tags, duration, file_path, cover_image,
           download_count, is_free, is_vip_only, uploaded_by)
         VALUES (?, ?, NULL, ?, ?, ?, '[]', ?, ?, ?, 0, 0, 0, ?)`,
        [title, producer, bpm, '', genre, duration, audioUrl, coverUrl, UPLOADED_BY]
      );
      inserted++;
      console.log(`  [ok] ${title} | ${producer} | ${duration}s | cover=${p.cover ? 'Y' : 'N'}`);
    } catch (e) {
      failed++;
      console.error(`  [fail] ${key}: ${e.message}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  console.log(`=== 完成：插入 ${inserted}，跳过(已存在) ${skipped}，失败 ${failed} ===`);
  await conn.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
