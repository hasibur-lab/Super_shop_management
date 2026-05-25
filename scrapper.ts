import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://136.243.92.170/PLATINUMTEAM/';
const DB_FILE = path.join(process.cwd(), 'db.json');

// Standard Unsplash covers to randomize for cinematic variety
const CINEMATIC_POSTERS = [
  'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542204172-e70528091f50?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1533928298208-27ff66555d8d?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1568832359672-e36cf5d74f54?w=600&auto=format&fit=crop&q=80'
];

interface ScrapedMovie {
  title: string;
  url: string;
  year: number;
}

// Simple sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchDirectory(url: string, prefix = ''): Promise<{ directories: string[], files: ScrapedMovie[] }> {
  const dirs: string[] = [];
  const files: ScrapedMovie[] = [];

  try {
    console.log(`[Scrape] Fetching ${prefix ? `[${prefix}] ` : ''}${url}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[Warning] Failed to fetch directory listing for: ${url} (status: ${resp.status})`);
      return { directories: dirs, files };
    }
    const html = await resp.text();

    // Regex to match anchor hrefs in apache/nginx indexes
    // href="filename.mp4" or href="Folder%20Name/"
    const hrefRegex = /href="([^"?]+)"/gi;
    let match;
    const items: string[] = [];

    while ((match = hrefRegex.exec(html)) !== null) {
      const decodedValue = decodeURIComponent(match[1]);
      if (decodedValue && decodedValue !== '../' && decodedValue !== '/' && !decodedValue.startsWith('?')) {
        items.push(match[1]); // Keep original encoded URI component for absolute path resolving
      }
    }

    // Deduplicate items
    const uniqueItems = Array.from(new Set(items));

    for (const item of uniqueItems) {
      const decodedItem = decodeURIComponent(item);
      const absoluteUrl = new URL(item, url).toString();

      if (decodedItem.endsWith('/')) {
        dirs.push(absoluteUrl);
      } else {
        const lower = decodedItem.toLowerCase();
        if (
          lower.endsWith('.mp4') || 
          lower.endsWith('.mkv') || 
          lower.endsWith('.avi') || 
          lower.endsWith('.webm') ||
          lower.endsWith('.ts')
        ) {
          // Extract release year from title e.g. "Movie Name (2023).mp4"
          let year = 2024;
          const yearMatch = decodedItem.match(/\((\d{4})\)/);
          if (yearMatch) {
            year = parseInt(yearMatch[1], 10);
          } else {
            // Check for plain year e.g. " 2023 " or " 2022" 
            const plainYearMatch = decodedItem.match(/\b(20\d{2}|19\d{2})\b/);
            if (plainYearMatch) {
              year = parseInt(plainYearMatch[1], 10);
            }
          }

          // Clean title: "Vod2023/10 Days of a Bad Man (2023).mp4" -> "10 Days of a Bad Man"
          let cleanTitle = decodedItem;
          // Strip extension
          cleanTitle = cleanTitle.substring(0, cleanTitle.lastIndexOf('.'));
          // Strip trailing (2023) or other tags
          cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '').trim();
          cleanTitle = cleanTitle.replace(/\[\w+\]/g, '').trim();
          // Replace dots, underscores, dashes with space
          cleanTitle = cleanTitle.replace(/[\._\-]+/g, ' ').trim();
          // Decapitalize and capitalize properly
          cleanTitle = cleanTitle.replace(/\s+/g, ' ');

          files.push({
            title: cleanTitle || 'Untitled Cinema',
            url: absoluteUrl,
            year: year
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error crawling url ${url}:`, error);
  }

  return { directories: dirs, files };
}

async function scrapeAll() {
  console.log('🛸 NovaStream S3 Platinum Crawler Node Initializing...');
  const queue: string[] = [BASE_URL];
  // Subdirectories queue to read recursively
  const visited = new Set<string>();
  const allMovies: ScrapedMovie[] = [];

  while (queue.length > 0) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    // Sleep briefly to avoid slamming the foreign server
    await sleep(200);

    const { directories, files } = await fetchDirectory(currentUrl);

    allMovies.push(...files);
    console.log(`[Queue] Discovered ${files.length} videos inside directory. Cumulative: ${allMovies.length}`);

    for (const dir of directories) {
      if (!visited.has(dir) && !queue.includes(dir)) {
        queue.push(dir);
      }
    }
  }

  console.log(`🛸 Scraping Complete! Total Cinema Videos Discovered: ${allMovies.length}`);

  if (allMovies.length === 0) {
    console.warn('⚠️ No video files were extracted! Verify open directory connection stability.');
    return;
  }

  // Read existing db.json
  if (!fs.existsSync(DB_FILE)) {
    console.error(`Database not found: ${DB_FILE}`);
    return;
  }

  const rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  const db = JSON.parse(rawDb);

  if (!db.movies) db.movies = [];

  // Filter or augment movies with schema format
  let addedCount = 0;
  let skippedCount = 0;

  for (const item of allMovies) {
    // Check if duplicate absolute video file path already exists
    const duplicate = db.movies.find((m: any) => m.videoUrl === item.url || m.title.toLowerCase() === item.title.toLowerCase());
    if (duplicate) {
      skippedCount++;
      continue;
    }

    // Assign randomized covers beautifully
    const posterUrl = CINEMATIC_POSTERS[Math.floor(Math.random() * CINEMATIC_POSTERS.length)];

    const newMovieObj = {
      id: `movie-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      title: item.title,
      releaseYear: item.year,
      posterUrl: posterUrl,
      loaderId: 'admin-hasib',
      loaderName: 'HASIBUR RAHAMAN',
      loaderRankTitle: 'Legendary Admin 👑 Rank 7',
      duration: Math.floor(Math.random() * (10800 - 5400 + 1)) + 5400, // Stagger 1.5 - 3 hours
      videoUrl: item.url,
      downloadUrl: item.url, // Straight forward file link!
      status: 'APPROVED',
      uploadDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(), // Random upload date inside last 30 days
      watchTime: Math.floor(Math.random() * 85000) // Randomized views mock watching duration
    };

    db.movies.push(newMovieObj);
    addedCount++;
  }

  // Update total counts inside the Admin-User state so counters display correctly
  const adminUser = db.users.find((u: any) => u.email === 'hasibmd461@gmail.com');
  if (adminUser) {
    adminUser.uploadsCount = db.movies.filter((m: any) => m.loaderId === adminUser.id).length;
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`📦 Database Synchronized Successfully!`);
  console.log(`- Added: ${addedCount} brand new movies.`);
  console.log(`- Skipped: ${skippedCount} duplicate items.`);
  console.log(`- Total Approved Movies In System: ${db.movies.length}`);
}

scrapeAll().catch(e => {
  console.error('Critical Fail during scrape automation:', e);
});
