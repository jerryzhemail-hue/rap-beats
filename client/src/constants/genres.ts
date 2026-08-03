export type GenreChildOption = {
  label: string
  value: string
}

export type GenreCategoryOption = {
  label: string
  value: string
  children: GenreChildOption[]
}

export const genreCategoryOptions: GenreCategoryOption[] = [
  {
    label: '流行音乐（Pop）',
    value: 'pop',
    children: [
      { label: '主流流行（Mainstream Pop）', value: '主流流行（Mainstream Pop）' },
      { label: '流行舞曲（Dance Pop）', value: '流行舞曲（Dance Pop）' },
      { label: '抒情流行（Pop Ballad）', value: '抒情流行（Pop Ballad）' },
      { label: '国风流行（C-Pop 国风）', value: '国风流行（C-Pop 国风）' }
    ]
  },
  {
    label: '摇滚乐',
    value: 'rock',
    children: [
      { label: '经典摇滚（Classic Rock）', value: '经典摇滚（Classic Rock）' },
      { label: '朋克摇滚（Punk Rock）', value: '朋克摇滚（Punk Rock）' },
      { label: '英伦摇滚（Britpop）', value: '英伦摇滚（Britpop）' },
      { label: '民谣摇滚（Folk Rock）', value: '民谣摇滚（Folk Rock）' }
    ]
  },
  {
    label: '说唱音乐',
    value: 'rap',
    children: [
      { label: '老派说唱（Old School）', value: '老派说唱（Old School）' },
      { label: '东岸说唱（East Coast）', value: '东岸说唱（East Coast）' },
      { label: '西岸说唱 / G-Funk', value: '西岸说唱 / G-Funk' },
      { label: '陷阱说唱（Trap）', value: '陷阱说唱（Trap）' },
      { label: '旋律说唱（Melodic Rap）', value: '旋律说唱（Melodic Rap）' },
      { label: '爵士说唱（Jazz Rap）', value: '爵士说唱（Jazz Rap）' },
      { label: 'Drill', value: 'Drill' },
      { label: 'Boom Bap', value: 'Boom Bap' }
    ]
  },
  {
    label: '节奏布鲁斯 R&B',
    value: 'rnb',
    children: [
      { label: '经典 R&B', value: '经典 R&B' },
      { label: '灵魂乐（Soul）', value: '灵魂乐（Soul）' },
      { label: '新灵魂乐（Neo-Soul）', value: '新灵魂乐（Neo-Soul）' },
      { label: 'Trap Soul', value: 'Trap Soul' },
      { label: '放克（Funk）', value: '放克（Funk）' },
      { label: '另类 R&B（Alternative R&B）', value: '另类 R&B（Alternative R&B）' }
    ]
  },
  {
    label: '电子音乐（Electronic）',
    value: 'electronic',
    children: [
      { label: '浩室音乐（House）', value: '浩室音乐（House）' },
      { label: '科技舞曲（Techno）', value: '科技舞曲（Techno）' },
      { label: '鼓打贝斯（Drum & Bass）', value: '鼓打贝斯（Drum & Bass）' },
      { label: '迷幻出神（Trance）', value: '迷幻出神（Trance）' },
      { label: 'Lo-Fi 电子', value: 'Lo-Fi 电子' },
      { label: '商业电子舞曲（EDM）', value: '商业电子舞曲（EDM）' }
    ]
  }
]

const legacyGenreToChildValue: Record<string, string> = {
  Trap: '陷阱说唱（Trap）',
  '陷阱说唱（Trap）': '陷阱说唱（Trap）',
  'Boom Bap': 'Boom Bap',
  boombap: 'Boom Bap',
  Drill: 'Drill',
  'Old School': '老派说唱（Old School）',
  Pop: '主流流行（Mainstream Pop）',
  'Dance Pop': '流行舞曲（Dance Pop）',
  'Pop Ballad': '抒情流行（Pop Ballad）',
  'C-Pop': '国风流行（C-Pop 国风）',
  Rock: '经典摇滚（Classic Rock）',
  'Classic Rock': '经典摇滚（Classic Rock）',
  'Punk Rock': '朋克摇滚（Punk Rock）',
  Britpop: '英伦摇滚（Britpop）',
  'Folk Rock': '民谣摇滚（Folk Rock）',
  'East Coast': '东岸说唱（East Coast）',
  'G-Funk': '西岸说唱 / G-Funk',
  'Melodic Rap': '旋律说唱（Melodic Rap）',
  Jazz: '爵士说唱（Jazz Rap）',
  'Jazz Rap': '爵士说唱（Jazz Rap）',
  'R&B': '经典 R&B',
  Soul: '灵魂乐（Soul）',
  'Neo-Soul': '新灵魂乐（Neo-Soul）',
  Funk: '放克（Funk）',
  'Alternative R&B': '另类 R&B（Alternative R&B）',
  House: '浩室音乐（House）',
  Techno: '科技舞曲（Techno）',
  'Drum & Bass': '鼓打贝斯（Drum & Bass）',
  Trance: '迷幻出神（Trance）',
  'Lo-fi': 'Lo-Fi 电子',
  'Lo-Fi': 'Lo-Fi 电子',
  EDM: '商业电子舞曲（EDM）'
}

export const defaultGenreValue = '陷阱说唱（Trap）'
export const defaultGenreCategoryValue = 'rap'

export function getGenreChildrenByCategory(categoryValue: string) {
  return genreCategoryOptions.find((item) => item.value === categoryValue)?.children || []
}

export function normalizeGenreValue(rawGenre?: string | null) {
  if (!rawGenre) return defaultGenreValue

  const trimmed = rawGenre.trim()
  if (!trimmed) return defaultGenreValue

  const matchedChild = genreCategoryOptions
    .flatMap((item) => item.children)
    .find((child) => child.value === trimmed)

  if (matchedChild) return matchedChild.value

  return legacyGenreToChildValue[trimmed] || defaultGenreValue
}

export function getGenreCategoryValueByGenre(rawGenre?: string | null) {
  const normalizedValue = normalizeGenreValue(rawGenre)
  const category = genreCategoryOptions.find((item) =>
    item.children.some((child) => child.value === normalizedValue)
  )

  return category?.value || defaultGenreCategoryValue
}
