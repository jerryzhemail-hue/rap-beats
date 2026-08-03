/**
 * 用别名补充下载 Rappers 头像
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'rapbeats',
  password: process.env.DB_PASSWORD || 'Wangzhe.q5',
  database: process.env.DB_NAME || 'rap_beats',
};

// 别名映射
const ALIAS_MAP = {
  'TY.': ['TY唐逸', 'TY'],
  'HigherBrothers': ['更高兄弟', '海尔兄弟'],
  '于意': ['于意YEE'],
  '那吾克热': ['那吾克热NW'],
  '王以太': ['王以太A2'],
  '盛宇D-SHINE': ['盛宇'],
  '杨和苏KeyNG': ['杨和苏'],
  'ICE杨长青': ['ICE杨长青'],
  '宝石Gem': ['老舅宝石Gem', '宝石gem'],
  '3Bangz': ['3Bangz'],
  '未来酶': ['未来酶FutureMeme'],
  'Melo': ['Melo紫薯'],
  '阿之': ['阿之MZX'],
  '毕冉': ['毕冉Phoenix'],
  '西奥Sio': ['西奥Sio'],
  '陈令韬': ['陈令韬_Gao'],
  'Lil Jet': ['LilJet陆政廷'],
  'Merrie': ['Merrie'],
  '王奕': ['Toy王奕'],
  '林俊吉': ['林俊吉_Linjin'],
  '赵让': ['赵让RANGE'],
  '鬼卞': ['鬼卞Ghetti'],
  '马俊': ['马俊_Jun'],
  'Kafe.Hu': ['KafeHu'],
  '阿克江': ['阿克江A喀什K'],
  '木秦': ['木秦MuQin'],
  '大狗': ['大狗BigDog'],
  '黄硕': ['黄硕RockZ'],
  'Saber': ['Free-Out-Saber'],
  '小胖': ['小胖YongGin'],
  'YoungGor': ['YoungGor'],
  'LilAndy': ['小安迪LilAndy'],
  '孙八一': ['孙八一_BK'],
};

function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const file = fs.createWriteStream(filepath);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve);
        return;
      }
      if (response.statusCode !== 200) { file.close(); resolve(null); return; }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', () => { file.close(); resolve(null); });
  });
}

function searchArtistAvatar(name) {
  return new Promise((resolve) => {
    const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(name)}&type=100&limit=3`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://music.163.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.artists && json.result.artists[0]) {
            resolve(json.result.artists[0].picUrl || json.result.artists[0].img1v1Url || '');
            return;
          }
        } catch (e) {}
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

async function main() {
  console.log('🔍 用别名补充下载头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');

  let updated = 0;

  for (const [name, aliases] of Object.entries(ALIAS_MAP)) {
    // 检查是否已有头像
    const [rows] = await db.execute('SELECT id, avatar_url FROM rappers WHERE name = ?', [name]);
    if (rows.length === 0 || (rows[0].avatar_url && rows[0].avatar_url.startsWith('/rappers/'))) {
      continue;
    }

    // 尝试别名
    for (const alias of aliases) {
      const avatarUrl = await searchArtistAvatar(alias);
      if (avatarUrl) {
        const id = rows[0].id;
        const filename = `${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${id}.jpg`;
        const filepath = path.join(avatarDir, filename);
        
        const result = await downloadImage(avatarUrl, filepath);
        if (result) {
          await db.execute('UPDATE rappers SET avatar_url = ? WHERE id = ?', [`/rappers/${filename}`, id]);
          updated++;
          console.log(`  ✅ ${name} (别名: ${alias})`);
          break;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n✅ 补充更新: ${updated} 位\n`);

  // 显示最终结果
  const [all] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  const withAvatar = all.filter(r => r.avatar_url).length;
  console.log(`📊 统计: ${all.length} 位 rapper, ${withAvatar} 位有头像`);

  await db.end();
}

main().catch(console.error);
