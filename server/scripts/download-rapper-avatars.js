/**
 * 下载网易云音乐 Rappers 头像
 * 运行: cd server && node scripts/download-rapper-avatars.js
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { fileURLToPath as getFileURL } from 'url';

const __filename = getFileURL(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'rapbeats',
  password: process.env.DB_PASSWORD || 'Wangzhe.q5',
  database: process.env.DB_NAME || 'rap_beats',
};

// 下载图片
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }

    const file = fs.createWriteStream(filepath);
    
    // 根据URL选择协议
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        file.close();
        downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        resolve(null);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(filepath, () => {});
      resolve(null);
    });
  });
}

// 从网易云搜索获取头像
function searchArtistAvatar(name) {
  return new Promise((resolve) => {
    const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(name)}&type=100&limit=5`;
    
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, {
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
            for (const artist of json.result.artists) {
              if (artist.name === name || artist.name.includes(name)) {
                resolve(artist.picUrl || artist.img1v1Url || '');
                return;
              }
            }
            // 返回第一个结果
            if (json.result.artists[0]) {
              resolve(json.result.artists[0].picUrl || json.result.artists[0].img1v1Url || '');
              return;
            }
          }
        } catch (e) {}
        resolve('');
      });
    });
    
    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve('');
    });
  });
}

async function main() {
  console.log('🎤 开始下载 Rappers 头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  console.log('✅ 数据库连接成功\n');

  // 创建头像目录
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');
  if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
  }
  console.log(`📁 头像目录: ${avatarDir}\n`);

  // 获取所有 rapper
  const [rappers] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  
  console.log(`📊 共有 ${rappers.length} 位 rapper\n`);
  console.log('🔍 正在获取头像...\n');

  let updated = 0;
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < rappers.length; i++) {
    const rapper = rappers[i];
    
    // 如果已有头像，跳过
    if (rapper.avatar_url && rapper.avatar_url.startsWith('http')) {
      console.log(`  ${i + 1}. ${rapper.name} - 已有头像，跳过`);
      continue;
    }

    // 搜索头像
    const avatarUrl = await searchArtistAvatar(rapper.name);
    
    if (avatarUrl) {
      // 下载图片
      const filename = `${rapper.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${rapper.id}.jpg`;
      const filepath = path.join(avatarDir, filename);
      
      const result = await downloadImage(avatarUrl, filepath);
      
      if (result) {
        // 更新数据库 - 使用相对路径
        const relativePath = `/rappers/${filename}`;
        await db.execute('UPDATE rappers SET avatar_url = ? WHERE id = ?', [relativePath, rapper.id]);
        updated++;
        downloaded++;
        console.log(`  ${i + 1}. ${rapper.name} ✅ 已下载并更新`);
      } else {
        failed++;
        console.log(`  ${i + 1}. ${rapper.name} ❌ 下载失败`);
      }
    } else {
      failed++;
      console.log(`  ${i + 1}. ${rapper.name} ❌ 未找到头像`);
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n========================================`);
  console.log(`✅ 完成!`);
  console.log(`   更新数据库: ${updated} 位`);
  console.log(`   下载图片: ${downloaded} 张`);
  console.log(`   失败: ${failed} 位`);
  console.log(`========================================\n`);

  // 显示结果
  const [rows] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id LIMIT 20');
  
  console.log('前 20 位 rapper 头像状态:');
  rows.forEach((r, i) => {
    const status = r.avatar_url ? '✅' : '❌';
    console.log(`  ${i + 1}. ${status} ${r.name} - ${r.avatar_url || '无头像'}`);
  });

  await db.end();
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
