import express from 'express';
import path from 'path';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { GoogleGenAI, Type } from "@google/genai";
import { dbInstance } from './server-db.js';
import { User, Store, Product, Order, Message, UserRole, OrderStatus } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

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
    const { username, email, phone, avatar, gender, newPassword } = req.body;
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

// Base64 direct upload simulator using mock storagePut S3 utility
app.post('/api/admin/stores/upload', authenticateUser, (req, res) => {
  const { base64Data, filename } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'Provide a valid base64 image encoding buffer.' });
  }
  // S3 simulation
  const uniqueKey = `${Date.now()}-${filename || 'shopPhoto.png'}`;
  const persistentUrl = `https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format`; // mock fallback url
  // If base64 conforms, return structured mock S3 storage put destination:
  res.json({
    success: true,
    url: base64Data.startsWith('data:image') ? base64Data : persistentUrl,
    key: `s3://hasibs-retail-pro/images/${uniqueKey}`
  });
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
    return res.json({
      success: true,
      found: true,
      product: {
        name: existingProduct.name,
        description: existingProduct.description,
        price: existingProduct.price,
        ingredients: existingProduct.ingredients || "Contains premium ingredients",
        category: existingProduct.category || "General",
        photoUrl: existingProduct.imageUrl
      }
    });
  }

  // 2. Call Gemini API if key is set, otherwise use heuristic simulator
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

      const prompt = `You are an expert retail inventory catalog generator. A user scanned a barcode with value: "${normalizedCode}".
Based on this barcode number, you must generate a highly realistic, premium product entry.
If the barcode matches a specific real-world product trend or number style, you are encouraged to match it.
Otherwise, create an engaging, high-end retail item that matches the barcode context.
Make sure to generate a helpful name, price (between 2.00 and 150.00 EUR), description, ingredients (if food/drink) or material configuration (if retail/clothing/general), and category.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Catchy, high quality product name." },
              description: { type: Type.STRING, description: "Professional enticing retail marketing description and ingredients list if food/beverage." },
              price: { type: Type.NUMBER, description: "A realistic floating-point retail price (e.g., 3.50, 18.00)." },
              ingredients: { type: Type.STRING, description: "Comma-separated key ingredients (e.g. Flour, sugar, chocolate) or material composition (e.g. 100% Organic Cotton) that goes into making the product." },
              category: { type: Type.STRING, description: "Category name like Beverages, Apparel, Pastries, Electronics, etc." }
            },
            required: ["name", "description", "price", "ingredients", "category"]
          }
        }
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text.trim());
        return res.json({
          success: true,
          found: false,
          product: {
            name: parsed.name,
            description: parsed.description,
            price: Number(parsed.price) || 9.99,
            ingredients: parsed.ingredients,
            category: parsed.category || "General",
            photoUrl: ""
          }
        });
      }
    } catch (err: any) {
      console.error('Gemini processing error, falling back to simulated product:', err);
    }
  }

  // Fallback heuristic simulation generator for offline/unconfigured API key environment
  const hasDigits = /^\d+$/.test(normalizedCode);
  let name = "";
  let description = "";
  let price = 5.99;
  let ingredients = "";
  let category = "General";

  if (normalizedCode.startsWith('800')) {
    const items = [
      { name: "Double Shot Espresso Macchiato", desc: "Our secret blend of dark roasted Arabica espresso beans, velvety steamed whole milk, and caramel drizzle.", p: 3.80, ing: "Fine Arabica Espresso Blend, Whole Milk, Caramel Drizzle, Spring Water", cat: "Beverages" },
      { name: "Gluten-Free Almond Amaretti Cookie", desc: "Traditional soft almond cookies crafted in-house with sweet and bitter apricots, baked to a perfect light crisp.", p: 4.50, ing: "Ground Almonds, Apricot Kernels, Egg Whites, Organic Sugar, Honey, Powdered Sugar", cat: "Pastries" },
      { name: "Sourdough Chocolate Hazelnut Croissant", desc: "Perfectly laminated 36-hour sourdough pastry, double-folded with premium Dark Belgian Chocolate and roasted Piedmont hazelnut filling.", p: 5.20, ing: "Unbleached Flour, Laminated Butter, 70% Dark Belgian Chocolate, Piedmont Hazelnuts, Sea Salt", cat: "Pastries" }
    ];
    const picked = items[Number(normalizedCode) % items.length];
    name = picked.name;
    description = picked.desc;
    price = picked.p;
    ingredients = picked.ing;
    category = picked.cat;
  } else if (normalizedCode.startsWith('900')) {
    const items = [
      { name: "Selvedge Indigo Denim Trucker Jacket", desc: "Authentic 14oz shuttle-loomed Japanese selvedge denim in a deep indigo rinse. Built to age gracefully with distinct fading characteristics.", p: 149.00, ing: "100% Cotton Selvedge Denim, Brass Rivets, Copper Buttons", cat: "Apparel" },
      { name: "Premium Merino Wool Knit Sweater", desc: "Thick double-ply Australian Merino wool sweater designed with a modern mock neck line for absolute luxury and cold-day warmth.", p: 89.00, ing: "100% Extra-Fine Australian Merino Wool", cat: "Apparel" },
      { name: "Handmade Saffiano Leather Card Holder", desc: "Elegant textured Saffiano leather wallet featuring four hand-stitched pockets and center bill pouch with hand-painted raw edges.", p: 39.00, ing: "Genuine Saffiano Leather, Waxed Linen Thread, Suede Lining", cat: "Accessories" }
    ];
    const picked = items[Number(normalizedCode) % items.length];
    name = picked.name;
    description = picked.desc;
    price = picked.p;
    ingredients = picked.ing;
    category = picked.cat;
  } else {
    const items = [
      { name: "Hydro-Active Collagen Botanical Facial Serum", desc: "A fast-absorbing, multi-molecular weight hydration treatment centering plant collagen and vitamin E extracts.", p: 24.50, ing: "Prunus Amygdalus Oil, Hydrolyzed Wheat Protein, Natural Tocopherol, Jojoba Oil", cat: "Beauty & Spa" },
      { name: "Crisp Sea-Salt Rosemary Crackers", desc: "Stoneground wheat flour dough lightly baked and dusted with hand-harvested sea-salt flakes and organic rosemary twigs.", p: 4.20, ing: "Stoneground Whole Wheat Flour, Cold-Pressed Olive Oil, Fresh Rosemary, Maldon Sea Salt", cat: "Bakery & Snacks" }
    ];
    const index = normalizedCode.charCodeAt(0) % items.length;
    const picked = items[isNaN(index) ? 0 : index];
    name = picked.name;
    description = picked.desc;
    price = picked.p;
    ingredients = picked.ing;
    category = picked.cat;
  }

  res.json({
    success: true,
    found: false,
    product: {
      name,
      description,
      price,
      ingredients,
      category,
      photoUrl: ""
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
  const { storeId, name, description, price, imageUrl, stock, barcode } = req.body;
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
    barcode: barcode || ''
  };

  dbInstance.update((data) => {
    data.products.push(newProduct);
  });

  res.json({ success: true, product: newProduct, message: 'New retail catalog product catalogued successfully.' });
  broadcastEvent('catalog_item_added', { product: newProduct });
});

app.put('/api/products/:id', authenticateUser, verifyRole(['Master Admin', 'Admin', 'Store Owner', 'Store Staff']), (req: any, res) => {
  const { id } = req.params;
  const { name, description, price, imageUrl, stock, barcode } = req.body;

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
