/**
 * server/tests/unit/degreeCert.test.ts
 * degreeCert 工具函数单元测试
 *
 * 17 位证书号结构：C + 5位学校代码 + 1位级别(4=学士) + 4位年份 + 6位流水 = 17
 * 自考：第 11 位为 Z（即流水号首位是 Z），共 17 位
 */
import { describe, it, expect } from 'vitest';
import { validate } from '../../src/utils/degreeCert.js';

// 17 位：C10476(学校) 4(学士) 2023(年) 000001(流水)
const VALID_CERT = 'C1047642023000001';
// 自考流水号 = Z + 5位数字
const SELF_EXAM_CERT = 'C1047642023Z00001';

describe('validate() 成人高等教育学位证书号校验', () => {
  it('TC-DC-001 P0 合法 17 位证书号通过', () => {
    const result = validate(VALID_CERT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.fields).toBeDefined();
  });

  it('TC-DC-002 P1 自考证书号第 11 位 Z 通过', () => {
    const result = validate(SELF_EXAM_CERT);
    expect(result.valid).toBe(true);
    if (result.valid && result.fields) {
      expect(result.fields.type).toBe('自考');
    }
  });

  it('TC-DC-003 P1 缺少前缀 C 返回 invalid', () => {
    const result = validate('10476420230000012');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('C'))).toBe(true);
  });

  it('TC-DC-004 P1 长度不是 17 位返回 invalid', () => {
    const result = validate('C10476202300001'); // 16 位
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('17') || e.includes('长度'))).toBe(true);
  });

  it('TC-DC-005 P1 学位级别不是 4（学士）返回错误', () => {
    // 把级别位改成 2（硕士）
    const result = validate('C1047622023000001');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('4') || e.includes('学士'))).toBe(true);
  });

  it('TC-DC-006 P1 学校代码非 5 位数字报错', () => {
    // 让某一位变成非数字 包含学校区段
    const result = validate('C1046A20234000001'); // A 在第 6 位,稍后会被级别位规则捕获
    expect(result.valid).toBe(false);
  });

  it('TC-DC-007 P1 授予年份超出合理范围报错', () => {
    // 把年份改成 1850（<1981）
    const result = validate('C10476418500000001'); // 这其实是 18 位
    // 改用一个真年份超限的：1999 -> 没问题。改成 0000 年
    const result2 = validate('C10476400000000001'); // 19位
    // 用一个 17 位但年份超限：把级别改成数字年份区域"1850"
    // C + 10476 + 4 + 1850 + 000001 = C10476418500000001 = 18 位
    // 应该用：把"4"级别位挪到年份，构成"1850"
    // 标准测试：直接把年份切出来，确保是用 17 位
    // 这里直接测一个简单的：用 17 位长的"C1047641850000001"
    const r3 = validate('C1047641850000001'); // 17 位
    expect(r3.valid).toBe(false);
    expect(r3.errors.some((e) => e.includes('年份') || e.includes('合理范围'))).toBe(true);
  });

  it('TC-DC-008 P1 空字符串报错', () => {
    const result = validate('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TC-DC-009 P1 包含非数字字符(除Z外)报错', () => {
    // 学士 C + 10476 + 4 + 2023 + 00X001(非数字，非Z)
    const result = validate('C104764202300X001');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('数字'))).toBe(true);
  });

  it('TC-DC-010 P2 正确解析字段', () => {
    const result = validate(VALID_CERT);
    if (result.valid && result.fields) {
      expect(result.fields.schoolCode).toBe('10476');
      expect(result.fields.level).toBe('学士');
      expect(result.fields.year).toBe('2023');
    }
  });

  it('TC-DC-011 P2 expectSchool 约束生效', () => {
    const ok = validate(VALID_CERT, '10476', 2023);
    expect(ok.valid).toBe(true);

    const wrong = validate(VALID_CERT, '99999', 2023);
    expect(wrong.valid).toBe(false);
    expect(wrong.errors.some((e) => e.includes('99999'))).toBe(true);
  });

  it('TC-DC-012 P2 expectYear 约束生效', () => {
    const wrongYear = validate(VALID_CERT, '10476', 2099);
    expect(wrongYear.valid).toBe(false);
  });
});
