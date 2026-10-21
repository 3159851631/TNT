import videosData from '../data/videos.json';

export interface WikiVideoItem {
  slug: string;
  title: string;
  year: string | number;
  duration?: string;
  bvid?: string;
  youtubeId?: string;
  localSrc?: string;
  provider?: 'bilibili' | 'youtube' | 'local';
  account?: string;
  featured?: boolean;
  cover: string;
}

const all = ((videosData as { videos?: WikiVideoItem[] }).videos || []) as WikiVideoItem[];

// 只把和游戏相关的视频搬进 Wiki：B 站账号发布的视频 + 游戏实机录屏。
export const wikiVideos = all.filter(
  (video) =>
    video.provider === 'bilibili' ||
    (video.provider === 'local' && String(video.title || '').includes('魔物娘合成乐园'))
);

export const sortedVideos = [...wikiVideos].sort(
  (a, b) =>
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
    Number(b.year) - Number(a.year) ||
    a.title.localeCompare(b.title)
);

// 首页 4 个：优先推荐位 → 游戏实机 → 最新的账号视频
const picks: WikiVideoItem[] = [];
const push = (video: WikiVideoItem) => {
  if (picks.length >= 4) return;
  if (picks.some((item) => item.slug === video.slug)) return;
  picks.push(video);
};
sortedVideos.filter((video) => video.featured).forEach(push);
wikiVideos.filter((video) => video.provider === 'local').forEach(push);
sortedVideos.forEach(push);

export const homeVideos = picks;
