/**
 * 用更多别名补充下载 Rappers 头像
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

// 更多别名映射
const ALIAS_MAP = {
  'Melo': ['Melo', 'Melo紫薯', 'MeloRap'],
  '阿之': ['阿之', '阿之MZX', '阿之Rapper'],
  '毕冉': ['毕冉', '毕冉Phoenix'],
  '西奥Sio': ['西奥', '西奥Sio'],
  '陈令韬': ['陈令韬', '陈令韬_Gao'],
  'Lil Jet': ['Lil Jet', 'LilJet陆政廷', 'Lil Jet陆政廷'],
  'Merrie': ['Merrie', 'Merrie_'],
  '王奕': ['王奕', 'Toy王奕'],
  '林俊吉': ['林俊吉', '林俊吉Linjin'],
  '赵让': ['赵让', '赵让RANGE'],
  '鬼卞': ['鬼卞', '鬼卞Ghetti'],
  '马俊': ['马俊', '马俊_Jun'],
  'Kafe.Hu': ['Kafe.Hu', 'KafeHu'],
  '阿克江': ['阿克江', '阿克江A喀什K'],
  '木秦': ['木秦', '木秦MuQin'],
  '大狗': ['大狗', '大狗BigDog'],
  '黄硕': ['黄硕', '黄硕RockZ'],
  'Saber': ['Saber', 'Free-Out-Saber', 'Saber梁维嘉'],
  '小胖': ['小胖', '小胖YongGin'],
  'YoungGor': ['YoungGor', 'YoungGor_'],
  'LilAndy': ['LilAndy', '小安迪LilAndy'],
  '孙八一': ['孙八一', '孙八一_BK'],
  '未来酶': ['未来酶', '未来酶FutureMeme'],
};

function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
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
  console.log('🔍 继续补充下载头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');

  let updated = 0;
  let failed = [];

  for (const [name, aliases] of Object.entries(ALIAS_MAP)) {
    // 检查是否已有头像
    const [rows] = await db.execute('SELECT id, avatar_url FROM rappers WHERE name = ?', [name]);
    if (rows.length === 0 || (rows[0].avatar_url && rows[0].avatar_url.startsWith('/rappers/'))) {
      continue;
    }

    // 尝试别名
    let found = false;
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
          console.log(`  ✅ ${name}`);
          found = true;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 150));
    }
    
    if (!found) {
      failed.push(name);
      console.log(`  ❌ ${name}`);
    }
  }

  console.log(`\n✅ 补充更新: ${updated} 位`);
  console.log(`❌ 未找到: ${failed.length} 位\n`);

  if (failed.length > 0) {
    console.log('未找到头像的 rapper:');
    failed.forEach(name => console.log(`  - ${name}`));
  }

  // 显示最终结果
  const [all] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  const withAvatar = all.filter(r => r.avatar_url).length;
  console.log(`\n📊 最终统计: ${all.length} 位 rapper, ${withAvatar} 位有头像`);

  await db.end();
}

main().catch(console.error);
