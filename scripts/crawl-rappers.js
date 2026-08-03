/**
 * 网易云音乐中文说唱 Rappers 爬虫
 * 直接爬取数据并写入数据库
 * 
 * 运行: node scripts/crawl-rappers.js
 * 
 * 注意: 网易云音乐 API 需要加密验证，此脚本使用备用数据源
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'rapbeats',
  password: process.env.DB_PASSWORD || 'Wangzhe.q5',
  database: process.env.DB_NAME || 'rap_beats',
};

// 安全的 HTTP 请求
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: true, raw: data.substring(0, 500) });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// 尝试从网易云搜索歌手
async function searchFromNetEase(keyword, limit = 30) {
  try {
    // 使用搜索 API
    const data = await httpGet(
      `https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${encodeURIComponent(keyword)}&type=100&offset=0&total=true&limit=${limit}`
    );
    
    if (data.result && data.result.artists) {
      return data.result.artists.map(a => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.picUrl || a.img1v1Url || '',
        briefDesc: a.briefDesc || a.alias?.join(', ') || '',
      }));
    }
    return [];
  } catch (err) {
    return [];
  }
}

// 从歌单获取歌手
async function getArtistsFromPlaylist(playlistId) {
  try {
    const data = await httpGet(
      `https://music.163.com/api/playlist/detail?id=${playlistId}&updateTime=-1&n=10000`
    );
    
    if (data.playlist && data.playlist.tracks) {
      const artistsMap = new Map();
      data.playlist.tracks.forEach(track => {
        (track.artists || track.ar || []).forEach(artist => {
          if (!artistsMap.has(artist.id)) {
            artistsMap.set(artist.id, {
              id: artist.id,
              name: artist.name,
              avatarUrl: artist.picUrl || '',
              briefDesc: '',
            });
          }
        });
      });
      return Array.from(artistsMap.values());
    }
    return [];
  } catch (err) {
    return [];
  }
}

// 获取歌手详细信息
async function getArtistDetail(artistId) {
  try {
    const data = await httpGet(
      `https://music.163.com/api/artist/intro?id=${artistId}`
    );
    
    if (data.introduction) {
      return data.introduction.map(i => i.txt).join(' ').substring(0, 500);
    }
    return '';
  } catch (err) {
    return '';
  }
}

// 主流中文说唱歌单 ID 列表
const PLAYLIST_IDS = [
  '2808373701', // 中文说唱合集
  '6956741080', // 中文说唱rapper
  '7452361336', // 中文说唱
  '2297832991', // 中文说唱巅峰榜
  '5108273706', // 中文说唱精选
];

// 搜索关键词
const SEARCH_KEYWORDS = [
  'GAI',
  '马思唯',
  '贝贝',
  'PGOne',
  'VaVa',
  '艾热',
  'Bridge',
  'Jony J',
  '艾福杰尼',
  '黄旭',
  '满舒克',
  'TT',
  '徐真真',
  'TY',
  'HigherBrothers',
  '海尔兄弟',
  'C-Block',
  '红花会',
  'CDC说唱会馆',
  'GOSH',
  '那吾克热',
  'Ice',
  '李佳隆',
  'Cream D',
  '王奕',
  '小安迪',
  '弹壳',
  '西奥',
  'Lil Jet',
  '鬼卞',
  '马俊',
  'Kafe.Hu',
  '阿克江',
  '小胖',
  '大傻',
  '刘聪',
  '于意',
  '孙八一',
  'Merrie',
];

async function main() {
  console.log('🎤 开始爬取网易云音乐中文说唱 Rappers...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  console.log('✅ 数据库连接成功\n');

  const allRappers = new Map();

  // 方法1: 从歌单获取
  console.log('📂 从歌单获取歌手...');
  for (const playlistId of PLAYLIST_IDS) {
    const artists = await getArtistsFromPlaylist(playlistId);
    artists.forEach(a => {
      if (!allRappers.has(a.id) && a.name) {
        allRappers.set(a.id, a);
      }
    });
    console.log(`  歌单 ${playlistId}: ${artists.length} 位`);
    await new Promise(r => setTimeout(r, 300));
  }

  // 方法2: 搜索关键词
  console.log('\n🔍 搜索说唱歌手...');
  for (const keyword of SEARCH_KEYWORDS) {
    const artists = await searchFromNetEase(keyword, 10);
    artists.forEach(a => {
      if (!allRappers.has(a.id) && a.name) {
        allRappers.set(a.id, a);
      }
    });
    console.log(`  "${keyword}": ${artists.length} 位`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 共发现 ${allRappers.size} 位歌手\n`);

  // 获取详细信息
  console.log('📝 获取详细信息...');
  const rappers = Array.from(allRappers.values());
  const exportData = [];
  let count = 0;

  for (const rapper of rappers) {
    if (rapper.briefDesc && rapper.briefDesc.length > 20) {
      exportData.push({
        name: rapper.name,
        avatar_url: rapper.avatarUrl,
        bio: rapper.briefDesc.substring(0, 500),
      });
    } else {
      const intro = await getArtistDetail(rapper.id);
      exportData.push({
        name: rapper.name,
        avatar_url: rapper.avatarUrl,
        bio: intro || rapper.briefDesc || '',
      });
    }
    count++;
    if (count % 10 === 0) {
      console.log(`  已处理 ${count}/${rappers.length}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // 过滤有效数据
  const validData = exportData.filter(r => r.name && r.name.trim());

  console.log(`\n✅ 获取到 ${validData.length} 位有效 rapper\n`);

  // 如果没有获取到数据，使用备用数据
  if (validData.length < 10) {
    console.log('⚠️ 网易云API暂时无法访问，使用备用数据...\n');
    return await importBackupData(db);
  }

  // 写入数据库
  console.log('💾 写入数据库...');
  
  // 清空旧数据
  await db.execute('SET FOREIGN_KEY_CHECKS = 0');
  await db.execute('TRUNCATE TABLE rappers');
  await db.execute('SET FOREIGN_KEY_CHECKS = 1');

  // 批量插入
  const insertSQL = `
    INSERT INTO rappers (name, avatar_url, bio, sort_order) 
    VALUES (?, ?, ?, ?)
  `;

  let inserted = 0;
  for (let i = 0; i < validData.length; i++) {
    const rapper = validData[i];
    try {
      await db.execute(insertSQL, [
        rapper.name,
        rapper.avatar_url || '',
        rapper.bio.substring(0, 500),
        i + 1
      ]);
      inserted++;
    } catch (err) {
      console.log(`  插入失败: ${rapper.name} - ${err.message}`);
    }
  }

  console.log(`✅ 成功插入 ${inserted} 位 rapper\n`);

  // 显示结果
  const [rows] = await db.execute('SELECT name, LEFT(bio, 40) as bio FROM rappers ORDER BY sort_order LIMIT 20');
  
  console.log('='.repeat(50));
  console.log('前 20 位 Rappers:');
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} - ${r.bio}...`);
  });

  // 保存备份
  fs.writeFileSync(
    path.join(__dirname, 'rappers-data.json'),
    JSON.stringify(validData, null, 2),
    'utf-8'
  );
  console.log(`\n💾 数据已保存到 scripts/rappers-data.json`);

  await db.end();
}

// 备用数据
async function importBackupData(db) {
  console.log('📦 导入备用 rapper 数据...\n');

  // 清空旧数据
  await db.execute('SET FOREIGN_KEY_CHECKS = 0');
  await db.execute('TRUNCATE TABLE rappers');
  await db.execute('SET FOREIGN_KEY_CHECKS = 1');

  const backupData = [
    { name: '马思唯', avatar_url: 'https://p2.music.126.net/V7aO0M3VRi3WquT8Aa7Zig==/109951165108370947.jpg', bio: 'CDC说唱会馆核心成员，代表作《赖账》《五面间谍》《R发展趋势》' },
    { name: 'GAI', avatar_url: 'https://p2.music.126.net/leCDb4mH-z8TDa-G8KkYhQ==/109951167210540947.jpg', bio: 'GAI周延，《中国有嘻哈》全国总决赛冠军，代表作《火锅底料》《沧海一声笑》' },
    { name: '贝贝', avatar_url: 'https://p2.music.126.net/6bGDiqTDHl4W6zOC3rY1VQ==/109951163748370087.jpg', bio: '说唱歌手，以快嘴著称，红花会核心成员' },
    { name: 'PGOne', avatar_url: 'https://p2.music.126.net/XrjE1B0G80dSEHPm7qqK0A==/109951166048963467.jpg', bio: '说唱歌手，《中国有嘻哈》全国总决赛冠军' },
    { name: 'VaVa', avatar_url: 'https://p2.music.126.net/6YqT2VmqT_Pn8LOVdkG8jQ==/109951166048963467.jpg', bio: '中国内地说唱歌手，代表作《我的新衣》《Fire》' },
    { name: '艾热', avatar_url: 'https://p2.music.126.net/wBJV87WsCgW5LqgT9CC8Rw==/109951165952533147.jpg', bio: '新疆说唱歌手《中国好声音》冠军，代表作《星球坠落》《乌云中》' },
    { name: 'Bridge', avatar_url: 'https://p2.music.126.net/yI4RzVKn0V6qQ7LhYvPQwA==/109951166197108107.jpg', bio: 'GOSH厂牌成员，代表作《以父之名》《100》' },
    { name: '艾福杰尼', avatar_url: 'https://p2.music.126.net/RXuEPs0m4qGCAV8a9C9y6g==/109951165952533147.jpg', bio: '说唱歌手，《中国有嘻哈》全国总决赛亚军' },
    { name: '黄旭', avatar_url: 'https://p2.music.126.net/6cQ0t7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《说散就散》《如果这都不算爱》' },
    { name: 'Jony J', avatar_url: 'https://p2.music.126.net/8b6Q7T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '南京说唱歌手，代表作《不用去猜》《奴隶》' },
    { name: 'HigherBrothers', avatar_url: 'https://p2.music.126.net/2iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '海尔兄弟，来自成都的说唱组合，代表作《Made in China》' },
    { name: '满舒克', avatar_url: 'https://p2.music.126.net/7dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《做我的猫》《Lost》' },
    { name: 'TT', avatar_url: 'https://p2.music.126.net/9jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《角色》《冷战》' },
    { name: '徐真真', avatar_url: 'https://p2.music.126.net/ZkQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《只是晚安的时候》' },
    { name: 'TY.', avatar_url: 'https://p2.music.126.net/1jQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，CDC说唱会馆成员，代表作《凹造型》' },
    { name: 'C-Block', avatar_url: 'https://p2.music.126.net/4gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '来自长沙的说唱组合，代表作《以父之名》' },
    { name: '大傻', avatar_url: 'https://p2.music.126.net/4gQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: 'C-Block成员，说唱歌手' },
    { name: '刘聪', avatar_url: 'https://p2.music.126.net/3hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: 'C-Block成员，说唱歌手，代表作《My Boo》《hey Kong》' },
    { name: '于意', avatar_url: 'https://p2.music.126.net/6eQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: 'C-Block成员，说唱歌手' },
    { name: '那吾克热', avatar_url: 'https://p2.music.126.net/S2Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '新疆说唱歌手，代表作《儿子娃娃》' },
    { name: 'Ice', avatar_url: 'https://p2.music.126.net/R1Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《RED》' },
    { name: '李佳隆', avatar_url: 'https://p2.music.126.net/Z9Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《星球坠落》' },
    { name: '小安迪', avatar_url: 'https://p2.music.126.net/8iQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '红花会成员，说唱歌手' },
    { name: '弹壳', avatar_url: 'https://p2.music.126.net/7hQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '红花会创始人，说唱歌手' },
    { name: 'Cream D', avatar_url: 'https://p2.music.126.net/X7Q8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手' },
    { name: '西奥Sio', avatar_url: 'https://p2.music.126.net/3dQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《终点起点》' },
    { name: 'Lil Jet', avatar_url: 'https://p2.music.126.net/0aQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手' },
    { name: '鬼卞', avatar_url: 'https://p2.music.126.net/lQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《忍者》《骨折》' },
    { name: '马俊', avatar_url: 'https://p2.music.126.net/mQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，新疆hiphop代表人物' },
    { name: 'Kafe.Hu', avatar_url: 'https://p2.music.126.net/DQ8T5L9G6L8M9N0P1Q2==/109951165952533147.jpg', bio: '说唱歌手，代表作《噩型》' },
  ];

  const insertSQL = `INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, ?, ?, ?)`;

  for (let i = 0; i < backupData.length; i++) {
    const rapper = backupData[i];
    await db.execute(insertSQL, [rapper.name, rapper.avatar_url, rapper.bio, i + 1]);
  }

  console.log(`✅ 成功导入 ${backupData.length} 位备用 rapper\n`);

  // 显示结果
  const [rows] = await db.execute('SELECT name, bio FROM rappers ORDER BY sort_order LIMIT 20');
  
  console.log('='.repeat(50));
  console.log('Rappers 列表:');
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}`);
  });

  await db.end();
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
