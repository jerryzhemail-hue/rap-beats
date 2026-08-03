/**
 * 使用 Puppeteer 浏览器自动化下载 Rappers 头像
 * 需要先安装: npm install puppeteer
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function downloadWithPuppeteer(name, id, avatarDir) {
  try {
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 访问百度图片搜索
    const searchUrl = `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(name + ' 说唱 rapper')}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // 等待图片加载
    await page.waitForSelector('.item > .imgitem img, .main-img', { timeout: 5000 }).catch(() => {});
    
    // 获取第一张图片 URL
    const imageUrl = await page.evaluate(() => {
      const img = document.querySelector('.item > .imgitem img, .main-img, .hover-img img, .imgitem img');
      return img ? (img.src || img.getAttribute('data-img-url') || '') : '';
    });
    
    await browser.close();
    
    if (imageUrl && imageUrl.startsWith('http')) {
      // 下载图片
      const filename = `${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${id}.jpg`;
      const filepath = path.join(avatarDir, filename);
      
      const response = await fetch(imageUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(buffer));
        
        const stats = fs.statSync(filepath);
        if (stats.size > 5000) {
          return filepath;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`  浏览器错误: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 使用浏览器自动化下载头像...\n');
  console.log('(需要安装 puppeteer，如果未安装请运行: npm install puppeteer)\n');

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

    const filepath = await downloadWithPuppeteer(name, id, avatarDir);
    
    if (filepath) {
      const filename = path.basename(filepath);
      await db.execute('UPDATE rappers SET avatar_url = ? WHERE id = ?', [`/rappers/${filename}`, id]);
      downloaded++;
      console.log(`    ✅ 下载成功`);
    } else {
      failed.push(name);
      console.log(`    ❌ 失败`);
    }

    await new Promise(r => setTimeout(r, 1000));
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
