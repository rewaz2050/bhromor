import type { MetadataRoute } from 'next';
import { retreats, posts } from '@/lib/content';

const base = 'https://prosanti.com.bd';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = ['', '/about', '/retreats', '/journal', '/contact'].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === '' ? 'weekly' : 'monthly',
      priority: path === '' ? 1 : 0.7,
    }),
  );

  const retreatPages: MetadataRoute.Sitemap = retreats.map((retreat) => ({
    url: `${base}/retreats/${retreat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const journalPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${base}/journal/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'yearly',
    priority: 0.5,
  }));

  return [...staticPages, ...retreatPages, ...journalPages];
}
