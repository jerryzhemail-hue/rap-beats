#!/usr/bin/env node
/**
 * JWT Secret Key Generator
 * 
 * Usage:
 *   node scripts/generate-jwt-secret.js
 * 
 * 生成一个安全的 64 字符随机密钥，用于 JWT 认证。
 * 生产环境请务必使用新生成的密钥，替换 .env 文件中的值。
 */

const crypto = require('crypto');

const secret = crypto.randomBytes(64).toString('hex');

console.log('\n========================================');
console.log('JWT Secret Key Generator');
console.log('========================================\n');
console.log('Generated secret (64 characters):\n');
console.log(secret);
console.log('\n');
console.log('Add this to your .env file:');
console.log(`JWT_SECRET=${secret}`);
console.log('\n========================================');
console.log('安全提示：');
console.log('- 生产环境请使用此脚本重新生成密钥');
console.log('- 不要将密钥提交到代码仓库');
console.log('- 定期轮换密钥以提高安全性');
console.log('========================================\n');
