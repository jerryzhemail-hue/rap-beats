import { Router } from 'express';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient, type DatabaseClient } from '../database/client.js';
import { serializeBeatAssets, serializeUserAssets } from '../utils/assets.js';

const router = Router();

const CONFIG_KEY = 'home_footer';

type LicenseCard = {
  id: string;
  icon: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type CreatorCta = {
  title: string;
  subtitle: string;
  buttonText: string;
  buttonUrl: string;
  isActive: boolean;
};

type FooterStat = {
  id: string;
  label: string;
  value: string;
  auto: 'none' | 'totalBeats' | 'totalRappers' | 'totalDownloads' | 'totalUsers';
  sortOrder: number;
  isActive: boolean;
};

type FooterLink = {
  id: string;
  label: string;
  url: string;
  group: 'quick' | 'service' | 'community' | 'support';
};

type FooterCompliance = {
  copyrightText: string;
  icp: string;
  icpUrl: string;
  police: string;
  policeUrl: string;
  email: string;
  emailLabel: string;
};

type SectionSettings = {
  isActive: boolean;
  title: string;
  subtitle: string;
};

type RappersSection = SectionSettings & {
  count: number;
};

type ChartsSection = SectionSettings & {
  count: number;
};

type SubscribeSection = SectionSettings & {
  buttonText: string;
};

type HomeFooterConfig = {
  licenseCards: LicenseCard[];
  creatorCta: CreatorCta;
  stats: FooterStat[];
  links: FooterLink[];
  compliance: FooterCompliance;
  membershipSection: SectionSettings;
  rappersSection: RappersSection;
  chartsSection: ChartsSection;
  subscribeSection: SubscribeSection;
};

async function loadRawConfig(db: DatabaseClient): Promise<HomeFooterConfig | null> {
  const row = await db.queryOne<{ config_value: string }>(
    'SELECT config_value FROM home_footer_config WHERE config_key = ? LIMIT 1',
    [CONFIG_KEY]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.config_value) as HomeFooterConfig;
  } catch {
    return null;
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toInt(value: unknown, fallback: number, min = 1, max = 12): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

function normalizeConfig(input: unknown): HomeFooterConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<HomeFooterConfig>;

  const licenseCards = Array.isArray(raw.licenseCards)
    ? raw.licenseCards.map((card, index): LicenseCard => ({
        id: asString((card as LicenseCard).id, `card-${index}`),
        icon: asString((card as LicenseCard).icon, '🎵'),
        title: asString((card as LicenseCard).title),
        description: asString((card as LicenseCard).description),
        ctaText: asString((card as LicenseCard).ctaText),
        ctaUrl: asString((card as LicenseCard).ctaUrl),
        sortOrder: Number((card as LicenseCard).sortOrder ?? index),
        isActive: Boolean((card as LicenseCard).isActive)
      }))
    : [];

  const creatorCtaRaw = (raw.creatorCta ?? {}) as Partial<CreatorCta>;
  const creatorCta: CreatorCta = {
    title: asString(creatorCtaRaw.title),
    subtitle: asString(creatorCtaRaw.subtitle),
    buttonText: asString(creatorCtaRaw.buttonText),
    buttonUrl: asString(creatorCtaRaw.buttonUrl),
    isActive: Boolean(creatorCtaRaw.isActive)
  };

  const stats = Array.isArray(raw.stats)
    ? raw.stats.map((stat, index): FooterStat => {
        const auto = (stat as FooterStat).auto;
        const validAuto = ['none', 'totalBeats', 'totalRappers', 'totalDownloads', 'totalUsers'].includes(auto)
          ? auto
          : 'none';
        return {
          id: asString((stat as FooterStat).id, `stat-${index}`),
          label: asString((stat as FooterStat).label),
          value: asString((stat as FooterStat).value),
          auto: validAuto as FooterStat['auto'],
          sortOrder: Number((stat as FooterStat).sortOrder ?? index),
          isActive: Boolean((stat as FooterStat).isActive)
        };
      })
    : [];

  const links = Array.isArray(raw.links)
    ? raw.links.map((link, index): FooterLink => {
        const group = (link as FooterLink).group;
        const validGroup = ['quick', 'service', 'community', 'support'].includes(group) ? group : 'quick';
        return {
          id: asString((link as FooterLink).id, `link-${index}`),
          label: asString((link as FooterLink).label),
          url: asString((link as FooterLink).url),
          group: validGroup as FooterLink['group']
        };
      })
    : [];

  const complianceRaw = (raw.compliance ?? {}) as Partial<FooterCompliance>;
  const compliance: FooterCompliance = {
    copyrightText: asString(complianceRaw.copyrightText),
    icp: asString(complianceRaw.icp),
    icpUrl: asString(complianceRaw.icpUrl),
    police: asString(complianceRaw.police),
    policeUrl: asString(complianceRaw.policeUrl),
    email: asString(complianceRaw.email),
    emailLabel: asString(complianceRaw.emailLabel, '联系我们')
  };

  const membershipRaw = (raw.membershipSection ?? {}) as Partial<SectionSettings>;
  const membershipSection: SectionSettings = {
    isActive: toBoolean(membershipRaw.isActive, true),
    title: asString(membershipRaw.title, '会员权益'),
    subtitle: asString(membershipRaw.subtitle, '选择适合你的创作节奏')
  };

  const rappersRaw = (raw.rappersSection ?? {}) as Partial<RappersSection>;
  const rappersSection: RappersSection = {
    isActive: toBoolean(rappersRaw.isActive, true),
    title: asString(rappersRaw.title, '热门制作人'),
    subtitle: asString(rappersRaw.subtitle, '跟着优秀的 Beatmaker 找到你的声音'),
    count: toInt(rappersRaw.count, 6, 3, 12)
  };

  const chartsRaw = (raw.chartsSection ?? {}) as Partial<ChartsSection>;
  const chartsSection: ChartsSection = {
    isActive: toBoolean(chartsRaw.isActive, true),
    title: asString(chartsRaw.title, '热门榜单'),
    subtitle: asString(chartsRaw.subtitle, '下载 / 收藏 / 播放实时排行'),
    count: toInt(chartsRaw.count, 5, 3, 10)
  };

  const subscribeRaw = (raw.subscribeSection ?? {}) as Partial<SubscribeSection>;
  const subscribeSection: SubscribeSection = {
    isActive: toBoolean(subscribeRaw.isActive, true),
    title: asString(subscribeRaw.title, '新 Beat 上架提醒'),
    subtitle: asString(subscribeRaw.subtitle, '订阅后第一时间收到上新通知'),
    buttonText: asString(subscribeRaw.buttonText, '订阅')
  };

  return { licenseCards, creatorCta, stats, links, compliance, membershipSection, rappersSection, chartsSection, subscribeSection };
}

async function resolveStatsForPublic(config: HomeFooterConfig, db: DatabaseClient): Promise<FooterStat[]> {
  const cache: Record<string, string> = {};

  async function count(sql: string): Promise<string> {
    if (cache[sql] !== undefined) return cache[sql];
    const value = (await db.queryOne<{ count: number | null; total?: number | null }>(sql));
    const result = String(value?.total ?? value?.count ?? 0);
    cache[sql] = result;
    return result;
  }

  const resolvers: Record<Exclude<FooterStat['auto'], 'none'>, () => Promise<string>> = {
    totalBeats: () => count('SELECT COUNT(*) as count FROM beats'),
    totalRappers: () => count('SELECT COUNT(*) as count FROM rappers'),
    totalDownloads: () => count('SELECT SUM(download_count) as total FROM beats'),
    totalUsers: () => count('SELECT COUNT(*) as count FROM users')
  };

  const resolved: FooterStat[] = [];
  for (const stat of config.stats) {
    const resolver = stat.auto !== 'none' ? resolvers[stat.auto] : null;
    resolved.push({
      ...stat,
      value: resolver ? await resolver() : stat.value
    });
  }
  return resolved;
}

async function loadTopRappers(db: DatabaseClient, limit: number) {
  const rows = await db.queryMany<{ id: number; name: string; avatar_url: string | null; bio: string | null; beat_count: number }>(
    `
      SELECT r.id, r.name, r.avatar_url, r.bio, COUNT(bp.beat_id) AS beat_count
      FROM rappers r
      LEFT JOIN beat_producers bp ON bp.rapper_id = r.id
      GROUP BY r.id, r.name, r.avatar_url, r.bio
      ORDER BY beat_count DESC, r.sort_order ASC
      LIMIT ?
    `,
    [limit]
  );
  return rows.map((row) => serializeUserAssets(row));
}

async function loadCharts(db: DatabaseClient, limit: number) {
  const baseSelect = `
    SELECT b.id, b.title, b.producer, b.genre, b.bpm, b.\`key\`, b.duration,
           b.cover_image, b.is_free, b.is_vip_only,
           COALESCE(b.download_count, 0) AS download_count,
           b.created_at
  `;

  const downloads = await db.queryMany<any>(
    `${baseSelect} FROM beats b ORDER BY b.download_count DESC, b.created_at DESC, b.id DESC LIMIT ?`,
    [limit]
  );
  const favorites = await db.queryMany<any>(
    `${baseSelect}, COALESCE(f.favorite_count, 0) AS favorite_count
     FROM beats b
     LEFT JOIN (SELECT beat_id, COUNT(*) AS favorite_count FROM favorites GROUP BY beat_id) f ON f.beat_id = b.id
     ORDER BY f.favorite_count DESC, b.created_at DESC, b.id DESC
     LIMIT ?`,
    [limit]
  );
  const plays = await db.queryMany<any>(
    `${baseSelect}, COALESCE(p.play_count, 0) AS play_count
     FROM beats b
     LEFT JOIN (SELECT beat_id, COUNT(*) AS play_count FROM play_events GROUP BY beat_id) p ON p.beat_id = b.id
     ORDER BY p.play_count DESC, b.created_at DESC, b.id DESC
     LIMIT ?`,
    [limit]
  );

  return {
    downloads: downloads.map((row) => serializeBeatAssets(row)),
    favorites: favorites.map((row) => serializeBeatAssets(row)),
    plays: plays.map((row) => serializeBeatAssets(row))
  };
}

function normalizeFaq(input: unknown): { category: string; question: string; answer: string; sort_order: number; is_active: number } | null {
  const raw = (input && typeof input === 'object' ? input : {}) as {
    category?: unknown;
    question?: unknown;
    answer?: unknown;
    sort_order?: unknown;
    is_active?: unknown;
  };
  const question = asString(raw.question).trim();
  const answer = asString(raw.answer).trim();
  if (!question || !answer) return null;
  return {
    category: asString(raw.category, '通用').trim() || '通用',
    question,
    answer,
    sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 0,
    is_active: raw.is_active === false || raw.is_active === 0 || raw.is_active === '0' ? 0 : 1
  };
}

// 公开读取：首页尾部直接使用，统计数据会按配置自动填充
router.get('/home/footer', async (_req, res) => {
  const db = getDatabaseClient();
  const rawConfig = await loadRawConfig(db);
  if (!rawConfig) {
    return res.json({ config: null, faqs: [], rappers: [], charts: { downloads: [], favorites: [], plays: [] } });
  }

  const config = normalizeConfig(rawConfig);
  const faqs = await db.queryMany(
    'SELECT id, category, question, answer, sort_order, is_active, updated_at FROM home_footer_faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  );
  const resolvedStats = await resolveStatsForPublic(config, db);
  const rappers = await loadTopRappers(db, config.rappersSection.count);
  const charts = await loadCharts(db, config.chartsSection.count);
  res.json({ config: { ...config, stats: resolvedStats }, faqs, rappers, charts });
});

// 后台读取：返回补齐默认字段的配置（不填充自动统计值）
router.get('/admin/home-footer', requireAdmin, async (_req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const rawConfig = await loadRawConfig(db);
  const config = rawConfig ? normalizeConfig(rawConfig) : null;
  const faqs = await db.queryMany(
    'SELECT id, category, question, answer, sort_order, is_active, created_at, updated_at FROM home_footer_faqs ORDER BY sort_order ASC, id ASC'
  );
  res.json({ config, faqs });
});

router.put('/admin/home-footer/config', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const config = normalizeConfig(req.body);
  await db.execute(
    'UPDATE home_footer_config SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
    [JSON.stringify(config), CONFIG_KEY]
  );
  res.json({ config });
});

router.post('/admin/home-footer/faqs', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const faq = normalizeFaq(req.body);
  if (!faq) return res.status(400).json({ error: '请填写问题和答案' });

  const result = await db.execute(
    'INSERT INTO home_footer_faqs (category, question, answer, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
    [faq.category, faq.question, faq.answer, faq.sort_order, faq.is_active]
  );
  const created = await db.queryOne(
    'SELECT id, category, question, answer, sort_order, is_active, created_at, updated_at FROM home_footer_faqs WHERE id = ?',
    [result.insertId]
  );
  res.status(201).json({ faq: created });
});

router.put('/admin/home-footer/faqs/:id', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const faq = normalizeFaq(req.body);
  if (!faq) return res.status(400).json({ error: '请填写问题和答案' });

  const existing = await db.queryOne<{ id: number }>('SELECT id FROM home_footer_faqs WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'FAQ 不存在' });

  await db.execute(
    'UPDATE home_footer_faqs SET category = ?, question = ?, answer = ?, sort_order = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
    [faq.category, faq.question, faq.answer, faq.sort_order, faq.is_active, req.params.id]
  );
  const updated = await db.queryOne(
    'SELECT id, category, question, answer, sort_order, is_active, created_at, updated_at FROM home_footer_faqs WHERE id = ?',
    [req.params.id]
  );
  res.json({ faq: updated });
});

router.delete('/admin/home-footer/faqs/:id', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  await db.execute('DELETE FROM home_footer_faqs WHERE id = ?', [req.params.id]);
  res.json({ message: '删除成功' });
});

router.post('/admin/home-footer/faqs/reorder', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const items = Array.isArray((req.body as { items?: { id?: number; sort_order?: number }[] }).items)
    ? ((req.body as { items: { id?: number; sort_order?: number }[] }).items)
    : [];

  if (items.length === 0) return res.status(400).json({ error: '缺少排序数据' });

  for (const item of items) {
    if (!item.id) continue;
    const order = Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 0;
    await db.execute('UPDATE home_footer_faqs SET sort_order = ?, updated_at = NOW() WHERE id = ?', [order, item.id]);
  }
  res.json({ message: '排序已保存' });
});

// 公开订阅：首页尾部收集用户邮箱
router.post('/home/footer/subscribe', async (req, res) => {
  const db = getDatabaseClient();
  const email = asString((req.body as { email?: unknown }).email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '请输入有效的邮箱地址' });
  }

  try {
    await db.execute('INSERT INTO subscriptions (email, source) VALUES (?, ?)', [email, 'footer']);
    return res.json({ message: '订阅成功' });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.json({ message: '您已订阅，无需重复订阅' });
    }
    throw error;
  }
});

// 后台订阅列表
router.get('/admin/home-footer/subscriptions', requireAdmin, async (_req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const subscriptions = await db.queryMany(
    'SELECT id, email, source, is_active, created_at FROM subscriptions ORDER BY created_at DESC, id DESC'
  );
  res.json({ subscriptions });
});

router.delete('/admin/home-footer/subscriptions/:id', requireAdmin, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  await db.execute('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
  res.json({ message: '删除成功' });
});

export default router;
