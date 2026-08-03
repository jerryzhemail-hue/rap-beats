/**
 * 尝试从网易云获取更多 rapper 头像
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'rapbeats',
  password: process.env.DB_PASSWORD || 'Wangzhe.q5',
  database: process.env.DB_NAME || 'rap_beats',
};

// 用更多别名搜索
const SEARCH_ALIASES = {
  '王以太': ['王以太', '王以太A2'],
  '未来酶': ['未来酶', 'FutureMeme'],
  'Melo': ['Melo', 'Melo紫薯'],
  '阿之': ['阿之', '阿之MZX'],
  '西奥Sio': ['西奥', '西奥Sio'],
  'Lil Jet': ['Lil Jet', 'LilJet陆政廷'],
  'Merrie': ['Merrie'],
  '王奕': ['王奕', 'Toy王奕'],
  '林俊吉': ['林俊吉'],
  '赵让': ['赵让', '赵让RANGE'],
  '鬼卞': ['鬼卞', '鬼卞Ghetti'],
  '马俊': ['马俊', '马俊_Jun'],
  'Kafe.Hu': ['Kafe.Hu', 'KafeHu'],
  '阿克江': ['阿克江', '阿克江A喀什K'],
  '木秦': ['木秦', '木秦MuQin'],
  '大狗': ['大狗', '大狗BigDog'],
  '黄硕': ['黄硕', '黄硕RockZ'],
  'Saber': ['Saber', 'Saber梁维嘉'],
  '小胖': ['小胖', '小胖YongGin'],
  'YoungGor': ['YoungGor'],
  'LilAndy': ['LilAndy', '小安迪LilAndy'],
  '孙八一': ['孙八一', '孙八一_BK'],
};

function searchNetEase(name) {
  return new Promise((resolve) => {
    const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(name)}&type=100&limit=10`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.artists) {
            // 精确匹配
            for (const artist of json.result.artists) {
              const artistName = artist.name || '';
              const alias = artist.alias || [];
              
              // 检查是否是目标 rapper
              for (const [targetName, aliases] of Object.entries(SEARCH_ALIASES)) {
                if (artistName === targetName || aliases.includes(artistName)) {
                  const avatarUrl = artist.picUrl || artist.img1v1Url || '';
                  if (avatarUrl) {
                    resolve(avatarUrl);
                    return;
                  }
                }
              }
            }
            // 如果没有精确匹配，返回第一个结果
            if (json.result.artists[0]) {
              const avatarUrl = json.result.artists[0].picUrl || json.result.artists[0].img1v1Url || '';
              resolve(avatarUrl);
              return;
            }
          }
        } catch (e) {}
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        downloadImage(response.headers.location, filepath).then(resolve);
        return;
      }
      if (response.statusCode !== 200) { file.close(); resolve(null); return; }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', () => { file.close(); resolve(null); });
  });
}

async function main() {
  console.log('🔍 尝试更多搜索方式获取头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');

  let downloaded = 0;
  let failed = [];

  for (const [name, aliases] of Object.entries(SEARCH_ALIASES)) {
    const [rows] = await db.execute('SELECT id, avatar_url FROM rappers WHERE name = ?', [name]);
    if (rows.length === 0) continue;
    
    // 已经有头像
    if (rows[0].avatar_url && rows[0].avatar_url.startsWith('/rappers/')) {
      console.log(`  ✅ ${name} - 已有头像`);
      continue;
    }

    console.log(`  🔍 ${name}...`);
    
    let found = false;
    for (const alias of aliases) {
      const avatarUrl = await searchNetEase(alias);
      if (avatarUrl) {
        const id = rows[0].id;
        const filename = `${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${id}.jpg`;
        const filepath = path.join(avatarDir, filename);
        
        const result = await downloadImage(avatarUrl, filepath);
        if (result) {
          await db.execute('UPDATE rappers SET avatar_url = ? WHERE id = ?', [`/rappers/${filename}`, id]);
          downloaded++;
          console.log(`    ✅ ${alias} 成功!`);
          found = true;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    
    if (!found) {
      failed.push(name);
      console.log(`    ❌ 未找到`);
    }
  }

  console.log(`\n✅ 完成! 额外获取: ${downloaded} 张`);
  
  const [all] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  const withAvatar = all.filter(r => r.avatar_url).length;
  console.log(`📊 统计: ${all.length} 位 rapper, ${withAvatar} 位有头像`);

  await db.end();
}

main().catch(console.error);
