// rapper 权重计算服务
import { getDatabaseClient } from '../database/index.js';

// 权重计算参数（可调整）
export const RAPPER_WEIGHTS = {
  beat_count: 100,      // 每首歌曲
  play_count: 1,        // 每次播放
  download_count: 10,   // 每次下载
  favorite_count: 20    // 每次收藏
};

// 更新单个 rapper 的 sort_order（基于综合得分）
export async function updateRapperSortOrderByName(rapperName: string): Promise<void> {
  if (!rapperName) return;
  
  const db = getDatabaseClient();
  
  // 检查 rapper 是否存在
  const rapper = await db.queryOne<{ id: number }>('SELECT id FROM rappers WHERE name = ?', [rapperName]);
  if (!rapper) return;
  
  // 查询该 rapper 的各项统计数据
  // 注意：beats 表没有 play_count 列，播放量从 play_events 表聚合
  const stats = await db.queryOne<{
    beat_count: number;
    play_count: number;
    download_count: number;
    favorite_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT b.id) as beat_count,
      COALESCE((SELECT COUNT(*) FROM play_events pe WHERE pe.beat_id IN (SELECT id FROM beats WHERE rapper = ?)), 0) as play_count,
      COALESCE(SUM(b.download_count), 0) as download_count,
      COUNT(DISTINCT f.id) as favorite_count
    FROM beats b
    LEFT JOIN favorites f ON f.beat_id = b.id
    WHERE b.rapper = ?
  `, [rapperName, rapperName]);

  const score = 
    (stats?.beat_count || 0) * RAPPER_WEIGHTS.beat_count +
    (stats?.play_count || 0) * RAPPER_WEIGHTS.play_count +
    (stats?.download_count || 0) * RAPPER_WEIGHTS.download_count +
    (stats?.favorite_count || 0) * RAPPER_WEIGHTS.favorite_count;

  // sort_order 越小越靠前，所以用负数得分
  await db.execute(
    'UPDATE rappers SET sort_order = ? WHERE id = ?',
    [-score, rapper.id]
  );
}

// 重新计算所有 rapper 的权重
export async function recalculateAllRapperWeights(): Promise<{ updated: number }> {
  const db = getDatabaseClient();
  const rappers = await db.queryMany<{ id: number; name: string }>('SELECT id, name FROM rappers');
  
  let updated = 0;
  for (const rapper of rappers) {
    await updateRapperSortOrderByName(rapper.name);
    updated++;
  }
  
  return { updated };
}
