/**
 * 通过搜索引擎下载 Rappers 头像
 * 使用 Bing 图片搜索
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
  '王以太', '未来酶', 'Melo', '阿之', '西奥Sio', 'Lil Jet',
  'Merrie', '王奕', '林俊吉', '赵让', '鬼卞', '马俊',
  'Kafe.Hu', '阿克江', '木秦', '大狗', '黄硕', 'Saber',
  '小胖', 'YoungGor', 'LilAndy', '孙八一'
];

// 下载图片
function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    
    const file = fs.createWriteStream(filepath);
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.bing.com/',
      }
    }, (res) => {
      // 处理重定向
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
      
      // 检查内容类型
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('image')) {
        file.close();
        resolve(null);
        return;
      }
      
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        // 检查文件大小
        const stats = fs.statSync(filepath);
        if (stats.size < 1000) {
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
    
    req.setTimeout(10000, () => {
      req.destroy();
      file.close();
      try { fs.unlinkSync(filepath); } catch (e) {}
      resolve(null);
    });
  });
}

// 从 Bing 图片搜索获取头像
function searchImageBing(name) {
  return new Promise((resolve) => {
    const searchQuery = `${name} 说唱 歌手`;
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&first=0&count=10`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 提取图片URL
        const matches = data.match(/murl\":\"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/gi);
        if (matches && matches.length > 0) {
          // 获取第一个结果并清理
          const imageUrl = matches[0].replace('murl\":\"', '').replace(/\\\//g, '/');
          resolve(imageUrl);
          return;
        }
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

// 从百度图片搜索获取头像
function searchImageBaidu(name) {
  return new Promise((resolve) => {
    const searchQuery = `${name} 说唱 rapper`;
    const url = `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(searchQuery)}`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://image.baidu.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 提取缩略图URL
        const matches = data.match(/\"thumbURL\":\"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/g);
        if (matches && matches.length > 0) {
          const imageUrl = matches[0].replace('"thumbURL":"', '').replace(/\\\//g, '/');
          resolve(imageUrl);
          return;
        }
        resolve('');
      });
    }).on('error', () => resolve(''));
  });
}

async function main() {
  console.log('🔍 通过互联网搜索下载 Rappers 头像...\n');

  const db = await mysql.createConnection(DB_CONFIG);
  const avatarDir = path.join(__dirname, '..', 'public', 'rappers');

  console.log(`📁 头像目录: ${avatarDir}\n`);

  let downloaded = 0;
  let failed = [];

  for (let i = 0; i < RAPPERS_TO_DOWNLOAD.length; i++) {
    const name = RAPPERS_TO_DOWNLOAD[i];
    
    // 获取 rapper id
    const [rows] = await db.execute('SELECT id FROM rappers WHERE name = ?', [name]);
    if (rows.length === 0) {
      console.log(`  ${i + 1}. ${name} - 数据库中未找到`);
      continue;
    }
    const id = rows[0].id;

    console.log(`  ${i + 1}/${RAPPERS_TO_DOWNLOAD.length}. ${name}...`);

    // 先尝试 Bing
    let imageUrl = await searchImageBing(name);
    
    // 如果 Bing 找不到，尝试百度
    if (!imageUrl) {
      imageUrl = await searchImageBaidu(name);
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

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n========================================`);
  console.log(`✅ 完成!`);
  console.log(`   成功下载: ${downloaded} 张`);
  console.log(`   失败: ${failed.length} 位`);
  if (failed.length > 0) {
    console.log(`   失败列表: ${failed.join(', ')}`);
  }
  console.log(`========================================\n`);

  // 最终统计
  const [all] = await db.execute('SELECT id, name, avatar_url FROM rappers ORDER BY id');
  const withAvatar = all.filter(r => r.avatar_url).length;
  console.log(`📊 最终统计: ${all.length} 位 rapper, ${withAvatar} 位有头像`);

  await db.end();
}

main().catch(console.error);
