/**
 * 制作人/艺人名称归一化：同一人的不同写法统一到保留名，
 * 避免在频道（rappers 表）里产生重复条目。
 */
const ARTIST_NAME_ALIASES: Record<string, string> = {
  'MC热狗': '热狗 MC HotDog',
  'jonyJ': 'Jony J',
  'knownknow': 'knowknow',
  'repeter': 'repeter吴嘉轩',
};

export function normalizeArtistName(name: string): string {
  return ARTIST_NAME_ALIASES[name] || name;
}
