import { config } from 'dotenv';
config();

import { getDatabaseClient } from '../database/index.js';

async function main() {
  const db = getDatabaseClient();

  const samples = [
    {
      name: '本周热门 rap 风格 TOP 10',
      image_url: 'https://picsum.photos/seed/rap-hot-1/1920/640',
      link_url: '/beats',
      sort_order: 1,
    },
    {
      name: '限时免费 — 新人礼包',
      image_url: 'https://picsum.photos/seed/rap-free-2/1920/640',
      link_url: '/register',
      sort_order: 2,
    },
    {
      name: 'VIP 会员限时 5 折',
      image_url: 'https://picsum.photos/seed/rap-vip-3/1920/640',
      link_url: '/vip',
      sort_order: 3,
    },
    {
      name: '社区最新动态',
      image_url: 'https://picsum.photos/seed/rap-forum-4/1920/640',
      link_url: '/forum',
      sort_order: 4,
    },
  ];

  for (const s of samples) {
    await db.execute(
      `INSERT INTO banners (name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration)
       VALUES (?, ?, ?, ?, 1, 45, 5)`,
      [s.name, s.image_url, s.link_url, s.sort_order]
    );
    console.log(`inserted ${s.name}`);
  }

  const rows = await db.queryMany<{ n: number }>(`SELECT COUNT(*) AS n FROM banners WHERE is_active = 1`);
  console.log(`active banners now: ${rows[0]?.n ?? 0}`);
  await db.close?.();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
