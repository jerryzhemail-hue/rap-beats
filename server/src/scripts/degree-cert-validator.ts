/**
 * 成人高等教育学士学位证书编号 校验 CLI
 *
 * 用法:
 *   cd server
 *   node --import tsx/esm src/scripts/degree-cert-validator.ts [编号...]
 */
import { validate, makeTemplate } from '../utils/degreeCert.js';

const examples = [
  'C1047642023009856', // 示例：河南师范大学，2023
  'C1000842023000001', // 北京科技大学，2023（模板占位示例）
  'C1000842023', // 长度错误
  'C100084X2023000001', // 非数字
  'D1047642023009856', // 前缀错误
];

function fmt(n: string): void {
  const r = validate(n);
  console.log(`编号: ${n}`);
  console.log(`  有效: ${r.valid}`);
  if (!r.valid) {
    console.log(`  错误: ${r.errors.join('；')}`);
    return;
  }
  const f = r.fields!;
  console.log(
    `  类型: ${f.type} | 学校: ${f.schoolCode}(${f.schoolName || '未知'})` +
      ` | 级别: ${f.level} | 年份: ${f.year} | 序号: ${f.serial}`,
  );
}

console.log(`北京科技大学模板占位示例: ${makeTemplate('10008', 2023)}\n`);
for (const n of examples) {
  fmt(n);
  console.log();
}

const args = process.argv.slice(2);
if (args.length > 0) {
  console.log('命令行校验结果：');
  for (const n of args) {
    const r = validate(n);
    console.log(`  ${n} -> ${r.valid ? '有效' : '无效'}${r.valid ? '' : ' ' + r.errors.join('；')}`);
  }
}
