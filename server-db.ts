import fs from 'fs';
import path from 'path';
import { User, Store, Product, Order, Message, SystemNotification } from './src/types.js';

const DB_FILE = path.join(process.cwd(), 'db.json');

export interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>; // userId -> password (stored simply for mock security)
  stores: Store[];
  products: Product[];
  orders: Order[];
  messages: Message[];
  notifications: SystemNotification[];
}

// Master Admin Seed
const MASTER_ADMIN_EMAIL = 'hasibmd461@gmail.com';
const MASTER_ADMIN_USER = 'HASIBUR461';
const MASTER_ADMIN_PASS = 'HASIBUR.spv1';

const INITIAL_SCHEMA: DatabaseSchema = {
  users: [
    {
      id: 'admin-hasib',
      username: MASTER_ADMIN_USER,
      email: MASTER_ADMIN_EMAIL,
      role: 'Master Admin',
      approved: true,
      phone: '+39 352 058 6823',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      registrationDate: new Date('2026-01-01T00:00:00Z').toISOString()
    },
    {
      id: 'store-owner-1',
      username: 'Marco Owner',
      email: 'marco@example.com',
      role: 'Store Owner',
      approved: true,
      storeId: 'store-rome-cafe',
      phone: '+39 333 123 4567',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      registrationDate: new Date('2026-02-15T12:00:00Z').toISOString()
    },
    {
      id: 'store-staff-1',
      username: 'Sarah Staff',
      email: 'sarah@example.com',
      role: 'Store Staff',
      approved: true,
      storeId: 'store-rome-cafe',
      phone: '+39 334 987 6543',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      registrationDate: new Date('2026-03-10T14:30:00Z').toISOString()
    },
    {
      id: 'customer-1',
      username: 'John Customer',
      email: 'john@example.com',
      role: 'Customer',
      approved: true,
      phone: '+39 335 111 2222',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      deliveryLocation: 'Viale dei Romani 45, Rome, Italy',
      registrationDate: new Date('2026-05-22T21:00:00Z').toISOString()
    }
  ],
  passwords: {
    'admin-hasib': MASTER_ADMIN_PASS,
    'store-owner-1': 'password123',
    'store-staff-1': 'password123',
    'customer-1': 'password123'
  },
  stores: [
    {
      id: 'store-rome-cafe',
      name: 'Rome Central Café',
      slug: 'rome-central-cafe',
      description: 'Charming Italian coffee & pastries served in the historic heart of Rome.',
      address: 'Piazza Navona 4, 00186 Roma RM, Italy',
      phone: '+39 06 123456',
      photoUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
      openingTime: '09:00',
      closingTime: '21:00'
    },
    {
      id: 'store-hasib-fashion',
      name: "Hasib's Fashion Spot",
      slug: 'hasibs-fashion-spot',
      description: 'Exclusive retail design clothing, hand-curated suits, and luxury apparel.',
      address: 'Via del Corso 112, 00186 Roma RM, Italy',
      phone: '+39 06 987654',
      photoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
      openingTime: '10:00',
      closingTime: '20:00'
    }
  ],
  products: [
    // Rome Central Café
    {
      id: 'prod-1',
      storeId: 'store-rome-cafe',
      name: 'Neapolitan Espresso',
      description: 'Rich, intensely aromatic espresso shot pulled to absolute perfection.',
      price: 2.50,
      imageUrl: 'https://images.unsplash.com/photo-151097252790b-af4f42d91dfa?w=400',
      stock: 120,
      barcode: '800111'
    },
    {
      id: 'prod-2',
      storeId: 'store-rome-cafe',
      name: 'Flaky Sicilian Cannoli',
      description: 'Crisp pastry shell filled with sweet, creamy sheep ricotta and dark chocolate chips.',
      price: 4.00,
      imageUrl: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400',
      stock: 45,
      barcode: '800222'
    },
    {
      id: 'prod-3',
      storeId: 'store-rome-cafe',
      name: 'Artisanal Pistachio Croissant',
      description: 'Warm double-baked buttery croissant oozing with premium Bronte pistachio cream.',
      price: 3.50,
      imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400',
      stock: 30,
      barcode: '800333'
    },
    {
      id: 'prod-4',
      storeId: 'store-rome-cafe',
      name: 'Caramel Macchiato Grande',
      description: 'Rich espresso, steamed milk, vanilla syrup, and a decadent buttery caramel drizzle.',
      price: 4.80,
      imageUrl: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=400',
      stock: 75,
      barcode: '800444'
    },
    {
      id: 'prod-5',
      storeId: 'store-rome-cafe',
      name: 'Classic Tiramisu Slice',
      description: 'Layers of coffee-soaked ladyfingers and velvet mascarpone sabayon cream.',
      price: 5.50,
      imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400',
      stock: 20,
      barcode: '800555'
    },
    {
      id: 'prod-6',
      storeId: 'store-rome-cafe',
      name: 'Iced Matcha Green Latte',
      description: 'Pure ceremonial Uji matcha whisked with cold oat milk and clean organic cane syrup.',
      price: 5.00,
      imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400',
      stock: 50,
      barcode: '800666'
    },
    // Hasib's Fashion Spot
    {
      id: 'prod-7',
      storeId: 'store-hasib-fashion',
      name: 'Italian Merino Wool Blazer',
      description: 'Slim-cut, unstructured tailoring utilizing premium 100% fine Italian merino yarn.',
      price: 289.00,
      imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400',
      stock: 12,
      barcode: '900111'
    },
    {
      id: 'prod-8',
      storeId: 'store-hasib-fashion',
      name: 'Selvedge Denim Jacket',
      description: 'Heavyweight organic raw Japanese denim with beautiful custom brass buttons.',
      price: 145.00,
      imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=400',
      stock: 18,
      barcode: '900222'
    },
    {
      id: 'prod-9',
      storeId: 'store-hasib-fashion',
      name: 'Classic White Linen Shirt',
      description: 'Breathes perfectly. Crafted from sustainably harvested premium French flax.',
      price: 79.00,
      imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400',
      stock: 40,
      barcode: '900333'
    },
    {
      id: 'prod-10',
      storeId: 'store-hasib-fashion',
      name: 'Handcrafted Tan Derby Shoes',
      description: 'Full-grain calfskin leather, Blake-welted soles, finished by hand with organic bees wax.',
      price: 210.00,
      imageUrl: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=400',
      stock: 8,
      barcode: '900444'
    }
  ],
  orders: [
    {
      id: 'order-1',
      storeId: 'store-rome-cafe',
      customerId: 'customer-1',
      customerName: 'John Customer',
      customerPhone: '+39 335 111 2222',
      type: 'Delivery',
      timeSlot: '14:00 - 15:00',
      deliveryAddress: 'Viale dei Romani 45, Rome, Italy',
      deliveryConfirmationImage: '',
      status: 'Ready',
      items: [
        { productId: 'prod-1', name: 'Neapolitan Espresso', price: 2.50, quantity: 2 },
        { productId: 'prod-3', name: 'Artisanal Pistachio Croissant', price: 3.50, quantity: 1 }
      ],
      totalPrice: 8.50,
      createdAt: new Date('2026-05-22T13:45:00Z').toISOString()
    }
  ],
  messages: [
    {
      id: 'msg-1',
      storeId: 'store-rome-cafe',
      senderId: 'customer-1',
      senderName: 'John Customer',
      senderRole: 'Customer',
      text: 'Good afternoon, is my breakfast coffee order dispatched yet?',
      timestamp: new Date('2026-05-22T13:48:00Z').toISOString()
    },
    {
      id: 'msg-2',
      storeId: 'store-rome-cafe',
      senderId: 'store-staff-1',
      senderName: 'Sarah Staff',
      senderRole: 'Store Staff',
      text: 'Hello John! Yes, it is currently in our "Ready" stage and mapped for delivery.',
      timestamp: new Date('2026-05-22T13:50:00Z').toISOString()
    }
  ],
  notifications: [
    {
      id: 'notif-1',
      title: 'Welcome to Hasib\'s Superstore Company!',
      body: 'Platform initialized with full corporate credentials and dual flagship store instances.',
      timestamp: new Date('2026-05-23T00:00:00Z').toISOString()
    }
  ]
};

export class FileDB {
  private cache: DatabaseSchema;

  constructor() {
    this.cache = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        // Guarantee models exist
        if (parsed.users && parsed.stores && parsed.products && parsed.orders && parsed.messages) {
          // Dynamic migration/defaulting for loaded stores
          parsed.stores.forEach((s: any) => {
            if (!s.openingTime) s.openingTime = '09:00';
            if (!s.closingTime) s.closingTime = '21:00';
          });
          // Verify that hasibmd461@gmail.com Master Admin matches correct credentials exactly
          let masterAdmin = parsed.users.find((u: any) => u.email === MASTER_ADMIN_EMAIL);
          if (!masterAdmin) {
            masterAdmin = {
              id: 'admin-hasib',
              username: MASTER_ADMIN_USER,
              email: MASTER_ADMIN_EMAIL,
              role: 'Master Admin',
              approved: true,
              phone: '+39 352 058 6823',
              avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              registrationDate: new Date('2026-01-01T00:00:00Z').toISOString()
            };
            parsed.users.push(masterAdmin);
          }
          parsed.passwords[masterAdmin.id] = MASTER_ADMIN_PASS;
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading DB file, fallback to initial schema', e);
    }
    this.saveToDisk(INITIAL_SCHEMA);
    return INITIAL_SCHEMA;
  }

  public saveToDisk(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing to DB file', e);
    }
  }

  public getData(): DatabaseSchema {
    return this.cache;
  }

  public update(updater: (data: DatabaseSchema) => void) {
    updater(this.cache);
    this.saveToDisk(this.cache);
  }
}

export const dbInstance = new FileDB();
