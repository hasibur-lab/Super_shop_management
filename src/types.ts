export type UserRole = 'Guest' | 'Customer' | 'Store Staff' | 'Store Owner' | 'Admin' | 'Master Admin';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  approved: boolean; // Needs to be approved (especially Store Owners, who need approval)
  storeId?: string; // Mapped store (local Admins, Store Staff, Store Owners are locked to this store)
  phone: string;
  avatar: string;
  gender?: 'Man' | 'Woman';
  deliveryLocation?: string; // Delivery lat/long or textual address description for sharing
  registrationDate: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string; // generated safe unique slug representing the store: e.g. /store/:slug
  description: string;
  address: string;
  phone: string;
  photoUrl: string; // Base64 stored URL or standard unsplash mock
  openingTime?: string;
  closingTime?: string;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number; // strictly定義 base price, zero discounts, cross-out sales or gamification
  imageUrl: string;
  stock: number;
  barcode?: string;
  ingredients?: string;
  category?: string;
}

export type OrderStatus = 'Pending' | 'Confirmed' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  storeId: string;
  customerId: string; // customer user ID or 'guest-...'
  customerName: string;
  customerPhone: string;
  type: 'Pickup' | 'Delivery';
  timeSlot: string; // delivery/pickup time slots
  deliveryAddress?: string;
  deliveryConfirmationImage?: string; // explicit base64 URL or S3 simulated verification field for delivery confirmation profile
  status: OrderStatus;
  items: OrderItem[];
  totalPrice: number;
  createdAt: string;
  completedAt?: string;
}

export interface Message {
  id: string;
  storeId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  link?: string;
}
