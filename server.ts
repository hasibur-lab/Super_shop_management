import express from 'express';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { GoogleGenAI, Type } from "@google/genai";
import { dbInstance } from './server-db.js';
import { User, Store, Product, Order, Message, UserRole, OrderStatus } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Create local uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded assets statically
app.use('/uploads', express.static(uploadsDir));

// Server-Sent Events (SSE) clients for real-time order/chat signals
let sseClients: any[] = [];

app.get('/api/realtime', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { id: Date.now(), res };
  sseClients.push(client);

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to Hasib\'s Superstore Company SSE bus.' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

function broadcastEvent(type: string, data: any) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  sseClients.forEach(c => {
    try {
      c.res.write(`data: ${payload}\n\n`);
    } catch (e) {
      console.error('Error sending event to client', e);
    }
  });
}

// AUTH MIDDLEWARE
function authenticateUser(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer session-token-')) {
    // Return unauthorized
    return res.status(401).json({ error: 'Unauthorized credentials ' });
  }
  const userId = authHeader.replace('Bearer session-token-', '');
  const db = dbInstance.getData();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'Session user has expired or does not exist.' });
  }
  req.user = user;
  next();
}

function verifyRole(roles: UserRole[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Auth session is missing.' });
    }
    if (req.user.role === 'Master Admin') {
      return next(); // Master Admin bypasses all checks!
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires roles: [${roles.join(', ')}]. Access barred.` });
    }
    next();
  };
}

// 1. AUTHENTICATION SERVICE & SIGNUPS
const SignupSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().min(6, 'Valid phone number is required'),
  avatar: z.string().optional(),
  gender: z.enum(['Man', 'Woman']),
  role: z.enum(['Customer', 'Store Owner']),
  storeId: z.string().optional() // For Owners who sign up asking for predefined store context
});

app.post('/api/auth/signup', (req, res) => {
  try {
    const validated = SignupSchema.parse(req.body);
    const db = dbInstance.getData();

    const normalizedEmail = validated.email.toLowerCase().trim();
    const existing = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email address already registered' });
    }

    const userId = 'user-' + Date.now();
    
    // Master Admin Overlord credentials enforce matching
    const isMasterAdmin = normalizedEmail === 'hasibmd461@gmail.com';
    const role: UserRole = isMasterAdmin ? 'Master Admin' : validated.role;
    const approved = isMasterAdmin || role === 'Customer'; // Customer auto-approves. Store Owner needs admin review.

    const newUser: User = {
      id: userId,
      username: isMasterAdmin ? 'HASIBUR461' : validated.username,
      email: normalizedEmail,
      role,
      approved,
      storeId: isMasterAdmin ? undefined : validated.storeId,
      phone: validated.phone,
      avatar: validated.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${validated.username}`,
      gender: validated.gender,
      registrationDate: new Date().toISOString()
    };

    dbInstance.update((data) => {
      data.users.push(newUser);
      data.passwords[userId] = isMasterAdmin ? 'HASIBUR.spv1' : validated.password;
    });

    res.json({
      success: true,
      user: newUser,
      message: approved 
        ? 'Signup successful! You can log in immediately.' 
        : 'Signup request submitted! Your Store Owner account is pending review by the Master Admin.'
    });

    broadcastEvent('member_signup', { userId, username: newUser.username, role: newUser.role });

  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0].message });
    }
    res.status(500).json({ error: 'Server registration error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = dbInstance.getData();

  const user = db.users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'User account not found' });
  }

  const storedPassword = db.passwords[user.id];
  if (storedPassword !== password) {
    return res.status(401).json({ error: 'Incorrect account credentials' });
  }

  if (!user.approved) {
    return res.status(403).json({ 
      error: 'Access Blocked: Your account is pending manual Master Admin approval.' 
    });
  }

  res.json({
    success: true,
    user,
    token: `session-token-${user.id}`
  });
});

app.get('/api/users/me', authenticateUser, (req: any, res) => {
  res.json({ user: req.user });
});

// Profile email settings update and edit with full persistence
// Fixes Gmail Change persistence caching errors
app.put('/api/users/profile', authenticateUser, (req: any, res) => {
  try {
    const { username, email, phone, avatar, gender, newPassword, googleDriveConnected, googleDriveEmail, googleDriveAccounts } = req.body;
    if (!username || !email || !phone || !gender) {
      return res.status(400).json({ error: 'Username, email, phone number, and gender are required.' });
    }

    dbInstance.update((data) => {
      const dbUser = data.users.find(u => u.id === req.user.id);
      if (dbUser) {
        dbUser.username = username;
        dbUser.email = email.toLowerCase().trim();
        dbUser.phone = phone;
        dbUser.gender = gender;
        if (avatar) dbUser.avatar = avatar;
        if (googleDriveConnected !== undefined) dbUser.googleDriveConnected = googleDriveConnected;
        if (googleDriveEmail !== undefined) dbUser.googleDriveEmail = googleDriveEmail;
        if (googleDriveAccounts !== undefined) dbUser.googleDriveAccounts = googleDriveAccounts;
      }
      if (newPassword && newPassword.trim() !== '') {
        data.passwords[req.user.id] = newPassword;
      }
    });

    const updated = dbInstance.getData().users.find(u => u.id === req.user.id);
    res.json({ 
      success: true, 
      user: updated, 
      message: 'Profile settings updated permanently inside Hasib\'s database.' 
    });

    broadcastEvent('user_updated', { userId: req.user.id });
  } catch (err) {
    res.status(500).json({ error: 'Server profile update error.' });
  }
});

// Location sharing for customers
app.put('/api/users/location', authenticateUser, (req: any, res) => {
  const { deliveryLocation } = req.body;
  if (!deliveryLocation) {
    return res.status(400).json({ error: 'Location detail description is required.' });
  }

  dbInstance.update((data) => {
    const u = data.users.find(user => user.id === req.user.id);
    if (u) {
      u.deliveryLocation = deliveryLocation;
    }
  });

  res.json({ success: true, deliveryLocation, message: 'Delivery coordinates/address logged successfully.' });
});


// 2. MASTER ADMIN CONTROL SUITE & STORE PROVISIONING
// Slug generator helper
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-alphanumeric chars
    .replace(/[\s_]+/g, '-')  // convert spaces/underscores to hyphens
    .replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens
}

app.get('/api/stores', (req, res) => {
  res.json({ stores: dbInstance.getData().stores });
});

app.get('/api/stores/slug/:slug', (req, res) => {
  const store = dbInstance.getData().stores.find(s => s.slug === req.params.slug);
  if (!store) {
    return res.status(404).json({ error: 'Requested store catalog not found' });
  }
  res.json({ store });
});

// Store creation form (Master Admin exclusively)
app.post('/api/admin/stores', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  try {
    const { name, description, address, phone, photoUrl } = req.body;
    if (!name || !description || !address || !phone) {
      return res.status(400).json({ error: 'Missing mandatory fields' });
    }

    const slug = generateSlug(name);
    const existingSlug = dbInstance.getData().stores.find(s => s.slug === slug);
    if (existingSlug) {
      return res.status(400).json({ error: `A store with slug "${slug}" already exists.` });
    }

    const newStore: Store = {
      id: 'store-' + Date.now(),
      name,
      slug,
      description,
      address,
      phone,
      photoUrl: photoUrl || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
      openingTime: req.body.openingTime || '09:00',
      closingTime: req.body.closingTime || '21:00'
    };

    dbInstance.update((data) => {
      data.stores.push(newStore);
    });

    res.json({ success: true, store: newStore, message: 'Brand new Store Catalog instance prepared successfully.' });
    broadcastEvent('store_created', { store: newStore });
  } catch (err) {
    res.status(500).json({ error: 'Error provisioning store.' });
  }
});

// Direct file upload to local persistent storage system
app.post('/api/admin/stores/upload', authenticateUser, (req, res) => {
  const { base64Data, filename } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'Provide a valid base64 image encoding buffer.' });
  }

  try {
    let base64Image = base64Data;
    let extension = 'png';

    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      const metadata = parts[0];
      base64Image = parts[1];
      const mimeType = metadata.replace('data:', '');
      const extMatch = mimeType.split('/');
      if (extMatch.length > 1) {
        extension = extMatch[1];
      }
    }

    // Ensure unique, safe, sanitized filename in local uploads
    const cleanPrefix = (filename || 'image')
      .replace(/\.[^/.]+$/, '') // strip existing extension
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    
    const uniqueFilename = `${Date.now()}-${cleanPrefix}.${extension}`;
    const uploadPath = path.join(process.cwd(), 'uploads', uniqueFilename);

    // Convert and write to local storage
    const imageBuffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(uploadPath, imageBuffer);

    const publicUrl = `/uploads/${uniqueFilename}`;

    res.json({
      success: true,
      url: publicUrl,
      key: `local-uploads://${uniqueFilename}`
    });
  } catch (err: any) {
    console.error('Error saving uploaded product/store photo:', err);
    res.status(500).json({ error: 'Storage system write failure.' });
  }
});

// Edit store property fields (Master Admin only)
app.put('/api/admin/stores/:id', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  const { id } = req.params;
  const { name, description, address, phone, photoUrl } = req.body;

  let updatedStore: Store | undefined;
  dbInstance.update((data) => {
    const store = data.stores.find(s => s.id === id);
    if (store) {
      if (name) {
        store.name = name;
        store.slug = generateSlug(name);
      }
      if (description) store.description = description;
      if (address) store.address = address;
      if (phone) store.phone = phone;
      if (photoUrl) store.photoUrl = photoUrl;
      updatedStore = store;
    }
  });

  if (!updatedStore) {
    return res.status(404).json({ error: 'Store not found.' });
  }

  res.json({ success: true, store: updatedStore, message: 'Store properties modified and saved permanently.' });
  broadcastEvent('store_updated', { store: updatedStore });
});

// Delete store endpoint (Master Admin only)
app.delete('/api/admin/stores/:id', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  const { id } = req.params;
  let success = false;

  dbInstance.update((data) => {
    const index = data.stores.findIndex(s => s.id === id);
    if (index > -1) {
      data.stores.splice(index, 1);
      
      // Clean up products mapped to this store
      data.products = data.products.filter(p => p.storeId !== id);
      
      // Clean up users mapped to this store
      data.users.forEach(u => {
        if (u.storeId === id) {
          u.storeId = undefined;
        }
      });
      
      success = true;
    }
  });

  if (!success) {
    return res.status(404).json({ error: 'Store not found.' });
  }

  res.json({ success: true, message: 'Store, its registered products, and user assignments have been deleted successfully.' });
  broadcastEvent('store_deleted', { storeId: id });
});

// Bulk delete stores endpoint (Master Admin only)
app.post('/api/admin/stores/bulk-delete', authenticateUser, verifyRole(['Master Admin']), (req: any, res: any) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing store IDs list.' });
  }

  dbInstance.update((data) => {
    data.stores = data.stores.filter(s => {
      const shouldDelete = ids.includes(s.id);
      if (shouldDelete) {
        // Clean up products and users for deleted stores
        data.products = data.products.filter(p => p.storeId !== s.id);
        data.users.forEach(u => {
          if (u.storeId === s.id) {
            u.storeId = undefined;
          }
        });
      }
      return !shouldDelete;
    });
  });

  res.json({ success: true, message: 'All selected stores, corresponding products, and staff assignments removed successfully.' });
  broadcastEvent('stores_bulk_deleted', { ids });
});

// Edit store opening and closing times (Master Admin, Admin, Store Owner, Store Staff)
app.put('/api/stores/:id/times', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { id } = req.params;
  const { openingTime, closingTime } = req.body;

  if (!openingTime || !closingTime) {
    return res.status(400).json({ error: 'Opening and closing times are mandatory.' });
  }

  // Verification checks: Store Specific users can only modify their own mapped store
  const isGlobalAdmin = ['Master Admin', 'Admin'].includes(req.user.role);
  if (!isGlobalAdmin && req.user.storeId !== id) {
    return res.status(403).json({ error: 'Workplace bounds violation: You can only maintain timings for your assigned outlet.' });
  }

  let updatedStore: Store | undefined;
  dbInstance.update((data) => {
    const store = data.stores.find(s => s.id === id);
    if (store) {
      store.openingTime = openingTime;
      store.closingTime = closingTime;
      updatedStore = store;
    }
  });

  if (!updatedStore) {
    return res.status(404).json({ error: 'Store not found.' });
  }

  res.json({ success: true, store: updatedStore, message: `Store business times updated to ${openingTime} - ${closingTime}.` });
  broadcastEvent('store_updated', { store: updatedStore });
});

// Helper to determine realistic / premium online markup prices for scanned catalog items
function determineDynamicPrices(name: string, category: string, code: string) {
  const nameLower = name.toLowerCase();
  const catLower = (category || '').toLowerCase();
  
  // Base default estimates:
  let localPrice = 1.20;
  let onlinePrice = 2.40;

  // Check if water bottle / beverage or similar is being scanned
  const isWater = nameLower.includes('water') || nameLower.includes('acqua') || nameLower.includes('mineral') || nameLower.includes('naturale') || nameLower.includes('effervescente') || catLower.includes('water') || catLower.includes('beverage');
  const is2LOr15L = nameLower.includes('2l') || nameLower.includes('2 l') || nameLower.includes('1.5') || nameLower.includes('1,5') || nameLower.includes('1.5l') || nameLower.includes('2.0') || nameLower.includes('bottle');

  if (isWater) {
    localPrice = 0.45;
    // Overriding / adding higher online comparison premium
    if (is2LOr15L || code === '8003170045361') {
      onlinePrice = 1.95; // €1.95 online reference price (water is €1 or more)
    } else {
      onlinePrice = 1.20; // €1.20 online reference price
    }
  } else if (nameLower.includes('croissant') || nameLower.includes('pastry') || nameLower.includes('cannoli') || catLower.includes('pastries') || catLower.includes('bakery')) {
    localPrice = 1.50;
    onlinePrice = 3.50;
  } else if (nameLower.includes('espresso') || nameLower.includes('coffee') || catLower.includes('coffee') || catLower.includes('beverage')) {
    localPrice = 1.20;
    onlinePrice = 2.50;
  } else if (nameLower.includes('jacket') || nameLower.includes('blazer') || nameLower.includes('shirt') || nameLower.includes('jeans') || catLower.includes('apparel')) {
    localPrice = 45.00;
    onlinePrice = 89.00;
  } else if (nameLower.includes('serum') || nameLower.includes('facial') || catLower.includes('beauty')) {
    localPrice = 12.50;
    onlinePrice = 24.50;
  } else if (nameLower.includes('snack') || nameLower.includes('biscuit') || nameLower.includes('chocolate') || catLower.includes('snacks')) {
    localPrice = 1.99;
    onlinePrice = 3.99;
  } else {
    // general hashing for diverse catalog
    let hashValue = 0;
    for (let i = 0; i < code.length; i++) {
      hashValue += code.charCodeAt(i) * (i + 1);
    }
    localPrice = (hashValue % 10) + 1.50; // €1.50 - €11.50
    onlinePrice = localPrice * 1.8;       // online is 1.8x premium format
  }

  // Rounding options to look pristine
  const formatNiceNum = (val: number) => {
    const mainInt = Math.floor(val);
    const part = val - mainInt;
    if (part < 0.2) return mainInt;
    if (part < 0.5) return mainInt + 0.49;
    if (part < 0.75) return mainInt + 0.79;
    return mainInt + 0.99;
  };

  localPrice = Number(formatNiceNum(localPrice).toFixed(2));
  onlinePrice = Number(formatNiceNum(onlinePrice).toFixed(2));

  // If onlinePrice is €1.00 or higher and is higher than local, we automatically prefer the online premium price
  const isOnlinePriceApplied = onlinePrice >= 1.00 && onlinePrice > localPrice;
  const finalPrice = isOnlinePriceApplied ? onlinePrice : localPrice;

  return {
    localPrice,
    onlinePrice,
    isOnlinePriceApplied,
    price: finalPrice
  };
}

function getThemedUnsplashPhoto(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes('whiskey') || n.includes('whisky') || n.includes('bourbon') || n.includes('vodka') || n.includes('gin') || n.includes('wine') || n.includes('beer') || n.includes('alcohol') || n.includes('champagne') || n.includes('cocktail')) {
    return "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"; // Alcohol/Cocktail
  }
  if (n.includes('pizza') || c.includes('pizza')) {
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800"; // Pizza
  }
  if (n.includes('water') || n.includes('acqua') || n.includes('mineral') || n.includes('bottle')) {
    return "https://images.unsplash.com/photo-1608889174637-3c44f6326f2a?q=80&w=800"; // Water
  }
  if (n.includes('coffee') || n.includes('espresso') || n.includes('macchiato') || n.includes('cappuccino') || n.includes('latte')) {
    return "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800"; // Coffee
  }
  if (c.includes('beverage') || c.includes('drink') || n.includes('soda') || n.includes('cola') || n.includes('juice') || n.includes('limonata')) {
    return "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=800"; // Soda/Beverage
  }
  if (c.includes('pastry') || c.includes('bakery') || n.includes('croissant') || n.includes('cannoli') || n.includes('cake') || n.includes('bread') || n.includes('boule') || n.includes('sourdough')) {
    return "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=800"; // Bakery
  }
  if (c.includes('apparel') || c.includes('clothing') || n.includes('dress') || n.includes('shirt') || n.includes('jacket') || n.includes('jeans') || n.includes('pullover') || n.includes('sweater') || n.includes('trouser')) {
    return "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=800"; // Clothing
  }
  if (c.includes('beauty') || c.includes('spa') || c.includes('cosmetics') || n.includes('serum') || n.includes('mask') || n.includes('lotion') || n.includes('butter') || n.includes('essential')) {
    return "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"; // Beauty Skincare
  }
  if (c.includes('electronics') || n.includes('charger') || n.includes('earbud') || n.includes('headphones') || n.includes('keyboard') || n.includes('mouse') || n.includes('phone')) {
    return "https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=800"; // Tech/Electronics
  }
  if (c.includes('household') || n.includes('cleaner') || n.includes('detergent') || n.includes('liquid') || n.includes('soap') || n.includes('softener')) {
    return "https://images.unsplash.com/photo-1583947215259-38e31be8751f?q=80&w=800"; // Household/Cleaning
  }
  if (c.includes('accessories') || n.includes('wallet') || n.includes('bag') || n.includes('purse') || n.includes('suitcase') || n.includes('sunglasses') || n.includes('watch')) {
    return "https://images.unsplash.com/photo-1627123424574-724758594e93?q=80&w=800"; // Accessories
  }
  if (n.includes('oil') || n.includes('olive') || c.includes('pantry') || n.includes('honey')) {
    return "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=800"; // Olive Oil/Pantry
  }
  return "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=800"; // General retail
}

function normalizeGlobalCategory(rawCat: string, productType: string): string {
  const c = (rawCat || '').toLowerCase();
  
  if (c.includes('beer') || c.includes('wine') || c.includes('whiskey') || c.includes('whisky') || c.includes('vodka') || c.includes('rum') || c.includes('alcohol') || c.includes('spirits') || c.includes('gin') || c.includes('champagne') || c.includes('liqueur') || c.includes('cider') || c.includes('ale') || c.includes('stout')) {
    return "Beer, Wine & Spirits";
  }
  if (c.includes('boisson') || c.includes('drink') || c.includes('water') || c.includes('eau') || c.includes('cola') || c.includes('soda') || c.includes('juice') || c.includes('limonata')) {
    return "Beverages";
  }
  if (c.includes('pastry') || c.includes('croissant') || c.includes('bakery') || c.includes('cake') || c.includes('boulangerie') || c.includes('cookie') || c.includes('bread')) {
    return "Pastries";
  }
  if (c.includes('snack') || c.includes('biscuit') || c.includes('chocolat') || c.includes('chips') || c.includes('confiserie') || c.includes('sweet') || c.includes('pizza')) {
    return "Bakery & Snacks";
  }
  if (c.includes('apparel') || c.includes('clothing') || c.includes('vetement') || c.includes('jean') || c.includes('dress') || c.includes('shirt') || c.includes('jacket')) {
    return "Apparel";
  }
  if (c.includes('accessoire') || c.includes('purse') || c.includes('bag') || c.includes('wallet') || c.includes('sunglasses') || c.includes('watch') || c.includes('belt')) {
    return "Accessories";
  }
  if (c.includes('beauty') || c.includes('spa') || c.includes('hygiene') || c.includes('maquillage') || c.includes('soin') || c.includes('perfume') || c.includes('soap') || c.includes('shampoo')) {
    return "Beauty & Spa";
  }
  if (c.includes('electronic') || c.includes('phone') || c.includes('charger') || c.includes('computer') || c.includes('appliances') || c.includes('cable') || c.includes('light')) {
    return "Electronics";
  }
  if (c.includes('cleaning') || c.includes('household') || c.includes('detergent') || c.includes('wash') || c.includes('softener')) {
    return "Household";
  }
  if (c.includes('pantry') || c.includes('sauce') || c.includes('spice') || c.includes('oil') || c.includes('rice') || c.includes('condiment')) {
    return "Pantry";
  }

  if (productType === "beauty") return "Beauty & Spa";
  if (productType === "product") return "Accessories";
  return "General";
}

function getOfflineDictionaryProduct(code: string) {
  const normalizedCode = code.trim().replace(/[-\s]/g, '');

  const database: Record<string, {
    name: string;
    description: string;
    ingredients: string;
    category: string;
    price: number;
    photoUrl?: string;
  }> = {
    // Nivea Cosmetics & Creams
    '4005808819138': {
      name: "Nivea Body Lotion Rich Nourishing 400ml",
      description: "A deep-nourishing, skin-softening body milk formulated for long-lasting hydration on dry to very dry skin. Officially made by the company Beiersdorf AG in Hamburg, Germany. Primary Usage: Daily skin hydration and intense body moisturizing care.",
      ingredients: "Aqua, Paraffinum Liquidum, Glycerin, C15-19 Alkane, Isopropyl Palmitate, Lanolin Alcohol",
      category: "Beauty & Spa",
      price: 6.49,
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    },
    '4005900108369': {
      name: "Nivea Rich Nourishing Body Milk 250ml",
      description: "An intensive moisturizing lotion enriched with Deep Moisture Serum and double almond oil. Officially made by the company Beiersdorf AG in Germany. Primary Usage: Dry skin hydration, repair, and daily conditioning.",
      ingredients: "Aqua, Glycerin, C15-19 Alkane, Isopropyl Palmitate, Paraffinum Liquidum, Prunus Amygdalus Dulcis Oil",
      category: "Beauty & Spa",
      price: 4.95,
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    },
    '4005900224151': {
      name: "Nivea Soft Moisturizing Cream 200ml",
      description: "An ultra-light, fast-absorbing whole-body moisturizing cream containing high-grade Jojoba oil and Vitamin E. Officially made by the company Beiersdorf AG in Hamburg, Germany. Primary Usage: Universal moisturizing care for face, hands, and body.",
      ingredients: "Aqua, Glycerin, Myristyl Alcohol, Methylpropanediol, Glyceryl Stearate, Simmondsia Chinensis Seed Oil, Tocopheryl Acetate",
      category: "Beauty & Spa",
      price: 3.99,
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    },
    '4005900190531': {
      name: "Nivea Men Sensitive Post Shave Balm",
      description: "A fast-absorbing, non-greasy alcohol-free balm designed to soothe shaved irritation with chamomile extract and Vitamin E. Officially made by the company Beiersdorf AG in Germany. Primary Usage: Male facial soothe, moisturizer, and redness defense.",
      ingredients: "Aqua, Glycerin, Isopropyl Palmitate, Chamomilla Recutita Flower Extract, Hamamelis Virginiana Bark Extract",
      category: "Beauty & Spa",
      price: 7.20,
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    },
    // Coca Cola & Beverages
    '5449000012203': {
      name: "Coca-Cola Original Taste 500ml Bottle",
      description: "The classic, world-famous carbonated soft drink served in a convenient 500ml PET bottle. Officially made by The Coca-Cola Company in Atlanta, Georgia. Primary Usage: Sweet cold beverage refreshment.",
      ingredients: "Carbonated Spring Water, Sugar, Caramel Color (E150d), Phosphoric Acid, Natural Flavoring including Caffeine",
      category: "Beverages",
      price: 2.20,
      photoUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=800"
    },
    '5449000131805': {
      name: "Coca-Cola Original Can 330ml",
      description: "The original recipe Coca-Cola soft drink packaged in an iconic single-serve aluminum can. Officially made by The Coca-Cola Company. Primary Usage: Instant sweet carbonated refreshment.",
      ingredients: "Carbonated Water, Sugar, Color (Caramel E150d), Phosphoric Acid, Natural Flavorings, Caffeine",
      category: "Beverages",
      price: 1.50,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '5449000214249': {
      name: "Coca-Cola Zero Sugar Can 330ml",
      description: "A sparkling zero-sugar, zero-calorie cola beverage designed to deliver the iconic classic Coca-Cola taste without sugars. Officially made by The Coca-Cola Company. Primary Usage: Sugar-free carbonated cola refreshment.",
      ingredients: "Carbonated Water, Caramel Color (E150d), Phosphoric Acid, Sweeteners (Aspartame, Acesulfame K), Caffeine",
      category: "Beverages",
      price: 1.50,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '9002490100070': {
      name: "Red Bull Energy Drink 250ml",
      description: "A functional carbonated carbonated beverage designed to vitalize body and mind during periods of high exhaustion or focus. Officially made by Red Bull GmbH in Fuschl am See, Austria. Primary Usage: High-potency energy enhancement.",
      ingredients: "Carbonated Alpine Water, Sucrose, Glucose, Citric Acid, Taurine, Caffeine, Niacin, B-Vitamins",
      category: "Beverages",
      price: 2.65,
      photoUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=800"
    },
    '3057640100366': {
      name: "Evian Natural Mineral Spring Water 1.5L",
      description: "Naturally pure filter-alkaline mineral water bottled directly at the source in Evian-les-Bains in the French Alps. Officially made by the company Danone S.A. in France. Primary Usage: Organic hydrating mineral drinking water.",
      ingredients: "100% Pure Natural Alps Filtered Spring Water, containing natural Calcium, Magnesium, and Silica minerals",
      category: "Beverages",
      price: 1.95,
      photoUrl: "https://images.unsplash.com/photo-1608889174637-3c44f6326f2a?q=80&w=800"
    },
    '8712000025701': {
      name: "Heineken Premium Lager Beer 330ml Can",
      description: "A premium, crisp, golden lager beer brewed with single-malt barley, pure water, and special target yeast. Officially made by Heineken N.V. in Amsterdam, Netherlands. Primary Usage: Premium alcoholic social refreshment.",
      ingredients: "Water, Malted Barley, Premium Hop Extract, Heineken A-Yeast",
      category: "Beer, Wine & Spirits",
      price: 2.10,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '7501064191666': {
      name: "Corona Extra Premium Mexican Beer 330ml Bottle",
      description: "The world-famous, clear-bodied golden Mexican lager brewed with fine hops and grains, traditionally served cold with a slice of fresh lime. Officially made by Grupo Modelo in Mexico. Primary Usage: Casual or festive alcoholic social refreshment.",
      ingredients: "Water, Barley Malt, Corn, Hops, Premium Brewers Yeast",
      category: "Beer, Wine & Spirits",
      price: 2.45,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '5410228141364': {
      name: "Budweiser Premium Beer 330ml Can",
      description: "The classic American-style golden lager beechwood-aged for unmatched smoothness, clarity, and refreshing flavor. Officially made by Anheuser-Busch InBev. Primary Usage: Standard cold beer refreshment.",
      ingredients: "Water, Barley Malt, Rice, Yeast, Premium Quality Hops",
      category: "Beer, Wine & Spirits",
      price: 1.85,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '5099873001392': {
      name: "Jack Daniel's Old No. 7 Tennessee Sour Mash Whiskey 70cl",
      description: "The legendary charcoal-mellowed Tennessee sour mash whiskey aged in handcrafted Oak barrels for a signature smooth, oaky, sweet vanilla flavor. Officially made by Jack Daniel Distillery in Lynchburg, Tennessee. Primary Usage: Premium neat, rock, or mixer whiskey spirits.",
      ingredients: "Cave Spring Water, Select Premium Corn, Rye, Malted Barley, Natural Yeast and Barrel-Aged Charred Oak Extracts",
      category: "Beer, Wine & Spirits",
      price: 24.90,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '7312040017072': {
      name: "Absolut Swedish Vodka Original 70cl",
      description: "The premium, ultra-pure Swedish vodka continuous-distilled from autumn-harvested single-grown winter wheat and deep cave artesian water. Officially made by The Absolut Company in Åhus, Sweden. Primary Usage: Premium cocktails, mixers, or chilled vodka shots.",
      ingredients: "100% Pure Swedish Artesian Well Water, Selected Autumn Winter Wheat",
      category: "Beer, Wine & Spirits",
      price: 19.50,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '5010103918546': {
      name: "Guinness Draught Stout Premium Beer 440ml Can",
      description: "The iconic rich, dark Irish dry stout renowned for its creamy white head, roasted barley aroma, and velvety chocolate notes. Officially made by Diageo at St. James's Gate Brewery in Dublin, Ireland. Primary Usage: Deep-bodied social stout drinking refreshment.",
      ingredients: "Water, Malted Barley, Roasted Unmalted Barley, Hops, Brewer's Yeast",
      category: "Beer, Wine & Spirits",
      price: 2.25,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    '8002270014901': {
      name: "Aperol Aperitivo Italian Liqueur 70cl",
      description: "The famous bittersweet Italian aperitivo liqueur with a vibrant orange color, infusion of high-quality bitter oranges, rhubarb, and alpine herbs. Officially made by Campari Group in Italy. Primary Usage: Preparing signature refreshing Aperol Spritz cocktails.",
      ingredients: "Water, Sugar, Alcohol, Natural Bitter Orange Peel Extracts, Roots/Herbs Blend",
      category: "Beer, Wine & Spirits",
      price: 15.80,
      photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800"
    },
    // Heinz Ketchup & Pantry Items
    '5000157070674': {
      name: "Heinz Tomato Ketchup 460g Squeeze Bottle",
      description: "The classic thick, rich tomato sauce crafted from sun-ripened tomatoes and fine herbs. No artificial colors or preservatives. Officially made by the Kraft Heinz Company in Pittsburgh, Pennsylvania. Primary Usage: Food condiment pairing.",
      ingredients: "Tomatoes (148g per 100g ketchup), Spirit Vinegar, Sugar, Salt, Spice and Herb Extracts (contains Celery)",
      category: "Pantry",
      price: 3.85,
      photoUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=800"
    },
    // Pringles / Snacks
    '5050083540250': {
      name: "Pringles Sour Cream & Onion 165g",
      description: "Crispy stackable potato chips seasoned with a rich savory combination of sour cream onion and garden herbs. Officially made by Kellanova (Kellogg Company) in Battle Creek, Michigan. Primary Usage: Party snacking and quick savory bites.",
      ingredients: "Dehydrated Potatoes, Vegetable Oils (Sunflower, Corn), Wheat Starch, Rice Flour, Sour Cream & Onion Seasoning",
      category: "Bakery & Snacks",
      price: 3.29,
      photoUrl: "https://images.unsplash.com/photo-154118811-1e0d58224f24?q=80&w=800"
    },
    // Dentist Colgate
    '035000521019': {
      name: "Colgate Cavity Protection Toothpaste 100ml",
      description: "A fluoride toothpaste formulated to clean teeth deeply, strengthen enamel, and protect against cavities. Officially made by the Colgate-Palmolive Company in New York, USA. Primary Usage: Advanced oral hygiene and tooth defense.",
      ingredients: "Dicalcium Phosphate Dihydrate, Aqua, Glycerin, Sodium Lauryl Sulfate, Cellulose Gum, Sodium Monofluorophosphate",
      category: "Beauty & Spa",
      price: 2.50,
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    },
    // Household dish liquid
    '5410076241919': {
      name: "Fairy Platinum Active Dishwashing Liquid 450ml",
      description: "An ultra-concentrated dish soap that slices through stubborn grease instantly, leaving glassware spot-free without scrubbing. Officially made by Procter & Gamble in Cincinnati, Ohio. Primary Usage: Heavy-duty kitchen cleaning and dishwashing.",
      ingredients: "15-30% Anionic Surfactants, 5-15% Non-Ionic Surfactants, Benzisothiazolinone, Perfume, Geraniol",
      category: "Household",
      price: 3.10,
      photoUrl: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?q=80&w=800"
    },
    // Dr Oetker Pizza Margherita
    '4001724819702': {
      name: "Dr. Oetker Ristorante Pizza Margherita",
      description: "A crisp, thin-crusted Italian frozen pizza topped with fresh mozzarella cheese, rich sun-ripened plum tomatoes, and fragrant basil seasoning. Officially made by the Dr. Oetker Group in Bielefeld, Germany. Primary Usage: Frozen Italian dinner snack.",
      ingredients: "Wheat Flour, 24% Tomato Puree, 15% Mozzarella Cheese, Vegetable Oils, Edible Sea Salt, Yeast, Basil Extract",
      category: "Bakery & Snacks",
      price: 4.80,
      photoUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800"
    }
  };

  if (database[normalizedCode]) {
    return database[normalizedCode];
  }
  return null;
}

function generateGlobalProductFallback(code: string) {
  const normalizedCode = code.trim().replace(/[-\s]/g, '');

  // A. Check if this is a known simulated barcode first
  const knownOfflineMatch = getOfflineDictionaryProduct(normalizedCode);
  if (knownOfflineMatch) {
    return {
      name: knownOfflineMatch.name,
      description: knownOfflineMatch.description,
      price: knownOfflineMatch.price,
      ingredients: knownOfflineMatch.ingredients,
      category: knownOfflineMatch.category,
      photoUrl: knownOfflineMatch.photoUrl || getThemedUnsplashPhoto(knownOfflineMatch.name, knownOfflineMatch.category)
    };
  }

  const prefix3 = parseInt(normalizedCode.substring(0, 3)) || 0;

  // B. Determine Country of Origin & Brand Manufacturers
  let country = "United States";
  let brands: Record<string, string> = {
    food: "General Mills",
    alcohol: "Brown-Forman",
    pizza: "Domino's Artisanal",
    drinks: "The Coca-Cola Company",
    household: "Procter & Gamble",
    apparel: "Levi Strauss & Co.",
    electronics: "Apple Inc.",
    beauty: "The Estée Lauder Companies",
    accessories: "Fossil Group"
  };

  if (prefix3 >= 300 && prefix3 <= 379) {
    country = "France";
    brands = {
      food: "Danone S.A.",
      alcohol: "Pernod Ricard",
      pizza: "Sodebo Traiteur",
      drinks: "Évian Natural Spring Water",
      household: "L'Oréal Group Home Care",
      apparel: "La Coste Paris",
      electronics: "Wiko Telecom",
      beauty: "L'Oréal Paris",
      accessories: "Louis Vuitton Malletier"
    };
  } else if (prefix3 >= 400 && prefix3 <= 440) {
    country = "Germany";
    brands = {
      food: "Dr. Oetker Group",
      alcohol: "Mast-Jägermeister SE",
      pizza: "Dr. Oetker Ristorante Pizza",
      drinks: "Gerolsteiner Brunnen",
      household: "Henkel AG & Co. KGaA",
      apparel: "Hugo Boss AG",
      electronics: "Robert Bosch GmbH",
      beauty: "Nivea (Beiersdorf)",
      accessories: "Montblanc International"
    };
  } else if ((prefix3 >= 450 && prefix3 <= 459) || (prefix3 >= 490 && prefix3 <= 499)) {
    country = "Japan";
    brands = {
      food: "Nissin Foods Holdings",
      alcohol: "Suntory Spirits Ltd.",
      pizza: "Aoki's Pizza Tokyo",
      drinks: "Ito En Tea Corporation",
      household: "Kao Chemical Corporation",
      apparel: "Uniqlo Co., Ltd.",
      electronics: "Sony Group Corporation",
      beauty: "Shiseido Company",
      accessories: "Seiko Watch Corporation"
    };
  } else if (prefix3 >= 500 && prefix3 <= 509) {
    country = "United Kingdom";
    brands = {
      food: "Associated British Foods",
      alcohol: "Diageo PLC",
      pizza: "PizzaExpress Retail",
      drinks: "Twinings Tea Company",
      household: "Unilever PLC",
      apparel: "Barbour & Sons",
      electronics: "Dyson Technology Ltd.",
      beauty: "Boots Botanics",
      accessories: "Burberry Group PLC"
    };
  } else if (prefix3 >= 760 && prefix3 <= 769) {
    country = "Switzerland";
    brands = {
      food: "Nestlé S.A.",
      alcohol: "Absinthe Larus",
      pizza: "Buitoni Swiss",
      drinks: "Valser Mineralquellen",
      household: "Givaudan Home division",
      apparel: "Mammut Sports Group",
      electronics: "Logitech International",
      beauty: "Weleda Skincare",
      accessories: "Rolex SA"
    };
  } else if (prefix3 >= 800 && prefix3 <= 839) {
    country = "Italy";
    brands = {
      food: "Barilla G. e R. Fratelli",
      alcohol: "Campari Group",
      pizza: "Italpizza S.p.A.",
      drinks: "Sanpellegrino S.p.A.",
      household: "Chanteclair Universale",
      apparel: "Guccio Gucci S.p.A.",
      electronics: "Olivetti S.p.A.",
      beauty: "Kiko Milano",
      accessories: "Prada S.p.A."
    };
  } else if (prefix3 >= 840 && prefix3 <= 849) {
    country = "Spain";
    brands = {
      food: "Campofrío Food Group",
      alcohol: "Freixenet S.A.",
      pizza: "Casa Tarradellas",
      drinks: "Vichy Catalán",
      household: "Persan S.A.",
      apparel: "Zara (Inditex S.A.)",
      electronics: "Energy Sistem",
      beauty: "Natura Bissé",
      accessories: "Loewe S.A."
    };
  } else if (prefix3 >= 690 && prefix3 <= 699) {
    country = "China";
    brands = {
      food: "Tingyi Holding Corp.",
      alcohol: "Moutai Co., Ltd.",
      pizza: "Yum China Pizza Hut",
      drinks: "Nongfu Spring",
      household: "Liby Household",
      apparel: "Li-Ning Company",
      electronics: "Xiaomi Corporation",
      beauty: "Pechoin Beauty",
      accessories: "Huawei Device Wearables"
    };
  } else if (prefix3 === 880) {
    country = "South Korea";
    brands = {
      food: "CJ CheilJedang Group",
      alcohol: "HiteJinro Co., Ltd.",
      pizza: "Mr. Pizza Korea",
      drinks: "Lotte Chilsung Beverage",
      household: "LG Household & Health Care",
      apparel: "Ader Error",
      electronics: "Samsung Electronics",
      beauty: "Innisfree (Amorepacific)",
      accessories: "Gentle Monster Eyewear"
    };
  }

  // C. Intelligently deduce manufacturer product classes from barcode structures to avoid crossing pizza with cosmetics
  let selectedClass = "accessories"; // default fallback class

  let hashValue = 0;
  for (let i = 0; i < normalizedCode.length; i++) {
    hashValue += normalizedCode.charCodeAt(i) * (i + 1);
  }

  if (normalizedCode.startsWith('40059') || normalizedCode.startsWith('40058') || normalizedCode.startsWith('40057')) {
    selectedClass = "beauty";
  } else if (normalizedCode.startsWith('5449') || normalizedCode.startsWith('900249')) {
    selectedClass = "drinks";
  } else if (normalizedCode.startsWith('8712000') || normalizedCode.startsWith('750106') || normalizedCode.startsWith('5010103') || normalizedCode.startsWith('531204') || normalizedCode.startsWith('509987') || normalizedCode.startsWith('731204') || normalizedCode.startsWith('800227')) {
    selectedClass = "alcohol";
  } else if (normalizedCode.startsWith('500015') || normalizedCode.startsWith('500018')) {
    selectedClass = "food";
  } else if (normalizedCode.startsWith('4001724') || normalizedCode.startsWith('4000405')) {
    selectedClass = "pizza";
  } else if (normalizedCode.startsWith('5410076') || normalizedCode.startsWith('305994')) {
    selectedClass = "household";
  } else {
    const saferClasses = ["beauty", "household", "electronics", "accessories", "apparel", "drinks", "food", "alcohol"];
    selectedClass = saferClasses[hashValue % saferClasses.length];
  }

  let pName = "";
  let pCat = "";
  let pDesc = "";
  let pIngredients = "";
  let pPrice = 5.95;

  const finalBrand = brands[selectedClass] || "Global Premium Group";

  if (selectedClass === "food") {
    pCat = "Bakery & Snacks";
    const foods = [
      { name: "Organic Multi-Grain Rice Crackers", ingredients: "Brown Rice, Sesame Seeds, Sunflower Oil, Sea Salt", basePrice: 3.49 },
      { name: "Premium Roasted Pistachios", ingredients: "Premium Pistachios, Sea Salt", basePrice: 7.99 },
      { name: "Whole Wheat Fusilli Pasta", ingredients: "Durum Semolina Wheat, Organic Mountain Spring Water", basePrice: 2.29 },
      { name: "Wildflower Mountain Honey", ingredients: "100% Pure Raw Wildflower Honey", basePrice: 9.50 }
    ];
    const item = foods[hashValue % foods.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for healthy premium consumption and quick wholesome snacking. Packed with protective techniques to maintain pristine condition.`;
  }
  else if (selectedClass === "alcohol") {
    pCat = "Beer, Wine & Spirits";
    const alcohols = [
      { name: "Single Malt Heritage Whisky", ingredients: "Malted Barley, Yeast, Pure Highland Spring Water", basePrice: 48.00 },
      { name: "Craft Reserva Cabernet Sauvignon", ingredients: "Fermented Cabernet Grapes, Natural Yeast, Oak Barrel Infusions", basePrice: 18.50 },
      { name: "Premium Triple-Distilled Vodka", ingredients: "Standard Rye Grains, Demineralized Spring Water", basePrice: 22.00 },
      { name: "Artisanal Botanical Gin", ingredients: "Juniper Berries, Coriander Seeds, Lemon Peel extract, Neutral Grain Spirit", basePrice: 29.50 }
    ];
    const item = alcohols[hashValue % alcohols.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for sophisticated events, cocktail crafting, or professional gastronomy pairing. It utilizes traditional aged fermentation to ensure stellar taste profiles.`;
  }
  else if (selectedClass === "pizza") {
    pCat = "Bakery & Snacks";
    const pizzas = [
      { name: "Stone-Baked Pizza Margherita", ingredients: "Wheat Sourdough, Plum Tomatoes, Mozzarella di Bufala, Fresh Basil, Extra Virgin Olive Oil", basePrice: 6.99 },
      { name: "Black Truffle & Funghi Pizza", ingredients: "Spelt Flour Crust, Wild Porcini Mushrooms, Mozzarella, Summer Truffle Purée, Sea Salt", basePrice: 9.95 },
      { name: "Spicy Diavola & Salami Pizza", ingredients: "Double-Zero Wheat Flour, Spicy Calabrian Salami, San Marzano Tomatoes, Mozzarella, Hot Chili Oil", basePrice: 7.50 }
    ];
    const item = pizzas[hashValue % pizzas.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for high-end Italian baked pizza dining, fast artisanal cookings, and gourmet shares. Made with wood-fired stone deck heritage.`;
  }
  else if (selectedClass === "drinks") {
    pCat = "Beverages";
    const drinks = [
      { name: "Organic Sparkling Limonata", ingredients: "Sparkling Water, Organic Fresh Lemon Juice (15%), Organic Cane Sugar", basePrice: 1.95 },
      { name: "Ceremonial Pure Energy Tonic", ingredients: "Purified Sparkling Water, Organic Green Tea Essence, Ginseng Extract, Natural Citrus Aroma", basePrice: 3.20 },
      { name: "Cold-Brew Infused Nitro Coffee", ingredients: "Purified Water, Arabica Coffee Beans, Pressurized Nitrogen", basePrice: 4.50 },
      { name: "Naturally Alkaline Spring Water 1.5L", ingredients: "100% Pure Alkaline Spring Water with standard mineral electrolytes", basePrice: 1.10 }
    ];
    const item = drinks[hashValue % drinks.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    if (normalizedCode === '8003170045361') {
      pPrice = 1.95;
    } else {
      pPrice = item.basePrice;
    }
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for thirst rehydration, active day refreshment, and tabletop serving. It is verified eco-friendly and contains standard electrolytes.`;
  }
  else if (selectedClass === "household") {
    pCat = "Household";
    const households = [
      { name: "Eco-Luxe Citrus Dishwashing Liquid", ingredients: "Plant-Derived Surfactants, Sweet Orange Essential Oil, Botanical Preservatives, Purified Water", basePrice: 4.80 },
      { name: "Concentrated Lavender Fabric Softener", ingredients: "Biodegradable Cationic Surfactants, French Lavender Extract, Demineralized Water", basePrice: 6.90 },
      { name: "Multi-Surface Eucalyptus Cleaner", ingredients: "Organic Eucalyptus Extract, Solubilizers, Plant Soft Acids, Water", basePrice: 5.50 }
    ];
    const item = households[hashValue % households.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for healthy kitchen cleaning, home textiles preservation, or surface sanitizing. Formulated with biodegradable, deep-cleansing elements.`;
  }
  else if (selectedClass === "apparel") {
    pCat = "Apparel";
    const clothes = [
      { name: "Tailored Organic Cotton Summer Dress", ingredients: "100% GOTS-Certified Organic Combed Cotton, Pearl Shell Buttons", basePrice: 89.00 },
      { name: "Selvedge Heavyweight Denim Jeans", ingredients: "100% Heavy Selvedge Raw Denim, Copper Rivets", basePrice: 120.00 },
      { name: "Classic Unstructured Linen Blazer", ingredients: "100% Natural French Flax Linen, Silk Lining", basePrice: 175.00 },
      { name: "Ultra-Lightweight Merino Knit Sweatshirt", ingredients: "100% Superfine Australian Merino Wool", basePrice: 95.00 }
    ];
    const item = clothes[hashValue % clothes.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for sophisticated wardrobe fits, premium seasons attire, or stylish everyday look. Provides extreme material breathability.`;
  }
  else if (selectedClass === "electronics") {
    pCat = "Electronics";
    const electronics = [
      { name: "Multi-Port Silicon Smart Charger", ingredients: "High-Grade Gallium Nitride (GaN) Semiconductors, Flame-Retardant Polycarbonate", basePrice: 45.00 },
      { name: "Hi-Fi Active Noise Cancelling Earbuds", ingredients: "Recycled Tech Polymers, Acoustic Neodymium Driver, Vegan Leather Case", basePrice: 129.00 },
      { name: "Ergonomic Mechanical Wireless Keyboard", ingredients: "Anodized Aluminum Frame, Polybutylene Terephthalate Keycaps, Copper Wiring", basePrice: 149.00 }
    ];
    const item = electronics[hashValue % electronics.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for high-speed workspace productivity, premium spatial audio listening, or professional mechanical gaming. Complies with security and efficiency standards.`;
  }
  else if (selectedClass === "beauty") {
    pCat = "Beauty & Spa";
    const beauty = [
      { name: "Hydrating Rosewater Facial Serum", ingredients: "Organic Bulgarian Rose Damascena Distillate, Low-Molecular Hyaluronic Acid, Vitamin E", basePrice: 28.00 },
      { name: "Botanical Restorative Hair Mask", ingredients: "Refined Shea Butter, Organic Argan Oil, Cold-Pressed Almond Kernels, Rosemary Extract", basePrice: 22.50 },
      { name: "Mineral-Rich Volcanic Clay Mask", ingredients: "Active Bentonite Clay, Volcanic Ash Minerals, Organic Aloe Vera Leaf Juice, Glycerin", basePrice: 19.90 }
    ];
    const item = beauty[hashValue % beauty.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for luxurious skincare routines, active hair repairs, or skin impurities removal. Handcrafted using certified cruelty-free organic materials.`;
  }
  else {
    pCat = "Accessories";
    const acc = [
      { name: "Minimalist Saffiano Leather Wallet", ingredients: "100% Genuine Full-Grain Calfskin Leather, Waxed Linen Thread", basePrice: 55.00 },
      { name: "Anti-Scratch Polycarbonate Suitcase", ingredients: "Recycled Polycarbonate Shell, Aerospace-Grade Aluminum Handle, Ball-Bearing Wheels", basePrice: 165.00 },
      { name: "Unisex Polarized Wooden Sunglasses", ingredients: "Sustainably Sourced Walnut Wood Frame, Triacetate Cellulose Polarized Lenses", basePrice: 79.00 }
    ];
    const item = acc[hashValue % acc.length];
    pName = `${finalBrand} ${item.name}`;
    pIngredients = item.ingredients;
    pPrice = item.basePrice;
    pDesc = `Officially manufactured by the certified company: ${finalBrand} in ${country}. Primary Usage: This product was engineered specifically for daily carry organization, travel mobility, or summer polarized eye shielding. Crafted premium finishes for high-end longevity.`;
  }

  const pPhoto = getThemedUnsplashPhoto(pName, pCat);

  return {
    name: pName,
    description: pDesc,
    price: pPrice,
    ingredients: pIngredients,
    category: pCat,
    photoUrl: pPhoto
  };
}

// Gemini Barcode lookup and generation API
app.post('/api/barcode/lookup', authenticateUser, async (req: any, res) => {
  const { barcode } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'Barcode is mandatory' });
  }

  const normalizedCode = barcode.toString().trim();
  const db = dbInstance.getData();

  // 1. Check if we already have a product matching this barcode to reuse ingredients and description
  const existingProduct = db.products.find(p => p.barcode === normalizedCode);
  if (existingProduct) {
    const pricesObj = determineDynamicPrices(existingProduct.name, existingProduct.category || "General", normalizedCode);
    return res.json({
      success: true,
      found: true,
      product: {
        name: existingProduct.name,
        description: existingProduct.description,
        price: existingProduct.price,
        localPrice: pricesObj.localPrice,
        onlinePrice: pricesObj.onlinePrice,
        isOnlinePriceApplied: pricesObj.isOnlinePriceApplied,
        ingredients: existingProduct.ingredients || "Contains premium ingredients",
        category: existingProduct.category || "General",
        photoUrl: existingProduct.imageUrl
      }
    });
  }

  // 2. Exact match database for specific premium client/system barcodes
  const premiumMatches: Record<string, any> = {
    '8003170045361': {
      name: "Acqua Minerale Effervescente Naturale Conad",
      description: "This is a private-label, naturally effervescent mineral water sold exclusively at Conad supermarkets in Italy. The typical retail packaging is a 1.5-liter PET bottle, which often contains around 30% recycled plastic to lower its environmental footprint.",
      price: 1.95,
      localPrice: 0.45,
      onlinePrice: 1.95,
      isOnlinePriceApplied: true,
      ingredients: "Natural Mineral Water, Carbon Dioxide (CO2)",
      category: "Beverages",
      photoUrl: "https://images.unsplash.com/photo-1608889174637-3c44f6326f2a?q=80&w=800"
    },
    '800111': {
      name: "Neapolitan Espresso",
      description: "Rich, intensely aromatic espresso shot pulled to absolute perfection.",
      price: 2.50,
      localPrice: 1.20,
      onlinePrice: 2.50,
      isOnlinePriceApplied: true,
      ingredients: "Fine Arabica Espresso Blend, Spring Water",
      category: "Beverages",
      photoUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800"
    },
    '800222': {
      name: "Flaky Sicilian Cannoli",
      description: "Crisp pastry shell filled with sweet, creamy sheep ricotta and dark chocolate chips.",
      price: 4.00,
      localPrice: 2.22,
      onlinePrice: 4.00,
      isOnlinePriceApplied: true,
      ingredients: "Sheep Ricotta, Crisp Pastry Shell, Dark Chocolate Chips, Sugar",
      category: "Pastries",
      photoUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=800"
    },
    '800333': {
      name: "Artisanal Pistachio Croissant",
      description: "Warm double-baked buttery croissant oozing with premium Bronte pistachio cream.",
      price: 3.50,
      localPrice: 1.80,
      onlinePrice: 3.50,
      isOnlinePriceApplied: true,
      ingredients: "Unbleached Flour, Laminated Butter, Bronte Pistachio Cream, Eggs",
      category: "Pastries",
      photoUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=800"
    },
    '900222': {
      name: "Selvedge Denim Jacket",
      description: "Heavyweight organic raw Japanese denim with beautiful custom brass buttons.",
      price: 145.00,
      localPrice: 79.00,
      onlinePrice: 145.00,
      isOnlinePriceApplied: true,
      ingredients: "100% Cotton Selvedge Denim, Brass Rivets, Copper Buttons",
      category: "Apparel",
      photoUrl: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=800"
    },
    '900111': {
      name: "Italian Merino Wool Blazer",
      description: "Slim-cut, unstructured tailoring utilizing premium 100% fine Italian merino yarn.",
      price: 289.00,
      localPrice: 159.00,
      onlinePrice: 289.00,
      isOnlinePriceApplied: true,
      ingredients: "100% Premium Italian Merino Wool",
      category: "Apparel",
      photoUrl: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=800"
    },
    '900333': {
      name: "Classic White Linen Shirt",
      description: "Sustainably harvested premium French flax, light and airy weave.",
      price: 79.00,
      localPrice: 39.00,
      onlinePrice: 79.00,
      isOnlinePriceApplied: true,
      ingredients: "100% French Flax Linen",
      category: "Apparel",
      photoUrl: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=800"
    },
    '900444': {
      name: "Handcrafted Tan Derby Shoes",
      description: "Full-grain calfskin leather, Blake-welted soles, finished by hand with organic beeswax.",
      price: 210.00,
      localPrice: 120.00,
      onlinePrice: 210.00,
      isOnlinePriceApplied: true,
      ingredients: "Full-Grain Calfskin Leather, Waxed Linen Thread",
      category: "Accessories",
      photoUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=800"
    },
    '012499': {
      name: "Collagen Facial Serum",
      description: "A fast-absorbing, multi-molecular weight hydration treatment centering plant collagen and vitamin E extracts.",
      price: 24.50,
      localPrice: 11.50,
      onlinePrice: 24.50,
      isOnlinePriceApplied: true,
      ingredients: "Prunus Amygdalus Oil, Hydrolyzed Wheat Protein, Natural Tocopherol, Jojoba Oil",
      category: "Beauty & Spa",
      photoUrl: "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"
    }
  };

  if (premiumMatches[normalizedCode]) {
    return res.json({
      success: true,
      found: true,
      product: premiumMatches[normalizedCode]
    });
  }

  // 3. Try UPCItemDB trial API first for high-fidelity global barcode lookup
  try {
    const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${normalizedCode}`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });
    if (upcRes.ok) {
      const upcData = await upcRes.json();
      if (upcData.code === 'OK' && upcData.items && upcData.items.length > 0) {
        const item = upcData.items[0];
        const title = item.title;
        if (title && title.trim().length > 2) {
          const brand = item.brand || "Global Brand";
          const cat = normalizeGlobalCategory(item.category || title, "product");
          let photoUrl = item.images?.[0] || "";
          if (!photoUrl) {
            photoUrl = getThemedUnsplashPhoto(title, cat);
          }
          const ingredientsList = (item.features && item.features.length > 0) 
            ? item.features.join(", ") 
            : "Quality tested materials and premium manufacturing components.";
          const brandLabel = brand ? `made by the verified company, ${brand}.` : "made by a certified global manufacturer.";
          const usageInfo = `Primary Usage: This item is designed for professional consumer ${cat.toLowerCase()} application, retail convenience, or everyday premium utility.`;
          const baseDescription = item.description || `A premium certified retail product (${title}) identified via barcodes catalog registry.`;
          const fullDescription = `${baseDescription} Officially ${brandLabel} ${usageInfo}`;

          const dDynamic = determineDynamicPrices(title, cat, normalizedCode);

          return res.json({
            success: true,
            found: true,
            product: {
              name: title,
              description: fullDescription,
              price: dDynamic.price,
              localPrice: dDynamic.localPrice,
              onlinePrice: dDynamic.onlinePrice,
              isOnlinePriceApplied: dDynamic.isOnlinePriceApplied,
              ingredients: ingredientsList,
              category: cat,
              photoUrl: photoUrl
            }
          });
        }
      }
    }
  } catch (upcErr) {
    console.warn("UPCItemDB query failed, falling back to Open Facts registries:", upcErr);
  }

  // 4. Try falling back to Open Facts APIs (Open Food Facts, Open Beauty Facts, Open Products Facts) for valid real barcodes
  let foundProduct: any = null;
  
  const sources = [
    { url: `https://world.openfoodfacts.org/api/v0/product/${normalizedCode}.json`, type: "food" },
    { url: `https://world.openbeautyfacts.org/api/v0/product/${normalizedCode}.json`, type: "beauty" },
    { url: `https://world.openproductsfacts.org/api/v0/product/${normalizedCode}.json`, type: "product" }
  ];

  for (const source of sources) {
    try {
      const apiRes = await fetch(source.url);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.status === 1 && apiData.product) {
          const offProd = apiData.product;
          const mappedName = offProd.product_name || offProd.generic_name || offProd.product_name_en || '';
          
          const isGeneric = !mappedName || 
            mappedName.toLowerCase().includes('product') || 
            mappedName.toLowerCase().includes(normalizedCode) || 
            mappedName.trim().length < 3;

          if (!isGeneric) {
            const rawBrand = offProd.brands || offProd.brand_owner || offProd.creator || "Global Premium Brand";
            const rawCat = offProd.categories?.split(',')[0]?.trim() || "General";
            const cat = normalizeGlobalCategory(rawCat, source.type);

            let photoUrl = offProd.image_front_url || offProd.image_url || "";
            if (!photoUrl) {
              photoUrl = getThemedUnsplashPhoto(mappedName, cat);
            }

            const rawIng = offProd.ingredients_text || offProd.ingredients_text_with_allergens || offProd.ingredients_text_en || "";
            const ingredientsList = rawIng ? rawIng.replace(/_/g, '').trim() : "Premium select ingredients & certified compositions";
            
            const brandLabel = rawBrand ? `made by the verified manufacturer, ${rawBrand}.` : "made by our elite global retail partners.";
            const usageInfo = `Primary Usage: This product was engineered specifically for healthy ${cat.toLowerCase()} purposes, beauty care, physical workspace convenience, or domestic household utilities.`;
            const baseDescription = offProd.description || `A premium certified retail product (Code: ${normalizedCode}) from global EAN catalogs.`;
            const fullDescription = `${baseDescription} Officially ${brandLabel} ${usageInfo}`;

            const dDynamic = determineDynamicPrices(mappedName, cat, normalizedCode);

            foundProduct = {
              name: mappedName,
              description: fullDescription,
              price: dDynamic.price,
              localPrice: dDynamic.localPrice,
              onlinePrice: dDynamic.onlinePrice,
              isOnlinePriceApplied: dDynamic.isOnlinePriceApplied,
              ingredients: ingredientsList,
              category: cat,
              photoUrl: photoUrl
            };
            break; 
          }
        }
      }
    } catch (e) {
      console.warn(`Registry lookup skipped for ${source.type}:`, e);
    }
  }

  if (foundProduct) {
    return res.json({
      success: true,
      found: true,
      product: foundProduct
    });
  }

  // 4. Call Gemini API if key is set, otherwise use precise simulator
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are a world-class global product catalog analyst. A user scanned a barcode with value: "${normalizedCode}".
Based on this barcode, you must research or intelligently deduce the real-world product it corresponds to.
Products can belong to ANY category, such as Household Items, Food, Drinks, Apparel/Dress, Pizza, Alcohol, Electronics, Beauty, toys, tools, etc.

Identify:
1. The exact or highly likely product name.
2. The specific manufacturer or company that made it (e.g., Procter & Gamble, Coca-Cola Company, Unilever, L'Oreal, Apple, Samsung, Zara, Nestlé, etc.).
3. The precise category of the product.
4. What the product is used for (its primary corporate/consumer utility).
5. Chemical ingredients, sub-components, or material-composition list that went into making the product.

Generate a highly realistic, premium product JSON representation.
Do NOT limit to food or drinks. It can be a dress, whiskey, household detergent, pizza, electronics, tobacco, toys, anything.

In the "description" field of your output, you MUST explicitly detail:
1. What the product is used for (its utility and primary functions).
2. Which company made it (and where, if applicable, e.g. "This product is made by the Coca-Cola Company in Atlanta, Georgia...").

In the "ingredients" field of your output, list the exact sub-components, ingredients, or material composition (e.g. "100% Organic Silk, Custom Stitching" or "Detergent polymers, floral extracts, purified water").

Respond with EXACTLY the requested JSON structure. Do not include markdown wraps around the JSON block, just return a raw JSON string.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Official product name." },
              description: { type: Type.STRING, description: "Professional retail description of what the product is used for and which company/brand made it." },
              price: { type: Type.NUMBER, description: "A realistic floating-point retail price (e.g., 2.50, 45.00)." },
              ingredients: { type: Type.STRING, description: "Comma-separated key ingredients, subcomponents, or materials that make up the product." },
              category: { type: Type.STRING, description: "Clean standardized category such as Beverages, Alcohols, Pastries, Apparel, Accessories, Electronics, Household, Beauty & Spa, Pantry, etc." },
              brand: { type: Type.STRING, description: "The name of the company/manufacturer that made this product." }
            },
            required: ["name", "description", "price", "ingredients", "category", "brand"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text.trim());
        const categoryNormalized = normalizeGlobalCategory(parsed.category || "General", "general");
        const customPhoto = getThemedUnsplashPhoto(parsed.name, categoryNormalized);
        const dDynamic = determineDynamicPrices(parsed.name, categoryNormalized, normalizedCode);

        return res.json({
          success: true,
          found: false,
          product: {
            name: parsed.name,
            description: parsed.description,
            price: dDynamic.price,
            localPrice: dDynamic.localPrice,
            onlinePrice: dDynamic.onlinePrice,
            isOnlinePriceApplied: dDynamic.isOnlinePriceApplied,
            ingredients: parsed.ingredients,
            category: categoryNormalized,
            photoUrl: customPhoto
          }
        });
      }
    } catch (err: any) {
      console.error('Gemini processing error, falling back to simulated product:', err);
    }
  }

  // 5. Hard offline / unconfigured fallback: Dynamic global EAN parser simulator
  const picked = generateGlobalProductFallback(normalizedCode);
  const dDynamic = determineDynamicPrices(picked.name, picked.category, normalizedCode);

  return res.json({
    success: true,
    found: false,
    product: {
      name: picked.name,
      description: picked.description,
      price: dDynamic.price,
      localPrice: dDynamic.localPrice,
      onlinePrice: dDynamic.onlinePrice,
      isOnlinePriceApplied: dDynamic.isOnlinePriceApplied,
      ingredients: picked.ingredients,
      category: picked.category,
      photoUrl: picked.photoUrl
    }
  });
});

// System Users retrieval for Master Admin
app.get('/api/admin/users', authenticateUser, verifyRole(['Master Admin', 'Admin']), (req, res) => {
  res.json({ users: dbInstance.getData().users });
});

// GET /api/admin/users/backup/export allows Master Admin to download complete credentials backup
app.get('/api/admin/users/backup/export', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  try {
    const data = dbInstance.getData();
    // Return all users and their passwords
    res.json({
      users: data.users,
      passwords: data.passwords
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate credentials export backup.' });
  }
});

// POST /api/admin/users/backup/import allows Master Admin to restore complete registry backup
app.post('/api/admin/users/backup/import', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  try {
    const { users, passwords } = req.body;
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Invalid backup file structure. "users" list is required.' });
    }

    dbInstance.update((data) => {
      // Merge users
      users.forEach((importedUser: User) => {
        // Find existing by email or id
        const index = data.users.findIndex(u => u.id === importedUser.id || u.email.toLowerCase().trim() === importedUser.email.toLowerCase().trim());
        if (index > -1) {
          // Overwrite
          data.users[index] = { ...data.users[index], ...importedUser };
        } else {
          // Add new
          data.users.push(importedUser);
        }

        // Import corresponding password if supplied
        if (passwords && passwords[importedUser.id]) {
          data.passwords[importedUser.id] = passwords[importedUser.id];
        }
      });
    });

    res.json({
      success: true,
      message: `Successfully imported & merged ${users.length} user record(s).`
    });
    broadcastEvent('user_backup_restored', { count: users.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restore credentials backup.' });
  }
});

// Appoint or promote users and assign/update Workplace Mappings
app.post('/api/admin/users/map', authenticateUser, verifyRole(['Master Admin']), (req, res) => {
  const { userId, storeId, role, approve } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  let updatedUser: User | undefined;
  dbInstance.update((data) => {
    const user = data.users.find(u => u.id === userId);
    if (user) {
      if (storeId !== undefined) {
        user.storeId = storeId || undefined; // unbind or bind store context
      }
      if (role) {
        user.role = role as UserRole;
      }
      if (approve !== undefined) {
        user.approved = !!approve;
      }
      updatedUser = user;
    }
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'Target user record not found' });
  }

  res.json({ 
    success: true, 
    user: updatedUser, 
    message: `User ${updatedUser.username} workspace context updated to store mappings.` 
  });
  broadcastEvent('user_mapped', { userId, user: updatedUser });
});

// PUT /api/admin/users/:id allows Master Admin to change credentials or passwords of any user
app.put('/api/admin/users/:id', authenticateUser, verifyRole(['Master Admin']), (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { email, password, username, phone, gender, role, storeId } = req.body;
    
    let updatedUser: any = null;
    dbInstance.update((data) => {
      const u = data.users.find(usr => usr.id === id);
      if (u) {
        if (email) u.email = email.toLowerCase().trim();
        if (username) u.username = username;
        if (phone) u.phone = phone;
        if (gender) u.gender = gender;
        if (role) u.role = role;
        if (storeId !== undefined) u.storeId = storeId || undefined;
        updatedUser = u;
      }
      if (password && password.trim() !== '') {
        data.passwords[id] = password;
      }
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'User does not exist.' });
    }

    res.json({ success: true, user: updatedUser, message: 'User credentials updated smoothly by Master Admin!' });
    broadcastEvent('user_updated', { userId: id });
  } catch (err) {
    res.status(500).json({ error: 'Server edit user error.' });
  }
});

// Delete user endpoint (Master Admin only)
app.delete('/api/admin/users/:id', authenticateUser, verifyRole(['Master Admin']), (req: any, res: any) => {
  const { id } = req.params;
  
  if (id === req.user.id) {
    return res.status(400).json({ error: "Self deletion is not allowed!" });
  }

  let success = false;
  dbInstance.update((data) => {
    const index = data.users.findIndex(u => u.id === id);
    if (index > -1) {
      data.users.splice(index, 1);
      delete data.passwords[id];
      success = true;
    }
  });

  if (!success) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({ success: true, message: 'User has been removed permanently.' });
  broadcastEvent('user_deleted', { userId: id });
});

// Bulk delete users endpoint (Master Admin only)
app.post('/api/admin/users/bulk-delete', authenticateUser, verifyRole(['Master Admin']), (req: any, res: any) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing user IDs list.' });
  }

  let deletedCount = 0;
  dbInstance.update((data) => {
    data.users = data.users.filter(u => {
      // Prevent deleting self or master admin by email
      if (u.id === req.user.id || u.email === 'hasibmd461@gmail.com') {
        return true;
      }
      const shouldDelete = ids.includes(u.id);
      if (shouldDelete) {
        delete data.passwords[u.id];
        deletedCount++;
      }
      return !shouldDelete;
    });
  });

  res.json({ success: true, message: `Successfully deleted ${deletedCount} user space accounts permanently.` });
  broadcastEvent('users_bulk_deleted', { ids });
});


// 3. PRODUCT PLATFORM CATALOG CRUD
app.get('/api/products', (req: any, res: any) => {
  const { storeId, slug } = req.query;
  const db = dbInstance.getData();
  
  // Try to authenticate optionally to see if a store owner or staff is browsing
  let loggedInUser: any = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer session-token-')) {
    const userId = authHeader.replace('Bearer session-token-', '');
    const user = db.users.find(u => u.id === userId);
    if (user) {
      loggedInUser = user;
    }
  }

  let result = db.products;

  // Apply Role-based filtering: Store Owner and Store Staff ("storage stuff") can only see their own store's products
  if (loggedInUser && (loggedInUser.role === 'Store Owner' || loggedInUser.role === 'Store Staff' || loggedInUser.role === 'Admin')) {
    const userStoreId = loggedInUser.storeId || '';
    result = result.filter(p => p.storeId === userStoreId);
  } else {
    // Customers, guests, or Master Admin
    if (storeId) {
      result = result.filter(p => p.storeId === storeId);
    } else if (slug) {
      const targetStore = db.stores.find(s => s.slug === slug);
      if (targetStore) {
        result = result.filter(p => p.storeId === targetStore.id);
      } else {
        result = [];
      }
    }
  }

  res.json({ products: result });
});

// Add products (Store Owners, Admins, Master Admin, and Store Staff with matching context)
app.post('/api/products', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { storeId, name, description, price, imageUrl, stock, barcode, ingredients, category } = req.body;
  if (!storeId || !name || price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Missing mandatory product specs.' });
  }

  // Access restrictions check
  if (req.user.role !== 'Master Admin' && req.user.storeId !== storeId) {
    return res.status(403).json({ error: 'Workplace lock: You are not authorized to create catalog items at this physical store.' });
  }

  const newProduct: Product = {
    id: 'prod-' + Date.now(),
    storeId,
    name,
    description: description || '',
    price: Number(price), // No discounts or sale price allowed! Strictly definable original currency price.
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-154118811-1e0d58224f24?w=400',
    stock: Number(stock),
    barcode: barcode || '',
    ingredients: ingredients || '',
    category: category || ''
  };

  dbInstance.update((data) => {
    data.products.push(newProduct);
  });

  res.json({ success: true, product: newProduct, message: 'New retail catalog product catalogued successfully.' });
  broadcastEvent('catalog_item_added', { product: newProduct });
});

app.put('/api/products/:id', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { id } = req.params;
  const { name, description, price, imageUrl, stock, barcode, ingredients, category } = req.body;

  let updatedProduct: Product | undefined;
  dbInstance.update((data) => {
    const prod = data.products.find(p => p.id === id);
    if (prod) {
      if (req.user.role !== 'Master Admin' && req.user.storeId !== prod.storeId) {
        return res.status(403).json({ error: 'Permission denied: Workplace store-lock active.' });
      }
      if (name) prod.name = name;
      if (description !== undefined) prod.description = description;
      if (price !== undefined) prod.price = Number(price);
      if (imageUrl) prod.imageUrl = imageUrl;
      if (stock !== undefined) prod.stock = Number(stock);
      if (barcode !== undefined) prod.barcode = barcode;
      if (ingredients !== undefined) prod.ingredients = ingredients;
      if (category !== undefined) prod.category = category;
      updatedProduct = prod;
    }
  });

  if (!updatedProduct) {
    return res.status(404).json({ error: 'Retail catalog item not found.' });
  }

  res.json({ success: true, product: updatedProduct, message: 'Catalog properties finalized.' });
  broadcastEvent('catalog_item_updated', { product: updatedProduct });
});

app.delete('/api/products/:id', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { id } = req.params;
  let success = false;

  dbInstance.update((data) => {
    const index = data.products.findIndex(p => p.id === id);
    if (index > -1) {
      const prod = data.products[index];
      if (req.user.role !== 'Master Admin' && req.user.storeId !== prod.storeId) {
        return res.status(403).json({ error: 'Workplace bounds violation: Denied.' });
      }
      data.products.splice(index, 1);
      success = true;
    }
  });

  if (!success) {
    return res.status(404).json({ error: 'Product not found or access barred.' });
  }

  res.json({ success: true, message: 'Catalog item removed permanently.' });
  broadcastEvent('catalog_item_deleted', { productId: id });
});

// Bulk products delete endpoint (Master Admin, Admin, Store Owner, Store Staff)
app.post('/api/products/bulk-delete', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res: any) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing product IDs list.' });
  }

  let deletedCount = 0;
  dbInstance.update((data) => {
    data.products = data.products.filter(p => {
      const shouldDelete = ids.includes(p.id);
      if (shouldDelete) {
        // Permission check: Master Admin deletes anything, others delete only from their own stores
        if (req.user.role !== 'Master Admin' && req.user.storeId !== p.storeId) {
          return true; // keep it, unauthorized
        }
        deletedCount++;
        return false;
      }
      return true;
    });
  });

  res.json({ success: true, message: `Successfully deleted ${deletedCount} selected products from catalog.` });
  broadcastEvent('products_bulk_deleted', { ids });
});


// 4. CLEAN CHECKOUT & ORDERS MANAGER
app.post('/api/orders', (req, res) => {
  try {
    const { storeId, customerId, customerName, customerPhone, type, timeSlot, deliveryAddress, deliveryConfirmationImage, items } = req.body;
    
    if (!storeId || !customerName || !customerPhone || !type || !timeSlot || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Incomplete checkout form parameters. Missing delivery options, timeslots or checkout rows.' });
    }

    // Verify quantity threshold >= 1 unit total
    let totalQuantity = 0;
    const orderItemsParsed = items.map((it: any) => {
      totalQuantity += Number(it.quantity) || 0;
      return {
        productId: it.productId,
        name: it.name,
        price: Number(it.price),
        quantity: Number(it.quantity)
      };
    });

    if (totalQuantity < 1) {
      return res.status(400).json({ error: 'Quantity pass threshold violation: Orders must contain a cumulative product quantity greater than or equal to 1.' });
    }

    const db = dbInstance.getData();
    const store = db.stores.find(s => s.id === storeId);
    if (!store) {
      return res.status(404).json({ error: 'Direct checkout failed: Store outlet has closed or does not exist.' });
    }

    // Calculate strict base prices
    let calculatedTotalPrice = 0;
    orderItemsParsed.forEach((orderItem) => {
      const dbProd = db.products.find(p => p.id === orderItem.productId);
      const originalPrice = dbProd ? dbProd.price : orderItem.price;
      calculatedTotalPrice += originalPrice * orderItem.quantity;
      
      // Update inventory stock dynamically
      if (dbProd) {
        dbInstance.update((d) => {
          const p = d.products.find(prod => prod.id === dbProd.id);
          if (p) {
            p.stock = Math.max(0, p.stock - orderItem.quantity);
          }
        });
      }
    });

    const newOrder: Order = {
      id: 'order-' + Date.now(),
      storeId,
      customerId: customerId || 'guest-' + Date.now(),
      customerName,
      customerPhone,
      type: type as 'Pickup' | 'Delivery',
      timeSlot,
      deliveryAddress,
      deliveryConfirmationImage: deliveryConfirmationImage || '', // explicit S3 image validation fields for delivery confirmation profiles
      status: 'Pending',
      items: orderItemsParsed,
      totalPrice: calculatedTotalPrice,
      createdAt: new Date().toISOString()
    };

    dbInstance.update((data) => {
      data.orders.push(newOrder);
      // Create order notification for admin
      data.notifications.push({
        id: 'notif-order-' + Date.now(),
        title: `New Order (${store.name})`,
        body: `${customerName} placed a €${calculatedTotalPrice.toFixed(2)} order. Status: Pending.`,
        timestamp: new Date().toISOString()
      });
    });

    res.json({ success: true, order: newOrder, message: 'Checkout completed successfully! Order placed into processing queue.' });
    broadcastEvent('order_placed', { order: newOrder });

  } catch (err) {
    res.status(500).json({ error: 'Server order submission error.' });
  }
});

app.get('/api/orders', (req: any, res) => {
  const { phone, storeId, customerId } = req.query;
  const authHeader = req.headers.authorization;
  
  const db = dbInstance.getData();
  
  // If user is logged in, extract current user role mapping bounds
  if (authHeader && authHeader.startsWith('Bearer session-token-')) {
    const userId = authHeader.replace('Bearer session-token-', '');
    const user = db.users.find(u => u.id === userId);
    
    if (user) {
      if (user.role === 'Master Admin') {
        // Multi-store global crude
        return res.json({ orders: db.orders });
      } else if (user.role === 'Store Staff' || user.role === 'Store Owner' || user.role === 'Admin') {
        // Restricted context lock to mapped Store ID
        const matchedOrders = db.orders.filter(o => o.storeId === user.storeId);
        return res.json({ orders: matchedOrders });
      } else {
        // Customer view matches his own Customer ID
        const myOrders = db.orders.filter(o => o.customerId === user.id);
        return res.json({ orders: myOrders });
      }
    }
  }

  // Fallback query parameters (e.g., Guest tracing his orders via form)
  let result = db.orders;
  if (storeId) {
    result = result.filter(o => o.storeId === storeId);
  }
  if (phone) {
    result = result.filter(o => o.customerPhone.trim() === String(phone).trim());
  }
  if (customerId) {
    result = result.filter(o => o.customerId === customerId);
  }
  res.json({ orders: result });
});

// Update Order status workflow: Pending -> Confirmed -> Preparing -> Ready -> Completed / Cancelled
app.put('/api/orders/:id/status', authenticateUser, verifyRole(['Master Admin', 'Store Staff', 'Store Owner', 'Admin']), (req: any, res) => {
  const { id } = req.params;
  const { status, deliveryConfirmationImage } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Order status target matches are missing.' });
  }

  let updatedOrder: Order | undefined;
  dbInstance.update((data) => {
    const order = data.orders.find(o => o.id === id);
    if (order) {
      // Local context mapping lock check
      if (req.user.role !== 'Master Admin' && req.user.storeId !== order.storeId) {
        return res.status(403).json({ error: 'Barred Context: You do not possess staff clearance over this Store order.' });
      }
      order.status = status as OrderStatus;
      if (status === 'Completed') {
        order.completedAt = new Date().toISOString();
      }
      if (deliveryConfirmationImage) {
        order.deliveryConfirmationImage = deliveryConfirmationImage;
      }
      updatedOrder = order;
    }
  });

  if (!updatedOrder) {
    return res.status(404).json({ error: 'Order not found or blocked context.' });
  }

  res.json({ success: true, order: updatedOrder, message: `Order status upgraded to "${status}".` });
  broadcastEvent('order_status_updated', { order: updatedOrder });
});

// Delete order endpoint (Master Admin, Admin, Store Owner, Store Staff)
app.delete('/api/orders/:id', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { id } = req.params;
  let success = false;

  dbInstance.update((data) => {
    const index = data.orders.findIndex(o => o.id === id);
    if (index > -1) {
      const order = data.orders[index];
      // Permission check: Master Admin deletes anything, others delete only from their own stores
      if (req.user.role !== 'Master Admin' && req.user.storeId !== order.storeId) {
        return;
      }
      data.orders.splice(index, 1);
      success = true;
    }
  });

  if (!success) {
    return res.status(404).json({ error: 'Order not found or access barred.' });
  }

  res.json({ success: true, message: 'Order record deleted successfully.' });
  broadcastEvent('order_deleted', { orderId: id });
});

// Bulk delete orders endpoint (Master Admin, Admin, Store Owner, Store Staff)
app.post('/api/orders/bulk-delete', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res: any) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing order IDs list.' });
  }

  let deletedCount = 0;
  dbInstance.update((data) => {
    data.orders = data.orders.filter(o => {
      const shouldDelete = ids.includes(o.id);
      if (shouldDelete) {
        if (req.user.role !== 'Master Admin' && req.user.storeId !== o.storeId) {
          return true; // Keep it, access barred
        }
        deletedCount++;
        return false;
      }
      return true;
    });
  });

  res.json({ success: true, message: `Successfully removed ${deletedCount} selected orders from the dispatch ledger.` });
  broadcastEvent('orders_bulk_deleted', { ids });
});


// 5. DIRECT CHAT CONNECTIONS
app.get('/api/chat/messages/:storeId', (req, res) => {
  const { storeId } = req.params;
  const { customerId } = req.query; // thread filtering
  const db = dbInstance.getData();
  
  let result = db.messages.filter(m => m.storeId === storeId);
  if (customerId) {
    result = result.filter(m => m.senderId === customerId || m.senderId === 'store-' + storeId || m.senderId === String(storeId));
  }
  res.json({ messages: result });
});

app.post('/api/chat/send', (req, res) => {
  try {
    const { storeId, senderId, senderName, senderRole, text } = req.body;
    if (!storeId || !senderId || !senderName || !text) {
      return res.status(400).json({ error: 'Incomplete chat packet header.' });
    }

    const newMessage: Message = {
      id: 'msg-' + Date.now(),
      storeId,
      senderId,
      senderName,
      senderRole: (senderRole || 'Guest') as UserRole,
      text,
      timestamp: new Date().toISOString()
    };

    dbInstance.update((data) => {
      data.messages.push(newMessage);
    });

    res.json({ success: true, message: newMessage });
    broadcastEvent('chat_received', { storeId, message: newMessage });

  } catch (err) {
    res.status(500).json({ error: 'Core Chat service failed.' });
  }
});


// 6. SYSTEM STORES GEOLOCATION OVERLAYS
app.get('/api/admin/locations', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Staff', 'Store Owner']), (req: any, res) => {
  const db = dbInstance.getData();
  // Master Admin views all registered coordinates, store staff/owner view relevant order/customer coordinates.
  const locations: any[] = [];

  db.stores.forEach(s => {
    locations.push({
      type: 'Store Outlet',
      label: s.name,
      address: s.address,
      phone: s.phone,
      imageUrl: s.photoUrl
    });
  });

  const activeOrders = req.user.role === 'Master Admin'
    ? db.orders
    : db.orders.filter(o => o.storeId === req.user.storeId);

  activeOrders.forEach(o => {
    if (o.type === 'Delivery' && o.deliveryAddress) {
      locations.push({
        type: 'Customer Delivery Drop',
        label: `Order #${o.id.slice(-4)} (${o.customerName})`,
        address: o.deliveryAddress,
        phone: o.customerPhone,
        imageUrl: o.deliveryConfirmationImage || ''
      });
    }
  });

  res.json({ locations });
});


// Serve React build in production, otherwise Vite client dev server
async function bootServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hasib's Superstore Company Server online: http://0.0.0.0:${PORT}`);
  });
}

bootServer();
