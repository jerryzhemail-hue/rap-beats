/**
 * 使用浏览器截图方式获取 Rappers 头像
 * 先搜索，然后右键保存图片
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

// 需要下载头像的 rapper
const RAPPERS_TO_DOWNLOAD = [
  '王以太', '未来酶', 'Melo', '阿之', '西奥', 'Lil Jet',
  'Merrie', '王奕', '林俊吉', '赵让', '鬼卞', '马俊',
  'Kafe.Hu', '阿克江', '木秦', '大狗', '黄硕', 'Saber',
  '小胖', 'YoungGor', 'LilAndy', '孙八一'
];

// 从 Google 图片搜索获取头像 (使用 SerpAPI 免费端点)
async function searchGoogleImages(name) {
  return new Promise((resolve) => {
    // 使用 Bing 图片搜索 API
    const searchQuery = `${name} 说唱 rapper`;
    const url = `https://cn.bing.com/images/async?q=${encodeURIComponent(searchQuery)}&first=0&count=10&datsrc=IAC&layout=RowColumn`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': 'MUID=test',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 尝试多种图片URL模式
        const patterns = [
          /src="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi,
          /murl":"(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp))"/gi,
          /img src="(data:image\/[^;]+;[^"]+)"/gi,
        ];
        
        for (const pattern of patterns) {
          const matches = data.match(pattern);
          if (matches && matches.length > 0) {
            let imageUrl = matches[0].replace(/^[^"]+"/, '').replace(/"$/, '');
            // 清理 URL
            imageUrl = imageUrl.replace(/\\+/g, '');
            if (imageUrl.startsWith('http')) {
              resolve(imageUrl);
              return;
            }
          }
        }
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

// 从微博搜索获取头像
function searchWeiboImages(name) {
  return new Promise((resolve) => {
    const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(name + ' 说唱')}&Refer=index`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://weibo.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 提取微博用户头像
        const matches = data.match(/src="(https?:\/\/[^"]+?\/face\/[^"]+?\.(?:jpg|jpeg|png|webp))/gi);
        if (matches && matches.length > 0) {
          const imageUrl = matches[0].replace('src="', '');
          resolve(imageUrl);
          return;
        }
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

// 下载图片
function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) {
      resolve(null);
      return;
    }
    
    const file = fs.createWriteStream(filepath);
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadImage(res.headers.location, filepath).then(resolve);
        return;
      }
      
      if (res.statusCode !== 200) {
        file.close();
        resolve(null);
        return;
      }
      
      const contentType = res.headers['content-type'] || '';
      
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        if (stats.size < 5000) {
          fs.unlinkSync(filepath);
          resolve(null);
        } else {
          resolve(filepath);
        }
      });
    });
    
    req.on('error', () => {
      file.close();
      try { fs.unlinkSync(filepath); } catch (e) {}
      resolve(null);
    });
  });
}

async function main() {
  console.log('🔍 通过搜索引擎获取 Rappers 头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');

  let downloaded = 0;
  let failed = [];

  for (let i = 0; i < RAPPERS_TO_DOWNLOAD.length; i++) {
    const name = RAPPERS_TO_DOWNLOAD[i];
    
    const [rows] = await db.execute('SELECT id FROM rappers WHERE name = ?', [name]);
    if (rows.length === 0) continue;
    const id = rows[0].id;

    console.log(`  ${i + 1}/${RAPPERS_TO_DOWNLOAD.length}. ${name}...`);

    // Bing 图片搜索
    let imageUrl = await searchGoogleImages(name);
    
    if (!imageUrl) {
      console.log(`    尝试微博...`);
      imageUrl = await searchWeiboImages(name);
    }

    if (imageUrl) {
      const filename = `${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${id}.jpg`;
      const filepath = path.join(avatarDir, filename);
      
      const result = await downloadImage(imageUrl, filepath);
      
      if (result) {
        await db.execute('UPDATE rappers SET avatar_url = ? WHERE id = ?', [`/rappers/${filename}`, id]);
        downloaded++;
        console.log(`    ✅ 下载成功`);
      } else {
        failed.push(name);
        console.log(`    ❌ 下载失败`);
      }
    } else {
      failed.push(name);
      console.log(`    ❌ 搜索无结果`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n========================================`);
  console.log(`✅ 完成!`);
  console.log(`   成功: ${downloaded} 张`);
  console.log(`   失败: ${failed.length} 位`);
  console.log(`========================================\n`);

  const [all] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  const withAvatar = all.filter(r => r.avatar_url).length;
  console.log(`📊 统计: ${all.length} 位 rapper, ${withAvatar} 位有头像`);

  await db.end();
}

main().catch(console.error);
