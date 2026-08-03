/**
 * 网易云音乐中文说唱 Rappers 爬虫
 * 直接爬取数据并写入数据库
 * 
 * 运行: cd server && node scripts/crawl-rappers.js
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

// HTTP 请求
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
        'Cookie': 'appver=8.9.70; os=pc; osver=14.0.0; channel=netease;',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: true });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

// 精确的中文说唱歌手列表（从网易云搜索验证）
const CHINESE_RAPPERS = [
  { name: '马思唯', alias: ['Masiwei', 'masimasiwei'], bio: 'CDC说唱会馆核心成员，代表作《赖账》《五面间谍》' },
  { name: 'GAI周延', alias: ['GAI', 'GAI周延', 'GAI_'], bio: '《中国有嘻哈》冠军，代表作《火锅底料》《沧海一声笑》' },
  { name: '贝贝', alias: ['贝贝LilS对抗全世界'], bio: '红花会核心成员，以快嘴著称' },
  { name: 'PGOne', alias: ['PG_ONE', 'pgone', 'PGOne万磁王'], bio: '《中国有嘻哈》冠军，代表作《万磁王》' },
  { name: 'VaVa', alias: ['VaVa毛衍芬', 'vava'], bio: '中国内地说唱歌手，代表作《我的新衣》《Fire》' },
  { name: '艾热', alias: ['艾热AIR', 'AIR艾热'], bio: '新疆说唱歌手，《中国好声音》冠军，代表作《星球坠落》' },
  { name: 'Bridge', alias: ['布瑞吉Bridge', 'Bridge'], bio: 'GOSH厂牌成员，代表作《以父之名》《100》' },
  { name: '艾福杰尼', alias: ['艾福杰尼After...', '艾福杰尼'], bio: '《中国有嘻哈》亚军，代表作《凹造型》' },
  { name: '黄旭', alias: ['黄旭BooM', '黄旭'], bio: '说唱歌手，代表作《说散就散》《如果这都不算爱》' },
  { name: 'Jony J', alias: ['JonyJ', 'jonyj', '肖佳JonyJ'], bio: '南京说唱歌手，代表作《不用去猜》《奴隶》' },
  { name: '满舒克', alias: ['满舒克YungJu', '满舒克'], bio: '说唱歌手，代表作《做我的猫》《Lost》' },
  { name: 'TT', alias: ['TizzyT', 'Tizzy T', 'TT'], bio: '说唱歌手，代表作《角色》《冷战》' },
  { name: '徐真真', alias: ['徐真真2Real', '徐真真'], bio: '说唱歌手，代表作《只是晚安的时候》' },
  { name: 'TY.', alias: ['TY唐逸', 'TY.'], bio: 'CDC说唱会馆成员，代表作《凹造型》' },
  { name: 'HigherBrothers', alias: ['更高兄弟', '海尔兄弟', 'Higher Brothers'], bio: '成都说唱组合，代表作《Made in China》' },
  { name: '大傻', alias: ['C-Block大傻', '大傻C-Block', '大傻'], bio: 'C-Block成员，代表作《以父之名》' },
  { name: '刘聪', alias: ['KeyL刘聪', '刘聪KeyLo', '刘聪'], bio: 'C-Block成员，代表作《My Boo》《hey Kong》' },
  { name: '于意', alias: ['于意YEE', '于意'], bio: 'C-Block成员，说唱歌手' },
  { name: '那吾克热', alias: ['那吾克热NW', '那吾克热'], bio: '新疆说唱歌手，代表作《儿子娃娃》' },
  { name: '王以太', alias: ['王以太', '王以太A2'], bio: '说唱歌手，代表作《危险派对》' },
  { name: '盛宇D-SHINE', alias: ['盛宇D-SHINE', '盛宇'], bio: '说唱歌手，代表作《反赛道》' },
  { name: '杨和苏KeyNG', alias: ['杨和苏KeyNG', '杨和苏'], bio: '说唱歌手，《中国新说唱》选手' },
  { name: 'ICE杨长青', alias: ['ICE杨长青', 'Ice杨长青'], bio: '说唱歌手，代表作《Bad Guys》' },
  { name: 'Cream D', alias: ['CREAM D', 'CreamD'], bio: '说唱歌手' },
  { name: '新秀', alias: ['新秀XinXiu', '新秀'], bio: '说唱歌手，《说唱听我的》冠军' },
  { name: '宝石Gem', alias: ['宝石Gem', '老舅宝石Gem'], bio: '说唱歌手，代表作《野狼Disco》' },
  { name: '3Bangz', alias: ['3Bangz', '3邦子'], bio: '说唱歌手，代表作《塔栋天王》' },
  { name: '未来酶', alias: ['未来酶FutureMeme', '未来酶'], bio: '说唱歌手' },
  { name: '小安迪', alias: ['小安迪LilAndy', '小安迪'], bio: '红花会成员，说唱歌手' },
  { name: '弹壳', alias: ['弹壳K9999', '弹壳'], bio: '红花会创始人，说唱歌手' },
  { name: 'Melo', alias: ['Melo紫薯', 'Melo'], bio: '说唱歌手，红花会成员' },
  { name: '阿之', alias: ['阿之MZX', '阿之'], bio: '红花会成员，说唱歌手' },
  { name: '毕冉', alias: ['毕冉Phoenix', '毕冉'], bio: '说唱歌手' },
  { name: '西奥Sio', alias: ['西奥Sio', 'Sio西奥'], bio: '说唱歌手，代表作《终点起点》' },
  { name: '陈令韬', alias: ['陈令韬_Gao', '陈令韬'], bio: '说唱歌手，制作人' },
  { name: 'Lil Jet', alias: ['LilJet', 'Lil Jet'], bio: '说唱歌手' },
  { name: 'Merrie', alias: ['Merrie', '-merrie-'], bio: '说唱歌手' },
  { name: '王奕', alias: ['Toy王奕', '王奕'], bio: '说唱歌手' },
  { name: '林俊吉', alias: ['林俊吉_Linjin', '林俊吉'], bio: '说唱歌手' },
  { name: '赵让', alias: ['赵让RANGE', '赵让'], bio: '说唱歌手' },
  { name: '鬼卞', alias: ['鬼卞Ghetti', '鬼卞'], bio: '说唱歌手，代表作《忍者》《骨折》' },
  { name: '马俊', alias: ['马俊_Jun', '马俊'], bio: '新疆hiphop代表人物' },
  { name: 'Kafe.Hu', alias: ['KafeHu', 'Kafe.Hu'], bio: '说唱歌手，代表作《噩型》' },
  { name: '阿克江', alias: ['阿克江A喀什K', '阿克江'], bio: '说唱歌手' },
  { name: '木秦', alias: ['木秦MuQin', '木秦'], bio: '说唱歌手' },
  { name: '大狗', alias: ['大狗BigDog', '大狗'], bio: '说唱歌手' },
  { name: '黄硕', alias: ['黄硕RockZ', '黄硕'], bio: '丹镇北京成员，说唱歌手' },
  { name: 'Saber', alias: ['Saber', 'Free-Out-Saber'], bio: '说唱歌手，Free-Out厂牌成员' },
  { name: '小胖', alias: ['小胖YongGin', '小胖'], bio: 'CDC说唱会馆成员' },
  { name: 'YoungGor', alias: ['YoungGor', 'YoungGor_'], bio: '说唱歌手' },
  { name: 'LilAndy', alias: ['LilAndy', '小安迪LilAndy'], bio: '说唱歌手' },
  { name: '孙八一', alias: ['孙八一_BK', '孙八一'], bio: '说唱歌手，以商务风著称' },
];

// 从网易云搜索获取头像
async function searchAndGetAvatar(name, aliases) {
  for (const keyword of [name, ...aliases]) {
    try {
      const data = await httpGet(
        `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=100&limit=5`
      );
      
      if (data.result && data.result.artists) {
        for (const artist of data.result.artists) {
          const artistName = artist.name || '';
          // 精确匹配
          if (artistName === name || aliases.includes(artistName)) {
            return {
              avatarUrl: artist.picUrl || artist.img1v1Url || '',
              briefDesc: artist.briefDesc || '',
            };
          }
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  return { avatarUrl: '', briefDesc: '' };
}

// 获取歌手详细信息
async function getArtistIntro(artistId) {
  try {
    const data = await httpGet(
      `https://music.163.com/api/artist/intro?id=${artistId}`
    );
    
    if (data.introduction) {
      return data.introduction.map(i => i.txt).join(' ').substring(0, 500);
    }
  } catch (e) {}
  return '';
}

async function main() {
  console.log('🎤 开始爬取网易云音乐中文说唱 Rappers...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  console.log('✅ 数据库连接成功\n');

  // 清空旧数据
  await db.execute('SET FOREIGN_KEY_CHECKS = 0');
  await db.execute('TRUNCATE TABLE rappers');
  await db.execute('SET FOREIGN_KEY_CHECKS = 1');
  console.log('🗑️ 已清空旧数据\n');

  const insertSQL = `INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, ?, ?, ?)`;
  
  console.log('🔍 从网易云获取歌手头像...\n');
  
  let inserted = 0;
  for (let i = 0; i < CHINESE_RAPPERS.length; i++) {
    const rapper = CHINESE_RAPPERS[i];
    
    // 获取头像
    const info = await searchAndGetAvatar(rapper.name, rapper.alias);
    
    const avatarUrl = info.avatarUrl || '';
    const bio = info.briefDesc || rapper.bio || '';
    
    try {
      await db.execute(insertSQL, [rapper.name, avatarUrl, bio, i + 1]);
      inserted++;
      console.log(`  ${i + 1}. ${rapper.name} ✓`);
    } catch (err) {
      console.log(`  ${i + 1}. ${rapper.name} ✗ (${err.message})`);
    }
    
    if ((i + 1) % 5 === 0) {
      console.log(`  已处理 ${i + 1}/${CHINESE_RAPPERS.length}`);
    }
    
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n✅ 成功写入 ${inserted} 位 rapper\n`);

  // 显示结果
  const [rows] = await db.execute('SELECT id, name, avatar_url, LEFT(bio, 50) as bio FROM rappers ORDER BY sort_order');
  
  console.log('='.repeat(60));
  console.log('Rappers 列表:');
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} - ${r.avatar_url ? '✓有头像' : '✗无头像'}`);
    if (r.bio) {
      console.log(`   简介: ${r.bio}...`);
    }
  });

  // 统计
  const hasAvatar = rows.filter(r => r.avatar_url).length;
  console.log(`\n📊 统计: ${rows.length} 位 rapper, ${hasAvatar} 位有头像`);

  await db.end();
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
