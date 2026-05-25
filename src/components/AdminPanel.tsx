import React, { useState, useEffect } from 'react';
import { User, Store, Product, Order, Message, UserRole } from '../types.js';
import { Shield, Home, Users, Store as StoreIcon, ShoppingBag, Plus, Map, MapPin, Check, X, Phone, Edit, UploadCloud, Barcode, Search, ShoppingCart, Trash2, MessageCircle, Clock, Camera } from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import JSZip from 'jszip';

interface AdminPanelProps {
  token: string | null;
  currentUser: User;
  activeTab?: 'stores' | 'users' | 'catalog' | 'orders' | 'delivery' | 'pos';
  onTabChange?: (tab: 'stores' | 'users' | 'catalog' | 'orders' | 'delivery' | 'pos') => void;
}

export default function AdminPanel({ token, currentUser, activeTab: propActiveTab, onTabChange }: AdminPanelProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  
  const [localActiveTab, setLocalActiveTab] = useState<'stores' | 'users' | 'catalog' | 'orders' | 'delivery' | 'pos'>(() => {
    if (currentUser.role === 'Store Staff' || currentUser.role === 'Store Owner') {
      return 'pos';
    }
    return 'stores';
  });

  const activeTab = propActiveTab || localActiveTab;
  const setActiveTab = onTabChange || setLocalActiveTab;

  const [loading, setLoading] = useState(true);

  // Catalog Form / Edit State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodBarcode, setProdBarcode] = useState('');

  // POS Selling Panel State
  const [posBarcodeIn, setPosBarcodeIn] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [posCart, setPosCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [posError, setPosError] = useState<string | null>(null);
  const [posSuccess, setPosSuccess] = useState<string | null>(null);

  // Store Form State
  const [storeName, setStoreName] = useState('');
  const [storeDesc, setStoreDesc] = useState('');
  const [storeAddr, setStoreAddr] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storePhoto, setStorePhoto] = useState('');
  const [storeFormError, setStoreFormError] = useState<string | null>(null);
  const [storeFormSuccess, setStoreFormSuccess] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Edit Store State
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  // User Search, Sub-tabs & Editing states for Master Admin
  const [userSearchEmail, setUserSearchEmail] = useState('');
  const [usersSubTab, setUsersSubTab] = useState<'staff' | 'customer'>('staff');
  
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserUsername, setEditUserUsername] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserGender, setEditUserGender] = useState<'Man' | 'Woman'>('Man');
  const [editUserRole, setEditUserRole] = useState<UserRole>('Customer');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserStoreId, setEditUserStoreId] = useState<string>('');
  
  const [editUserError, setEditUserError] = useState<string | null>(null);
  const [editUserSuccess, setEditUserSuccess] = useState<string | null>(null);
  const [editUserLoading, setEditUserLoading] = useState(false);

  // Backup file configuration states
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  // Catalog Form State
  const [selectedCatalogStoreId, setSelectedCatalogStoreId] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodError, setProdError] = useState<string | null>(null);
  const [prodSuccess, setProdSuccess] = useState<string | null>(null);

  // User-defined low stock alert threshold state
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('lowStockThreshold');
    return saved ? parseInt(saved, 10) : 5;
  });

  const updateLowStockThreshold = (val: number) => {
    const finalVal = isNaN(val) ? 0 : val;
    setLowStockThreshold(finalVal);
    localStorage.setItem('lowStockThreshold', finalVal.toString());
  };

  // Camera Barcode Scanning States
  const [isCatalogScannerOpen, setIsCatalogScannerOpen] = useState(false);
  const [isPosScannerOpen, setIsPosScannerOpen] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);

  // Live order panel communication states
  const [chattingOrderId, setChattingOrderId] = useState<string | null>(null);
  const [activeOrderMessages, setActiveOrderMessages] = useState<Message[]>([]);
  const [adminChatText, setAdminChatText] = useState('');

  // Timing changing system state
  const [timingStoreId, setTimingStoreId] = useState('');
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('21:00');
  const [timingMsg, setTimingMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [timingLoading, setTimingLoading] = useState(false);

  // Sync timing systems when stores load or timing selection shifts
  useEffect(() => {
    if (stores.length > 0) {
      const activeId = currentUser.role === 'Master Admin' ? (timingStoreId || stores[0].id) : (currentUser.storeId || '');
      const store = stores.find(s => s.id === activeId);
      if (store) {
        setTimingStoreId(store.id);
        const oT = store.openingTime || '09:00';
        const cT = store.closingTime || '21:00';
        setOpeningTime(oT);
        setClosingTime(cT);
      }
    }
  }, [stores, currentUser, timingStoreId]);

  const syncOrderChatThread = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    try {
      const res = await fetch(`/api/chat/messages/${order.storeId}?customerId=${order.customerId}`);
      const data = await res.json();
      if (res.ok) {
        setActiveOrderMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to sync order chat thread', e);
    }
  };

  useEffect(() => {
    if (!chattingOrderId) {
      setActiveOrderMessages([]);
      return;
    }
    syncOrderChatThread(chattingOrderId);
    const interval = setInterval(() => {
      syncOrderChatThread(chattingOrderId);
    }, 4500);
    return () => clearInterval(interval);
  }, [chattingOrderId, orders]);

  // Fetch telemetry logs
  const fetchAllData = async () => {
    try {
      // Fetch users
      const usersRes = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      if (usersRes.ok) setUsers(usersData.users || []);

      // Fetch stores
      const storesRes = await fetch('/api/stores');
      const storesData = await storesRes.json();
      if (storesRes.ok) {
        setStores(storesData.stores || []);
        if (storesData.stores?.length > 0 && !selectedCatalogStoreId) {
          setSelectedCatalogStoreId(storesData.stores[0].id);
        }
      }

      // Fetch products
      const pRes = await fetch('/api/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pData = await pRes.json();
      if (pRes.ok) setProducts(pData.products || []);

      // Fetch orders
      const oRes = await fetch('/api/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const oData = await oRes.json();
      if (oRes.ok) setOrders(oData.orders || []);

      // Fetch map locations
      const locRes = await fetch('/api/admin/locations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const locData = await locRes.json();
      if (locRes.ok) setLocations(locData.locations || []);

    } catch (e) {
      console.error('Failed to sync master admin telemetry', e);
    } finally {
      setLoading(false);
    }
  };

  // Multiple selection/bulk delete tracking states
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [ordersFilterSubTab, setOrdersFilterSubTab] = useState<'all' | 'completed' | 'cancelled'>('all');

  useEffect(() => {
    fetchAllData();
  }, [token]);

  useEffect(() => {
    if (!autoRefreshEnabled || !token) return;
    const interval = setInterval(() => {
      fetchAllData();
    }, 5000); // Poll and refresh every 5s if auto-refresh is toggled on
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, token]);

  // S3 storagePut base64 simulated upload helper
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'store' | 'prod') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        const response = await fetch('/api/admin/stores/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ base64Data: base64String, filename: file.name })
        });
        const uploadResult = await response.json();
        if (response.ok && uploadResult.success) {
          if (target === 'store') {
            setStorePhoto(uploadResult.url);
          } else {
            setProdImage(uploadResult.url);
          }
        }
      } catch (err) {
        console.error('Upload failed with buffer conversion', err);
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Create store slug & persist record
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreFormError(null);
    setStoreFormSuccess(null);

    if (!storeName || !storeDesc || !storeAddr || !storePhone) {
      setStoreFormError('Please specify all required properties.');
      return;
    }

    try {
      const method = editingStoreId ? 'PUT' : 'POST';
      const endpoint = editingStoreId ? `/api/admin/stores/${editingStoreId}` : '/api/admin/stores';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: storeName,
          description: storeDesc,
          address: storeAddr,
          phone: storePhone,
          photoUrl: storePhoto
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to persist store properties.');
      }

      setStoreFormSuccess(editingStoreId ? 'Store properties updated dynamically and saved permanently in database.' : 'New storefront provisioned with URL slug routing successfully.');
      setStoreName('');
      setStoreDesc('');
      setStoreAddr('');
      setStorePhone('');
      setStorePhoto('');
      setEditingStoreId(null);
      await fetchAllData();
    } catch (err: any) {
      setStoreFormError(err.message || 'Error executing action.');
    }
  };

  const startEditStore = (store: Store) => {
    setEditingStoreId(store.id);
    setStoreName(store.name);
    setStoreDesc(store.description);
    setStoreAddr(store.address);
    setStorePhone(store.phone);
    setStorePhoto(store.photoUrl);
    setStoreFormError(null);
    setStoreFormSuccess(null);
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!window.confirm('Are you absolutely sure you want to remove this shop permanently? All associated products will be deleted as well.')) {
      return;
    }
    setStoreFormError(null);
    setStoreFormSuccess(null);
    try {
      const response = await fetch(`/api/admin/stores/${storeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete store.');
      }
      setStoreFormSuccess(data.message || 'Store deleted successfully.');
      await fetchAllData();
    } catch (err: any) {
      setStoreFormError(err.message || 'Failed to delete store.');
    }
  };

  const handleShareStore = (store: any) => {
    try {
      const origin = window.location.origin;
      const path = window.location.pathname;
      const url = `${origin}${path}#/store/${store.slug}?isolated=true`;
      
      navigator.clipboard.writeText(url).then(() => {
        setShareSuccess(`Unique URL copied to clipboard: ${store.name}`);
        setTimeout(() => setShareSuccess(null), 4000);
      }).catch(err => {
        setShareSuccess(`Share Link: ${url}`);
        setTimeout(() => setShareSuccess(null), 8000);
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser.id) {
      alert("Self deletion is not permitted.");
      return;
    }
    if (!window.confirm("Are you absolutely sure you want to delete this user permanently? This will remove their credentials and database record.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBackupSuccess(data.message || 'User deleted successfully.');
        await fetchAllData();
      } else {
        setBackupError(data.error || 'Failed to delete user.');
      }
    } catch (err: any) {
      setBackupError(err.message || 'Error occurred while deleting user.');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Are you absolutely sure you want to remove this order from history?")) {
      return;
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        await fetchAllData();
      } else {
        alert(data.error || 'Failed to delete order.');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting order.');
    }
  };

  const handleBulkDeleteStores = async () => {
    if (selectedStoreIds.length === 0) return;
    if (!window.confirm(`Are you absolutely sure you want to delete the ${selectedStoreIds.length} selected store(s)? This will also delete all of their mapped products and unbind staff.`)) {
      return;
    }
    try {
      setStoreFormError(null);
      setStoreFormSuccess(null);
      const res = await fetch('/api/admin/stores/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedStoreIds })
      });
      const data = await res.json();
      if (res.ok) {
        setStoreFormSuccess(data.message || 'Stores deleted successfully.');
        setSelectedStoreIds([]);
        await fetchAllData();
      } else {
        setStoreFormError(data.error || 'Bulk store deletion rejected.');
      }
    } catch (err: any) {
      setStoreFormError(err.message || 'Error during-bulk delete.');
    }
  };

  const handleBulkDeleteUsers = async () => {
    const cleanIds = selectedUserIds.filter(id => id !== currentUser.id && id !== 'admin-hasib');
    if (cleanIds.length === 0) {
      alert("No valid user selection to delete (you cannot delete yourself or the main admin).");
      return;
    }
    if (!window.confirm(`Are you absolutely sure you want to delete the ${cleanIds.length} selected user account(s) permanently?`)) {
      return;
    }
    try {
      setBackupError(null);
      setBackupSuccess(null);
      const res = await fetch('/api/admin/users/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: cleanIds })
      });
      const data = await res.json();
      if (res.ok) {
        setBackupSuccess(data.message || 'Selected users deleted successfully.');
        setSelectedUserIds([]);
        await fetchAllData();
      } else {
        setBackupError(data.error || 'Bulk user deletion rejected.');
      }
    } catch (err: any) {
      setBackupError(err.message || 'Error deleting selected users.');
    }
  };

  const handleBulkDeleteProducts = async () => {
    if (selectedProductIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedProductIds.length} selected catalogue items permanently?`)) {
      return;
    }
    try {
      setProdError(null);
      setProdSuccess(null);
      const res = await fetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedProductIds })
      });
      const data = await res.json();
      if (res.ok) {
        setProdSuccess(data.message || 'Selected products deleted.');
        setSelectedProductIds([]);
        await fetchAllData();
      } else {
        setProdError(data.error || 'Bulk delete failed.');
      }
    } catch (err: any) {
      setProdError(err.message || 'Error bulk deleting products.');
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Are you absolutely sure you want to delete the ${selectedOrderIds.length} selected order(s) permanently?`)) {
      return;
    }
    try {
      const res = await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedOrderIds })
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedOrderIds([]);
        await fetchAllData();
      } else {
        alert(data.error || 'Bulk order deletion failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred during bulk order deletion.');
    }
  };

  // User to Store workplace bounds mappings
  const handleMapUser = async (userId: string, storeId: string | null, role: string, approve?: boolean) => {
    try {
      const response = await fetch('/api/admin/users/map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, storeId, role, approve })
      });
      if (response.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Failed user context bind maps', err);
    }
  };

  const handleEditUserClick = (u: User) => {
    setEditingUser(u);
    setEditUserUsername(u.username);
    setEditUserEmail(u.email);
    setEditUserPhone(u.phone || '');
    setEditUserGender(u.gender || 'Man');
    setEditUserRole(u.role);
    setEditUserStoreId(u.storeId || '');
    setEditUserPassword('');
    setEditUserError(null);
    setEditUserSuccess(null);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError(null);
    setEditUserSuccess(null);
    setEditUserLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editUserUsername,
          email: editUserEmail,
          phone: editUserPhone,
          gender: editUserGender,
          role: editUserRole,
          storeId: editUserStoreId || undefined,
          password: editUserPassword || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to override user credentials.');
      }

      setEditUserSuccess(data.message || 'Credentials overridden permanently!');
      await fetchAllData();
      
      // Close modal after success after a slight delay
      setTimeout(() => {
        setEditingUser(null);
      }, 1000);
    } catch (err: any) {
      setEditUserError(err.message || 'Failed to modify database user record.');
    } finally {
      setEditUserLoading(false);
    }
  };

  const handleCatalogBarcodeScan = async (barcode: string) => {
    setProdBarcode(barcode);
    setScannerLoading(true);
    setProdError(null);
    setProdSuccess(`Scanned barcode: ${barcode}. AI/Generative Context is synthesisng details...`);

    try {
      const response = await fetch('/api/barcode/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ barcode })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        const p = resData.product;
        setProdName(p.name);
        setProdDesc(`Ingredients: ${p.ingredients}. ${p.description}`);
        setProdPrice(p.price.toString());
        setProdStock('35'); // standard default starting stock
        
        // Auto-select beautiful themed imagery based on category
        const cat = (p.category || 'General').toLowerCase();
        let selectedUrl = "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=800"; // General Retail
        if (cat.includes('beverage') || cat.includes('coffee') || cat.includes('drink')) {
          selectedUrl = "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800"; // Coffee
        } else if (cat.includes('pastry') || cat.includes('croissant') || cat.includes('bakery') || cat.includes('cake') || cat.includes('cookie')) {
          selectedUrl = "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=800"; // Bakery
        } else if (cat.includes('apparel') || cat.includes('clothing') || cat.includes('jacket') || cat.includes('denim')) {
          selectedUrl = "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=800"; // Fashion/Denim
        } else if (cat.includes('accessories') || cat.includes('wallet') || cat.includes('leather')) {
          selectedUrl = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=800"; // Accessories
        } else if (cat.includes('beauty') || cat.includes('spa') || cat.includes('serum')) {
          selectedUrl = "https://images.unsplash.com/photo-1608248597481-496100c80836?q=80&w=800"; // Beauty Serum
        }
        setProdImage(selectedUrl);
        setProdSuccess(`Scanned successfully! Populated product "${p.name}" via Gemini auto-synthesis.`);
      } else {
        setProdError(resData.error || 'Failed to analyze barcode details.');
      }
    } catch (err) {
      setProdError('Network error during barcode detail synthesis.');
    } finally {
      setScannerLoading(false);
    }
  };

  // Add / Edit catalog items
  const handleAddCatalogProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdError(null);
    setProdSuccess(null);

    const storeIdToUse = currentUser.role === 'Master Admin' ? selectedCatalogStoreId : currentUser.storeId;

    if (!storeIdToUse || !prodName || !prodPrice || !prodStock) {
      setProdError('Missing mandatory catalog options.');
      return;
    }

    try {
      const method = editingProductId ? 'PUT' : 'POST';
      const endpoint = editingProductId ? `/api/products/${editingProductId}` : '/api/products';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storeId: storeIdToUse,
          name: prodName,
          description: prodDesc,
          price: Number(prodPrice),
          stock: Number(prodStock),
          imageUrl: prodImage,
          barcode: prodBarcode
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to compile catalog block.');
      }

      setProdSuccess(editingProductId ? 'Product details updated successfully!' : 'New product mapped to store catalog at strict base price.');
      setProdName('');
      setProdDesc('');
      setProdPrice('');
      setProdStock('');
      setProdImage('');
      setProdBarcode('');
      setEditingProductId(null);
      await fetchAllData();
    } catch (err: any) {
      setProdError(err.message || 'Error updating catalogue.');
    }
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setSelectedCatalogStoreId(p.storeId);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(String(p.price));
    setProdStock(String(p.stock));
    setProdImage(p.imageUrl || '');
    setProdBarcode(p.barcode || '');
    setProdError(null);
    setProdSuccess(null);
    // Scroll smoothly to input editor if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you absolutely sure you want to remove this catalog product permanently?')) return;
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProdSuccess('Product deleted successfully from inventory.');
        await fetchAllData();
      } else {
        setProdError(data.error || 'Product delete call rejected.');
      }
    } catch (err: any) {
      setProdError(err.message || 'Error deleting product.');
    }
  };

  // ========== POS SELLING PANEL ACTIONS & HANDLERS ==========
  const addPosItem = (product: Product, qty: number = 1) => {
    setPosCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + qty);
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: nextQty } : item);
      }
      return [...prev, { product, quantity: Math.min(product.stock, qty) }];
    });
  };

  const updatePosCartQuantity = (productId: string, delta: number) => {
    setPosCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const nextQty = Math.max(0, Math.min(item.product.stock, item.quantity + delta));
        return { ...item, quantity: nextQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removePosCartItem = (productId: string) => {
    setPosCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleSendAdminChatMessage = async (e: React.FormEvent, order: Order) => {
    e.preventDefault();
    if (!adminChatText.trim()) return;

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: order.storeId,
          senderId: order.customerId,
          senderName: `${currentUser.username} (${currentUser.role})`,
          senderRole: currentUser.role,
          text: adminChatText
        })
      });

      if (response.ok) {
        setAdminChatText('');
        syncOrderChatThread(order.id);
      }
    } catch (err) {
      console.error('Core send message failed', err);
    }
  };

  const handleDirectBarcodeScan = (code: string) => {
    setPosError(null);
    setPosSuccess(null);
    
    const storeIdToUse = currentUser.role === 'Master Admin' ? selectedCatalogStoreId : currentUser.storeId;
    if (!storeIdToUse) {
      setPosError('No active storefront bound to your staff account.');
      return;
    }

    const matched = products.find(p => p.storeId === storeIdToUse && p.barcode === code);
    if (matched) {
      if (matched.stock <= 0) {
        setPosError(`"${matched.name}" matches barcode [${code}] but is completely out of stock!`);
        return;
      }
      addPosItem(matched, 1);
      setPosSuccess(`Successfully added scanned item: "${matched.name}"`);
      setPosBarcodeIn('');
    } else {
      setPosError(`Unassigned Barcode: No product with barcode "${code}" exists for this store.`);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = posBarcodeIn.trim();
    if (!code) return;
    handleDirectBarcodeScan(code);
  };

  const handlePosCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosError(null);
    setPosSuccess(null);

    if (posCart.length === 0) {
      setPosError('The POS sell basket is empty.');
      return;
    }

    const storeIdToUse = currentUser.role === 'Master Admin' ? selectedCatalogStoreId : currentUser.storeId;
    if (!storeIdToUse) {
      setPosError('No storefront selected.');
      return;
    }

    const items = posCart.map(it => ({
      productId: it.product.id,
      name: it.product.name,
      price: it.product.price,
      quantity: it.quantity
    }));

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storeId: storeIdToUse,
          customerId: 'pos-' + Date.now(),
          customerName: 'Walk-in Customer (POS)',
          customerPhone: 'Walk-in',
          type: 'Pickup',
          timeSlot: 'Instant Sell (Completed)',
          items
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Enterprise queue error.');
      }

      // Automatically transition order to 'Completed' status
      if (data.order && data.order.id) {
        const statusRes = await fetch(`/api/orders/${data.order.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'Completed' })
        });
        if (!statusRes.ok) {
          console.warn('Failed automated finality status.');
        }
      }

      setPosSuccess('POS Sale Completed! Digital receipt generated, stock deduction updated.');
      setPosCart([]);
      setPosSearch('');
      await fetchAllData();
    } catch (err: any) {
      setPosError(err.message || 'Transaction error.');
    }
  };

  // Export registered user database backup as JSON
  const handleExportUserBackup = async () => {
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const res = await fetch('/api/admin/users/backup/export', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error('Could not download complete user registry backup');
      }
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `user_registry_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setBackupSuccess('Exported complete user registration registry securely to JSON backup file!');
    } catch (err: any) {
      setBackupError(err.message || 'Error occurred during user database backup extraction');
    }
  };

  // Upload & restore user database backup from JSON file input
  const handleImportUserBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError(null);
    setBackupSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          if (!parsed || !parsed.users) {
            throw new Error('Invalid database backup structure. Make sure "users" key exists.');
          }

          const response = await fetch('/api/admin/users/backup/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(parsed)
          });
          
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'Server rejected full account restore request');
          }

          setBackupSuccess(result.message || 'Restored all account mappings successfully! All registered users can login now.');
          await fetchAllData();
        } catch (innerErr: any) {
          setBackupError(innerErr.message || 'JSON parse discrepancy error');
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      setBackupError(err.message || 'Fail reading target backup upload');
    } finally {
      // Clear file inputs
      if (e.target) e.target.value = '';
    }
  };

  // Export visible/filtered orders queue to a beautifully formatted Excel-compatible CSV file
  const handleExportOrdersCSV = () => {
    try {
      // Find orders visible under the active subtab filter
      const belongsToStore = (o: Order) => currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId;
      const filtered = orders.filter((o) => {
        if (!belongsToStore(o)) return false;
        if (ordersFilterSubTab === 'all') {
          return o.status !== 'Completed' && o.status !== 'Cancelled';
        } else if (ordersFilterSubTab === 'completed') {
          if (o.status !== 'Completed') return false;
          if (!o.completedAt) return true;
          return Date.now() - new Date(o.completedAt).getTime() < 24 * 60 * 60 * 1000;
        } else {
          return o.status === 'Cancelled';
        }
      });

      if (filtered.length === 0) {
        alert('No orders in the current queue to export.');
        return;
      }

      // Headers column mapping
      const headers = ['Order ID', 'Store ID', 'Customer Name', 'Customer Phone', 'Type', 'Time Slot', 'Address', 'Status', 'Total Price (€)', 'Created Date', 'Purchased Items'];
      const rows = filtered.map(o => {
        const itemSummaries = o.items.map(item => `${item.name} (x${item.quantity} - €${item.price.toFixed(2)})`).join(' | ');
        return [
          o.id,
          o.storeId,
          `"${o.customerName?.replace(/"/g, '""')}"`,
          `="${o.customerPhone}"`, // Prevent phone number truncation in Excel
          o.type,
          o.timeSlot,
          `"${(o.deliveryAddress || '').replace(/"/g, '""')}"`,
          o.status,
          o.totalPrice.toFixed(2),
          o.createdAt,
          `"${itemSummaries.replace(/"/g, '""')}"`
        ];
      });

      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // Include UTF-8 BOM
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `store_orders_export_${ordersFilterSubTab}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed generating orders export', err);
    }
  };

  // Export own store catalog products to a formatted zip file with CSV and detailed JSON
  const handleExportProductsZIP = async () => {
    try {
      // Find the store ID scope
      const activeStoreId = currentUser.role === 'Master Admin' ? (selectedCatalogStoreId || 'all') : currentUser.storeId;
      if (!activeStoreId) {
        alert('Please select or map a store branch to compile product data files.');
        return;
      }

      const filteredProds = products.filter(p => activeStoreId === 'all' || p.storeId === activeStoreId);
      if (filteredProds.length === 0) {
        alert('No catalog products loaded for this branch selection.');
        return;
      }

      const zip = new JSZip();
      
      // 1. Create product spreadsheet CSV representation
      const headers = ['Product ID', 'Store ID', 'Product Name', 'Description', 'Price (€)', 'Stock Count', 'Barcode SKU', 'Category', 'Ingredients'];
      const rows = filteredProds.map(p => [
        p.id,
        p.storeId,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.description.replace(/"/g, '""')}"`,
        p.price.toFixed(2),
        p.stock,
        p.barcode || '',
        p.category || 'General',
        `"${(p.ingredients || '').replace(/"/g, '""')}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      zip.file('products_catalog.csv', csvContent);

      // 2. Create structured detailed JSON representation
      zip.file('products_catalog.json', JSON.stringify(filteredProds, null, 2));

      // 3. Create descriptive manifest information file
      const selectedStoreObj = stores.find(s => s.id === activeStoreId);
      const storeName = selectedStoreObj ? selectedStoreObj.name : `Aggregate Stores Backup`;
      const readme = `SUPERSTORE PLATFORM DATA EXPORT MANIFEST
===========================================
Store Branch Scope: ${storeName} (UID: ${activeStoreId})
Exported Timestamp: ${new Date().toLocaleString()}
Records Compiled: ${filteredProds.length} rows loaded successfully

Files compiled:
- products_catalog.csv: Raw spreadsheet representation matching POS lookup index.
- products_catalog.json: Nested REST JSON properties for developer migration import structures.

This database package contains valid registered stock lists. Feel free to re-upload as necessary.`;
      zip.file('readme_manifest.txt', readme);

      // 4. Fire compression and invoke client download prompt
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_backup_${activeStoreId}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Could not compile catalog ZIP', err);
      alert('Failed assembling ZIP compression packages: ' + err.message);
    }
  };

  // Moderate Store Owner signup requests
  const handleApproveOwner = async (userId: string, approve: boolean) => {
    // Role Store Owner approval toggles
    await handleMapUser(userId, undefined, 'Store Owner', approve);
  };

  // Handle Order status switches
  const handleOrderStatusOverride = async (orderId: string, status: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTimingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timingStoreId) return;

    setTimingLoading(true);
    setTimingMsg(null);

    try {
      const response = await fetch(`/api/stores/${timingStoreId}/times`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ openingTime, closingTime })
      });

      const resData = await response.json();
      if (response.ok) {
        setTimingMsg({ type: 'success', text: resData.message || 'Store operating hours updated successfully!' });
        
        setStores((prevStores) =>
          prevStores.map((st) =>
            st.id === timingStoreId ? { ...st, openingTime, closingTime } : st
          )
        );
      } else {
        setTimingMsg({ type: 'error', text: resData.error || 'Failed to update store hours.' });
      }
    } catch (err) {
      setTimingMsg({ type: 'error', text: 'Network communication failure.' });
    } finally {
      setTimingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  // Filter list of users needing Store Owner signups approval
  const pendingOwners = users.filter(u => u.role === 'Store Owner' && !u.approved);

  return (
    <div className="space-y-6">
      {/* Absolute Admin Control Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 text-left">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-yellow-500 flex items-center justify-center text-slate-950 font-black shadow-lg">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-white text-lg">
              Master Admin Control Suite
            </h3>
            <p className="text-xs text-slate-400">
              Generate independent layouts • Bind staff workplaces • Update map telemetry and catalog assets.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Workplace Scope Locked Control</p>
          <p className="text-xs font-semibold text-yellow-500 font-mono uppercase">{currentUser.role === 'Master Admin' ? 'Master Authority Area' : 'Local Workspace Area'}</p>
        </div>
      </div>

      {/* Operating Hours Timing System (Master Admin, Store Owner, Store Staff) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-sans font-bold text-white text-sm uppercase">Store Operations Timing Manager</h4>
              <p className="text-[11px] text-slate-400">Master Admins, Owners, and Duty Staff can modify open & close timeframes dynamically.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/20">
            Secure Hours Dashboard
          </span>
        </div>

        {timingMsg && (
          <div className={`p-3 rounded-xl text-xs font-mono border ${
            timingMsg.type === 'success' ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/5 text-rose-400 border-rose-500/20'
          }`}>
            {timingMsg.text}
          </div>
        )}

        <form onSubmit={handleTimingSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {currentUser.role === 'Master Admin' ? (
            <div className="md:col-span-4 space-y-1 block text-left">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Select Target Outlet *</label>
              <select
                value={timingStoreId}
                onChange={(e) => setTimingStoreId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-lg h-9 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 cursor-pointer"
              >
                <option value="">[Select Store]</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-4 space-y-1 block text-left">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Your Assigned Outlet</label>
              <div className="bg-slate-950/60 border border-slate-850 h-9 px-3 flex items-center text-xs text-slate-350 font-bold rounded-lg font-mono">
                {stores.find(s => s.id === timingStoreId)?.name || 'Initializing...'}
              </div>
            </div>
          )}

          <div className="md:col-span-3 space-y-1 block text-left">
            <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Opening Time (24h) *</label>
            <input
              type="time"
              required
              value={openingTime}
              onChange={(e) => setOpeningTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 cursor-pointer font-mono"
            />
          </div>

          <div className="md:col-span-3 space-y-1 block text-left">
            <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Closing Time (24h) *</label>
            <input
              type="time"
              required
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 cursor-pointer font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={timingLoading || !timingStoreId}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black h-9 rounded-lg text-xs tracking-wider uppercase transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              {timingLoading ? 'Saving...' : 'SAVE HOURS'}
            </button>
          </div>
        </form>
      </div>

      {/* Dynamic contents switcher */}
      <div className="space-y-6">
        {/* ========== POS SELLING PANEL TAB ========== */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
            
            {/* Left columns: Scanners & Name query searches */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Box 1: Simulated Laser Barcode Scanner */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center gap-2">
                    <Barcode className="w-5 h-5 text-yellow-500" />
                    Simulated Laser Barcode Scanner
                  </h4>
                  <span className="text-[9px] font-mono font-bold tracking-widest text-emerald-400 bg-emerald-950/45 px-2 py-0.5 rounded border border-emerald-800/30">
                    SCANNER READY
                  </span>
                </div>

                {posError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-lg font-mono">
                    ⚠ {posError}
                  </div>
                )}
                {posSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3.5 rounded-lg font-mono">
                    ✓ {posSuccess}
                  </div>
                )}

                <form onSubmit={handleBarcodeSubmit} className="space-y-3">
                  <p className="text-xs text-slate-400 font-mono">
                    To simulate a physical barcode scan, type a barcode below or tap any of the quick-scan badges.
                  </p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type barcode (e.g. 800111 or 800222) or scan input..."
                      value={posBarcodeIn}
                      onChange={(e) => setPosBarcodeIn(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 focus:border-yellow-500 rounded-lg h-12 px-4 text-xs text-slate-200 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPosScannerOpen(true)}
                      className="px-4.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-755 rounded-lg h-12 flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0"
                      title="Open Scanner Camera"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                    <button
                      type="submit"
                      className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 text-xs px-5 h-12 rounded-lg font-bold uppercase shrink-0 transition-all cursor-pointer"
                    >
                      Scan Barcode
                    </button>
                  </div>
                </form>

                {/* Quick Simulation Help bar */}
                <div className="pt-2">
                  <span className="text-[10px] font-bold text-slate-500 font-mono uppercase block mb-1 font-sans">Simulated Barcodes for this Outlet:</span>
                  <div className="flex flex-wrap gap-2">
                    {products
                      .filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId)
                      .filter(p => p.barcode)
                      .slice(0, 6)
                      .map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPosBarcodeIn(p.barcode || '');
                            // Trigger immediately
                            setTimeout(() => {
                              setPosError(null);
                              setPosSuccess(null);
                              if (p.stock <= 0) {
                                setPosError(`"${p.name}" is completely out of stock!`);
                                return;
                              }
                              addPosItem(p, 1);
                              setPosSuccess(`Scanned Quick-Code "${p.barcode}" -> added "${p.name}" to tray.`);
                              setPosBarcodeIn('');
                            }, 50);
                          }}
                          className="bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-yellow-500/50 p-2 rounded-lg text-left text-xs transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-bold text-slate-300 leading-none">{p.name}</p>
                            <span className="font-mono text-[9px] text-yellow-500">Code: {p.barcode}</span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Box 2: Search catalog by name */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Search className="w-5 h-5 text-yellow-500" />
                  No Barcode? Search catalog by name
                </h4>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Search products by typing name here... (case-insensitive)"
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-500 rounded-lg h-11 px-4 text-xs text-slate-200 outline-none"
                  />

                  {/* Autocomplete or filtered matching products list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {products
                      .filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId)
                      .filter(p => !posSearch ? true : p.name.toLowerCase().includes(posSearch.toLowerCase()))
                      .map(p => (
                        <div key={p.id} className="bg-slate-950 border border-slate-850 p-2 rounded-xl flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-2 min-w-0">
                            <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded bg-slate-900" />
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-white truncate leading-none">{p.name}</p>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Price: €{p.price.toFixed(2)} • Stock: {p.stock}</span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              if (p.stock <= 0) {
                                setPosError(`"${p.name}" is completely out of stock!`);
                                return;
                              }
                              addPosItem(p, 1);
                              setPosSuccess(`Added matching item: "${p.name}"`);
                            }}
                            className="bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-black text-[10px] py-1.5 px-3 rounded uppercase cursor-pointer transition-all"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: Cart tray & complete sale */}
            <div className="lg:col-span-1">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 h-fit sticky top-20">
                <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center justify-between border-b border-slate-800 pb-3 font-display">
                  <span>🛍 POS Checkout basket</span>
                  <span className="font-mono text-xs bg-slate-950 px-2.5 py-0.5 rounded text-yellow-500 border border-white/5 font-bold">
                    {posCart.reduce((sum, item) => sum + item.quantity, 0)} Units
                  </span>
                </h4>

                {posCart.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 italic">
                    POS basket is empty.<br />Scan a barcode or click a product to initialize sale transaction.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {posCart.map(row => (
                        <div key={row.product.id} className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between gap-3 text-left">
                          <div className="min-w-0 flex-1 text-left">
                            <p className="text-xs font-bold text-white truncate">{row.product.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">€{row.product.price.toFixed(2)} / unit</p>
                            <p className="text-[11px] font-mono font-bold text-yellow-500">€{(row.product.price * row.quantity).toFixed(2)}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border">
                              <button
                                onClick={() => updatePosCartQuantity(row.product.id, -1)}
                                className="w-5 h-5 bg-slate-950 hover:bg-slate-800 rounded text-slate-400 font-bold flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono text-white font-bold px-1 min-w-[15px] text-center">
                                {row.quantity}
                              </span>
                              <button
                                onClick={() => updatePosCartQuantity(row.product.id, 1)}
                                className="w-5 h-5 bg-slate-950 hover:bg-slate-800 rounded text-slate-400 font-bold flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              onClick={() => removePosCartItem(row.product.id)}
                              className="p-1 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-slate-800 pt-3 space-y-2">
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <p>Subtotal Cost:</p>
                        <p className="font-mono text-slate-300">
                          €{posCart.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <p>Sales Tax (V.A.T. 22% inclusive):</p>
                        <p className="font-mono text-slate-300">
                          €{(posCart.reduce((sum, idx) => sum + idx.product.price * idx.quantity, 0) * 0.22).toFixed(2)}
                        </p>
                      </div>
                      <div className="border-t border-slate-850 pt-2 flex justify-between items-center">
                        <h4 className="text-xs font-bold text-white uppercase">Gross Total Payable:</h4>
                        <span className="text-md font-mono font-black text-yellow-500">
                          €{posCart.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <form onSubmit={handlePosCheckout}>
                      <button
                        type="submit"
                        className="w-full bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-black h-12 rounded-xl text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Finalize Walk-in Sale (Receipt)
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        )}

        {/* STORES PROVISIONING */}
        {activeTab === 'stores' && currentUser.role === 'Master Admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
            {/* Create form */}
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl h-fit">
              <h4 className="font-sans font-bold text-white text-md border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-yellow-500" />
                {editingStoreId ? 'Modify Store Properties' : 'Provision Flagship Store'}
              </h4>

              {storeFormError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                  {storeFormError}
                </div>
              )}
              {storeFormSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                  {storeFormSuccess}
                </div>
              )}

              <form onSubmit={handleCreateStore} className="space-y-4">
                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Shop Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rome Central Café"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Description Detail *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Charming coffee and pastry spot..."
                    value={storeDesc}
                    onChange={(e) => setStoreDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Exact Address * (Integrated Maps Link)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Piazza Navona 4, Rome"
                    value={storeAddr}
                    onChange={(e) => setStoreAddr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Store Contact Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +39 06 123456"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 block">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Shop Photo (S3 StoragePut buffer)*</span>
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      type="text"
                      placeholder="Custom link or upload"
                      value={storePhoto}
                      onChange={(e) => setStorePhoto(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                    />
                    <label className="bg-slate-800 hover:bg-slate-700 h-10 px-3.5 flex items-center justify-center shrink-0 border border-slate-700 rounded-lg text-xs cursor-pointer text-slate-300">
                      <UploadCloud className="w-4 h-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e, 'store')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploadingImage}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold h-10 rounded-lg text-xs tracking-wider uppercase transition-all shadow-md cursor-pointer"
                >
                  {uploadingImage ? 'Buffer Uploading...' : (editingStoreId ? 'Apply New Changes' : 'Initialize Active Store')}
                </button>

                {editingStoreId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStoreId(null);
                      setStoreName('');
                      setStoreDesc('');
                      setStoreAddr('');
                      setStorePhone('');
                      setStorePhoto('');
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-755 text-slate-300 h-10 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Cancel Editing
                  </button>
                )}
              </form>
            </div>

            {/* Configured stores grid list */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <h4 className="font-sans font-bold text-white text-md border-b border-slate-800 pb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <StoreIcon className="w-4 h-4 text-yellow-500" />
                  Active Stores List ({stores.length})
                </span>
                {currentUser.role === 'Master Admin' && stores.length > 0 && (
                  <span className="text-[10px] font-mono text-slate-400">
                    Selection supported
                  </span>
                )}
              </h4>

              {shareSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold flex items-center justify-between">
                  <span>{shareSuccess}</span>
                  <button onClick={() => setShareSuccess(null)} className="text-slate-400 hover:text-white cursor-pointer select-none px-1">✕</button>
                </div>
              )}

              {currentUser.role === 'Master Admin' && stores.length > 0 && (
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-left">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedStoreIds.length === stores.length) {
                          setSelectedStoreIds([]);
                        } else {
                          setSelectedStoreIds(stores.map(s => s.id));
                        }
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-705 transition cursor-pointer font-semibold"
                    >
                      {selectedStoreIds.length === stores.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-slate-400 font-mono">
                      Selected: <strong className="text-yellow-500">{selectedStoreIds.length}</strong> of {stores.length}
                    </span>
                  </div>
                  {selectedStoreIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkDeleteStores}
                      className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow cursor-pointer text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected ({selectedStoreIds.length})
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stores.map((s) => (
                  <div key={s.id} className="bg-slate-950/80 border border-slate-850 rounded-xl overflow-hidden shadow-md flex flex-col justify-between">
                    <div className="aspect-video w-full relative bg-slate-900 animate-fade-in">
                      <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur px-2.5 py-0.5 rounded text-[10px] font-mono font-bold text-yellow-500 border border-white/5">
                        {`/store/${s.slug}`}
                      </div>
                      {currentUser.role === 'Master Admin' && (
                        <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur p-1.5 rounded-lg border border-white/10 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedStoreIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStoreIds(prev => [...prev, s.id]);
                              } else {
                                setSelectedStoreIds(prev => prev.filter(id => id !== s.id));
                              }
                            }}
                            className="w-4 h-4 rounded text-yellow-500 bg-slate-900 border-slate-700 focus:ring-yellow-500 cursor-pointer accent-yellow-500"
                          />
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2 text-left">
                      <h5 className="font-sans font-black text-white text-md tracking-tight leading-none">{s.name}</h5>
                      <p className="subtitle-desc text-slate-400 text-xs truncate leading-normal">{s.description}</p>
                      
                      <div className="space-y-1 text-[11px] font-mono text-slate-400 mt-2">
                        <p className="flex items-center gap-1.5 leading-normal">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <a href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer" className="text-yellow-500 underline truncate hover:text-yellow-400">
                            {s.address}
                          </a>
                        </p>
                        <p className="flex items-center gap-1.5 leading-normal">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          {s.phone}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/40 border-t border-slate-850 flex justify-end gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleShareStore(s)}
                        className="bg-sky-500/10 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        title="Copy unique URL for store login/view details"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l4.622-2.311m0 0a3 3 0 10-2.671-3.672L6.152 7.07a3 3 0 100 3.86l4.483 2.241a3 3 0 11-2.485 3.565" />
                        </svg>
                        Share
                      </button>
                      <button
                        onClick={() => startEditStore(s)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Edit className="w-3 h-3 text-yellow-500" />
                        Modify
                      </button>
                      <button
                        onClick={() => handleDeleteStore(s.id)}
                        className="bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/35 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        title="Delete Store and products"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE STAFF ACCESS CONTROLS MATRIX */}
        {activeTab === 'users' && currentUser.role === 'Master Admin' && (
          <div className="space-y-6 text-left">
            {/* Owner Signup Approval Column */}
            {pendingOwners.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <h4 className="font-sans font-bold text-white text-md border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span>🔑 SIGNUP REQUESTS: STORE OWNERS ({pendingOwners.length})</span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest bg-slate-950 px-2 py-0.5 border border-white/5 rounded">Needs Approval</span>
                </h4>

                <div className="space-y-3">
                  {pendingOwners.map((p) => (
                    <div key={p.id} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img src={p.avatar} alt={p.username} className="w-10 h-10 rounded-full bg-slate-800 border" />
                        <div>
                          <p className="font-bold text-white">{p.username}</p>
                          <p className="text-xs text-slate-400">{p.email} • Tel: {p.phone} • {p.gender === 'Woman' ? '♀ Woman' : '♂ Man'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveOwner(p.id, false)}
                          className="bg-red-950 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-900/40 transition-colors"
                        >
                          Deny Link
                        </button>
                        <button
                          onClick={() => handleApproveOwner(p.id, true)}
                          className="bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                        >
                          Approve Owner
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Segmented Users Control Panel Directory */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
              {/* Backup status alerts */}
              {(backupError || backupSuccess) && (
                <div className="text-xs font-sans transition-all">
                  {backupError && (
                    <div className="bg-red-950/40 border border-red-950 text-red-400 p-3.5 rounded-xl flex items-center justify-between">
                      <span className="font-medium">⚠️ Error: {backupError}</span>
                      <button onClick={() => setBackupError(null)} className="text-red-400 hover:text-white ml-2 font-bold cursor-pointer text-sm">✕</button>
                    </div>
                  )}
                  {backupSuccess && (
                    <div className="bg-emerald-950/40 border border-emerald-950 text-emerald-400 p-3.5 rounded-xl flex items-center justify-between">
                      <span className="font-medium">✨ Success: {backupSuccess}</span>
                      <button onClick={() => setBackupSuccess(null)} className="text-emerald-400 hover:text-white ml-2 font-bold cursor-pointer text-sm">✕</button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-800 pb-4 gap-4">
                <div>
                  <h4 className="font-sans font-bold text-white text-md">
                    System Directory Master Control
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">Manage, approve, and fully override credential details of store owners, staff, and registered customer groups.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Backup / Restore Controls */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 items-center">
                    <button
                      onClick={handleExportUserBackup}
                      className="bg-indigo-600/10 hover:bg-indigo-600 hover:text-white border border-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      title="Download complete registry & login credentials backup file (.json)"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Export Accounts</span>
                    </button>
                    <label
                      className="bg-emerald-600/10 hover:bg-emerald-600 hover:text-white border border-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      title="Import complete registry login credentials backup file (.json) to merge"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Import Restore</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportUserBackup}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Sub Tab segmentation switcher button array */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 w-fit">
                  <button
                    onClick={() => setUsersSubTab('staff')}
                    className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      usersSubTab === 'staff' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    💼 Store Owners & Staff
                  </button>
                  <button
                    onClick={() => setUsersSubTab('customer')}
                    className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      usersSubTab === 'customer' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    👥 Registered Customers
                  </button>
                </div>
              </div>
            </div>

              {/* Email lookup search container bar */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="🔍 Search users directory by email address..."
                    value={userSearchEmail}
                    onChange={(e) => setUserSearchEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-yellow-500 rounded-xl h-10 pl-10 pr-4 text-xs text-slate-200 outline-none transition-all"
                  />
                </div>

                {/* Bulk delete controls for users */}
                {(() => {
                  const visibleUsers = users.filter((u) => {
                    if (u.role === 'Master Admin') return false;
                    const emailInput = userSearchEmail.toLowerCase().trim();
                    if (emailInput && !u.email.toLowerCase().includes(emailInput)) {
                      return false;
                    }
                    const isStaff = u.role !== 'Customer';
                    return usersSubTab === 'staff' ? isStaff : !isStaff;
                  });

                  if (visibleUsers.length > 0 && selectedUserIds.length > 0) {
                    return (
                      <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-left animate-fade-in">
                        <span className="text-slate-400 font-mono">
                          Selected accounts: <strong className="text-yellow-500">{selectedUserIds.length}</strong> user(s) selected for bulk delete.
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedUserIds([])}
                            className="bg-slate-800 hover:bg-slate-755 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer font-bold transition"
                          >
                            Deselect
                          </button>
                          <button
                            type="button"
                            onClick={handleBulkDeleteUsers}
                            className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Selected ({selectedUserIds.length})
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Users table registry container */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3 w-10">
                        {(() => {
                          const visibleUsers = users.filter((u) => {
                            if (u.role === 'Master Admin') return false;
                            const emailInput = userSearchEmail.toLowerCase().trim();
                            if (emailInput && !u.email.toLowerCase().includes(emailInput)) {
                              return false;
                            }
                            const isStaff = u.role !== 'Customer';
                            return usersSubTab === 'staff' ? isStaff : !isStaff;
                          });

                          const selectableUsers = visibleUsers.filter(u => u.id !== currentUser.id && u.id !== 'admin-hasib');

                          return (
                            <input
                              type="checkbox"
                              checked={selectableUsers.length > 0 && selectableUsers.every(u => selectedUserIds.includes(u.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds(prev => {
                                    const next = new Set([...prev, ...selectableUsers.map(u => u.id)]);
                                    return Array.from(next);
                                  });
                                } else {
                                  setSelectedUserIds(prev => prev.filter(id => !selectableUsers.some(su => su.id === id)));
                                }
                              }}
                              className="w-4 h-4 rounded text-yellow-500 bg-slate-900 border-slate-700 cursor-pointer accent-yellow-500"
                            />
                          );
                        })()}
                      </th>
                      <th className="py-3 px-3">Profile Identity</th>
                      <th className="py-3 px-3">Gender / Tel</th>
                      <th className="py-3 px-3">Role Type</th>
                      <th className="py-3 px-3">Assigned Location Context</th>
                      <th className="py-3 px-3 text-right">Administrative Action Overrides</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users
                      .filter((u) => {
                        if (u.role === 'Master Admin') return false;
                        
                        // Email search filtering (case intensive check)
                        const emailInput = userSearchEmail.toLowerCase().trim();
                        if (emailInput && !u.email.toLowerCase().includes(emailInput)) {
                          return false;
                        }

                        // Sub tab separation logic
                        const isStaff = u.role !== 'Customer';
                        return usersSubTab === 'staff' ? isStaff : !isStaff;
                      })
                      .map((u) => (
                        <tr key={u.id} className="hover:bg-slate-950/25 transition-colors">
                          <td className="py-3.5 px-3">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              disabled={u.id === currentUser.id}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds(prev => [...prev, u.id]);
                                } else {
                                  setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                                }
                              }}
                              className="w-4 h-4 rounded text-yellow-500 bg-slate-900 border-slate-700 cursor-pointer accent-yellow-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <img src={u.avatar} alt={u.username} className="w-9 h-9 rounded-full object-cover border border-slate-800 bg-slate-950" referrerPolicy="no-referrer" />
                              <div>
                                <p className="font-bold text-slate-100 flex items-center gap-1.5">
                                  <span>{u.username}</span>
                                  {u.id === currentUser.id && (
                                    <span className="bg-slate-950 text-indigo-400 text-[8px] uppercase tracking-wider font-mono border border-indigo-900 px-1 py-0.2 rounded font-bold">You</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono tracking-wide">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <p className="font-bold text-slate-300 text-[11px]">
                              {u.gender === 'Woman' ? '♀ Woman' : '♂ Man'}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">{u.phone || 'No phone recorded'}</p>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="bg-slate-950 text-slate-350 border border-slate-800 text-[10px] uppercase font-bold font-mono py-1 px-2.5 rounded-lg">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            {usersSubTab === 'staff' ? (
                              <div className="space-y-1">
                                {u.storeId ? (
                                  <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/15 font-bold px-2 py-0.5 rounded text-[10px] font-mono block w-fit">
                                    {stores.find(s => s.id === u.storeId)?.name || u.storeId}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic text-[10px] block">No store context bound</span>
                                )}
                                
                                <div className="flex items-center gap-1">
                                  <select
                                    value={u.storeId || ''}
                                    onChange={(e) => handleMapUser(u.id, e.target.value || null, u.role)}
                                    className="bg-slate-950 border border-slate-850 hover:border-slate-800 transition-colors rounded text-[9px] h-7 px-1.5 outline-none font-sans text-slate-400"
                                  >
                                    <option value="">[Not Assigned]</option>
                                    {stores.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>

                                  <select
                                    value={u.role}
                                    onChange={(e) => handleMapUser(u.id, u.storeId || null, e.target.value)}
                                    className="bg-slate-950 border border-slate-850 hover:border-slate-800 transition-colors rounded text-[9px] h-7 px-1.5 outline-none font-sans text-slate-400"
                                  >
                                    <option value="Customer">Customer</option>
                                    <option value="Store Staff">Store Staff</option>
                                    <option value="Admin">Local Admin</option>
                                    <option value="Store Owner">Store Owner</option>
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] font-mono italic max-w-[150px] truncate block" title={u.deliveryLocation}>
                                {u.deliveryLocation || 'No physical address supplied'}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => handleEditUserClick(u)}
                                className="bg-slate-950 text-yellow-500 hover:text-slate-950 hover:bg-yellow-500 border border-yellow-500/15 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 justify-center cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Modify</span>
                              </button>
                              {u.id !== currentUser.id && u.id !== 'admin-hasib' && (
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 border border-rose-500/20 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 justify-center cursor-pointer"
                                  title="Delete User permanently"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    
                    {users.filter((u) => {
                      if (u.role === 'Master Admin') return false;
                      const emailInput = userSearchEmail.toLowerCase().trim();
                      if (emailInput && !u.email.toLowerCase().includes(emailInput)) return false;
                      const isStaff = u.role !== 'Customer';
                      return usersSubTab === 'staff' ? isStaff : !isStaff;
                    }).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center italic text-slate-500">
                          No customized record lists found in registry matching filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* CATALOG CRUD AND BASE PRICES */}
        {activeTab === 'catalog' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
            {/* Catalog Add / Edit form */}
            {(currentUser.role === 'Master Admin' || currentUser.role === 'Store Owner' || currentUser.role === 'Admin' || currentUser.role === 'Store Staff') && (
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 h-fit shadow-xl">
                <h4 className="font-sans font-bold text-white text-md border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-yellow-500" />
                  {editingProductId ? 'Modify Catalogue Product' : 'Catalogue Mapped Product'}
                </h4>

                {prodError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                    {prodError}
                  </div>
                )}
                {prodSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                    {prodSuccess}
                  </div>
                )}

                <form onSubmit={handleAddCatalogProduct} className="space-y-4">
                  <div className="space-y-1 block">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Target Store Catalog Outlet *</label>
                    {currentUser.role === 'Master Admin' ? (
                      <select
                        value={selectedCatalogStoreId}
                        onChange={(e) => setSelectedCatalogStoreId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none"
                      >
                        <option value="">[Select active store]</option>
                        {stores.map((s) => (
                           <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="bg-slate-950 border border-slate-850 p-2.5 px-3 text-xs text-slate-300 rounded-lg font-bold font-mono">
                        {stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeId}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 block">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Product Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Classic Tiramisu"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div className="space-y-1 block text-left">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Unique Barcode / Universal UPC *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="e.g. 800111 or 900333"
                        value={prodBarcode}
                        onChange={(e) => setProdBarcode(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setIsCatalogScannerOpen(true)}
                        className="px-4.5 bg-yellow-500 hover:bg-yellow-600 hover:scale-105 active:scale-95 text-slate-950 rounded-lg text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer h-10 shadow-md shrink-0"
                        title="Open Camera Scanner"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 block">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Description Detail</label>
                    <input
                      type="text"
                      placeholder="e.g. Traditional sheep milk ricotta pastries..."
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 block text-left">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Base Price (€) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 5.50"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1 block text-left">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Stock Units *</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 50"
                        value={prodStock}
                        onChange={(e) => setProdStock(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 block">
                    <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Product Photo (S3 storagePut buffer)</span>
                    <div className="flex gap-2 items-center mt-1">
                      <input
                        type="text"
                        placeholder="Custom link or upload"
                        value={prodImage}
                        onChange={(e) => setProdImage(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                      />
                      <label className="bg-slate-800 hover:bg-slate-700 h-10 px-3.5 flex items-center justify-center shrink-0 border border-slate-700 rounded-lg text-xs cursor-pointer text-slate-300">
                        <UploadCloud className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, 'prod')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingImage}
                    className="w-full bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-bold h-10 rounded-lg text-xs tracking-wider uppercase transition-all shadow-md cursor-pointer"
                  >
                    {uploadingImage ? 'Uploading image...' : (editingProductId ? 'Apply Product Update' : 'Map Catalog Item')}
                  </button>

                  {editingProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId(null);
                        setProdName('');
                        setProdDesc('');
                        setProdPrice('');
                        setProdStock('');
                        setProdImage('');
                        setProdBarcode('');
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 h-10 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Cancel Editing
                    </button>
                  )}
                </form>
              </div>
            )}

            {/* Catalog inventory list */}
            <div className={`graphics-view bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 ${(currentUser.role === 'Master Admin' || currentUser.role === 'Store Owner' || currentUser.role === 'Admin' || currentUser.role === 'Store Staff') ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="font-sans font-bold text-white text-md">
                  Live Enterprise Stock Catalog
                </h4>
                {(currentUser.role === 'Master Admin' || currentUser.role === 'Store Owner' || currentUser.role === 'Admin' || currentUser.role === 'Store Staff') && (
                  <button
                    onClick={handleExportProductsZIP}
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/15 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="Compress and download all products of this store branch as a ZIP containing CSV and detailed JSON definitions"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Download own store zip</span>
                  </button>
                )}
              </div>

              {/* Stock Threshold Control Panel */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-sans font-medium">⚠️ Low Stock Alert Limit:</span>
                  <input
                    type="number"
                    min="0"
                    value={lowStockThreshold}
                    onChange={(e) => updateLowStockThreshold(parseInt(e.target.value, 10))}
                    className="w-16 bg-slate-905 border border-slate-700/60 rounded px-2.5 py-1 text-center font-bold text-yellow-500 font-mono outline-hidden focus:border-yellow-500 text-xs"
                    title="Define custom limit for low-stock visual notifications"
                  />
                  <span className="text-slate-450 text-[11px] font-mono">pcs or less</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  {products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId).filter(p => p.stock < lowStockThreshold).length > 0 ? (
                    <span className="bg-rose-500/10 text-rose-400 border border-rose-550/30 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide animate-pulse flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      {products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId).filter(p => p.stock < lowStockThreshold).length} Low Stock Alert(s)
                    </span>
                  ) : (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-550/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                      ✓ All Stocks Optimum
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic visual warning summary notification banner */}
              {products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId).filter(p => p.stock < lowStockThreshold).length > 0 && (
                <div className="bg-amber-950/20 border border-amber-900/40 p-3.5 rounded-xl text-left border-l-4 border-l-amber-500">
                  <p className="text-[11px] font-sans font-extrabold text-amber-400 flex items-center gap-1.5">
                    <span>⚠️ LIVE LOW STOCK ADVISORY REPORT</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed font-sans">
                    Attention Store Operators / Admins: The following stock levels are operating critically low (threshold is <span className="text-yellow-500 font-bold">{lowStockThreshold} pcs</span>):{' '}
                    <span className="font-extrabold text-slate-200">
                      {products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId).filter(p => p.stock < lowStockThreshold).map(p => `${p.name} (${p.stock} remain)`).join(', ')}
                    </span>
                  </p>
                </div>
              )}

              {/* Bulk product controls */}
              {(() => {
                const visibleProducts = products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId);
                if (visibleProducts.length > 0) {
                  return (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-left animate-fade-in">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedProductIds.length === visibleProducts.length) {
                              setSelectedProductIds([]);
                            } else {
                              setSelectedProductIds(visibleProducts.map(p => p.id));
                            }
                          }}
                          className="bg-slate-800 hover:bg-slate-755 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-705 transition cursor-pointer font-bold"
                        >
                          {selectedProductIds.length === visibleProducts.length ? 'Deselect All Products' : 'Select All Products'}
                        </button>
                        <span className="text-slate-400 font-mono">
                          Selected products: <strong className="text-yellow-500">{selectedProductIds.length}</strong> of {visibleProducts.length}
                        </span>
                      </div>
                      {selectedProductIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleBulkDeleteProducts}
                          className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow cursor-pointer text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Selected ({selectedProductIds.length})
                        </button>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.filter(p => currentUser.role === 'Master Admin' || p.storeId === currentUser.storeId).map((p) => {
                  const isLowStock = p.stock < lowStockThreshold;
                  return (
                    <div
                      key={p.id}
                      className={`relative p-3.5 rounded-xl flex items-center justify-between gap-3 border transition-all ${
                        isLowStock
                          ? 'bg-amber-950/15 border-amber-500/50 shadow-(amber-500/10) border-l-4 border-l-red-500'
                          : 'bg-slate-950/80 border-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <img src={p.imageUrl} alt={p.name} className="w-14 h-14 object-cover rounded-lg bg-slate-900 border border-white/5" referrerPolicy="no-referrer" />
                          <div className="absolute -top-1.5 -left-1.5 bg-slate-950/90 backdrop-blur rounded p-1 border border-white/10 flex items-center justify-center shadow">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds(prev => [...prev, p.id]);
                                } else {
                                  setSelectedProductIds(prev => prev.filter(id => id !== p.id));
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-yellow-500 bg-slate-900 border-slate-705 cursor-pointer accent-yellow-500"
                            />
                          </div>
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-bold text-slate-200 truncate leading-normal">{p.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold font-sans">{stores.find(s => s.id === p.storeId)?.name || 'Store Catalog'}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px]">
                            <p className="text-yellow-500 font-bold font-mono">€{p.price.toFixed(2)}</p>
                            <p className={`${isLowStock ? 'text-rose-400 font-extrabold animate-pulse' : 'text-slate-405'}`}>
                              Stock: {p.stock} pcs
                              {isLowStock && (
                                <span className="ml-1.5 bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] px-1 py-0.5 rounded font-bold tracking-wider animate-pulse inline-block">
                                  CRITICAL
                                </span>
                              )}
                            </p>
                            {p.barcode && (
                              <span className="bg-slate-900 text-yellow-500 px-1.5 py-0.5 rounded text-[9px] font-mono border border-slate-800">
                                BC: {p.barcode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => startEditProduct(p)}
                          className="p-1 px-2 bg-slate-900 hover:bg-slate-805 text-yellow-500 rounded text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer transition-colors border border-slate-800"
                          title="Edit Item"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1 px-2 bg-slate-900 hover:bg-slate-805 text-red-100 rounded text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer transition-colors border border-slate-800 hover:text-red-400"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE OUTLET ORDERS PANEL */}
        {activeTab === 'orders' && (
          <div className="space-y-6 text-left">
            {/* Real-time statistics telemetry dashboard heading */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-sans font-bold text-white text-md flex items-center gap-2">
                  <span>📊 Real-time Order Analytics & Statistics Panel</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">Live metrics and daily volume statistics for active storefront locations.</p>
              </div>

              {/* LIVE AUTO REFRESH TOGGLE */}
              <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-850 w-fit shrink-0">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  {autoRefreshEnabled ? '🟢 Live Auto-Refresh Active (5s)' : '⚪ Auto-Refresh Paused'}
                </span>
                <button
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                    autoRefreshEnabled ? 'bg-yellow-500' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-slate-950 rounded-full shadow-md transform transition-transform ${
                      autoRefreshEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Metrics counting grids */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl text-left shadow-sm">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono block font-bold">Pending Actions</span>
                <span className="text-3xl font-black text-amber-400 font-mono mt-1.5 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && o.status === 'Pending').length}
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">Awaiting physical setup</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl text-left shadow-sm">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono block font-bold">Completed Count</span>
                <span className="text-3xl font-black text-emerald-400 font-mono mt-1.5 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && o.status === 'Completed').length}
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">Placed & Dispatched</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl text-left shadow-sm">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono block font-bold">Cancelled Status</span>
                <span className="text-3xl font-black text-red-500 font-mono mt-1.5 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && o.status === 'Cancelled').length}
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">Voided or Rejected metrics</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl text-left shadow-sm">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono block font-bold">Total Orders</span>
                <span className="text-3xl font-black text-indigo-400 font-mono mt-1.5 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId)).length}
                </span>
                <span className="text-[9px] text-slate-500 mt-1 block">System records count</span>
              </div>
            </div>

            {/* Timed interval counting breakdown metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl text-left">
                <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono block font-bold">Received Today</span>
                <span className="text-xl font-black text-white font-mono mt-1 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && (Date.now() - new Date(o.createdAt).getTime() < 24 * 60 * 60 * 1000)).length} orders
                </span>
                <p className="text-[9px] text-slate-500 mt-1 leading-snug">Orders placed within the past 24 hourly periods strictly.</p>
              </div>
              <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl text-left">
                <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono block font-bold">Received This Week</span>
                <span className="text-xl font-black text-white font-mono mt-1 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && (Date.now() - new Date(o.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000)).length} orders
                </span>
                <p className="text-[9px] text-slate-500 mt-1 leading-snug">Orders placed within the past 7 active calendar days.</p>
              </div>
              <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl text-left">
                <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono block font-bold">Received This Month</span>
                <span className="text-xl font-black text-white font-mono mt-1 block">
                  {orders.filter(o => (currentUser.role === 'Master Admin' || currentUser.storeId === o.storeId) && (Date.now() - new Date(o.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000)).length} orders
                </span>
                <p className="text-[9px] text-slate-500 mt-1 leading-snug">Orders placed within the past 30 active calendar days.</p>
              </div>
            </div>

            {/* Daily Order Volume Recharts Bar Chart */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
              <h5 className="text-xs font-bold text-slate-300 font-sans uppercase tracking-wider flex items-center gap-1.5">
                <span>📊 Weekly Dispatch Timeline (Orders received per day over last week)</span>
              </h5>
              <div className="h-60 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Array.from({ length: 7 }).map((_, idx) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (6 - idx));
                      const dateKey = d.toDateString();
                      const dayStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                      
                      const count = orders.filter((o) => {
                        if (currentUser.role !== 'Master Admin' && currentUser.storeId !== o.storeId) {
                          return false;
                        }
                        return new Date(o.createdAt).toDateString() === dateKey;
                      }).length;

                      return {
                        name: dayStr,
                        Orders: count
                      };
                    })}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
                    />
                    <Bar dataKey="Orders" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Orders listing segment layout */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3.5 gap-4">
                <div className="flex items-center gap-3">
                  <h5 className="font-sans font-bold text-white text-md">
                    Active Dispatch Queue
                  </h5>
                  <button
                    onClick={handleExportOrdersCSV}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/15 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    title="Export the currently visible dispatch entries to Excel CSV format"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>

                {/* Switcher tabs for segmented workflow states */}
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 w-fit">
                  <button
                    onClick={() => setOrdersFilterSubTab('all')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      ordersFilterSubTab === 'all' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚡ Active Queue
                  </button>
                  <button
                    onClick={() => setOrdersFilterSubTab('completed')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      ordersFilterSubTab === 'completed' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ✓ Completed (Past 24 Hours)
                  </button>
                  <button
                    onClick={() => setOrdersFilterSubTab('cancelled')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      ordersFilterSubTab === 'cancelled' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚠ Cancelled Listings
                  </button>
                </div>
              </div>

              {orders.filter((o) => {
                if (currentUser.role !== 'Master Admin' && currentUser.storeId !== o.storeId) {
                  return false;
                }
                if (ordersFilterSubTab === 'all') {
                  return o.status !== 'Completed' && o.status !== 'Cancelled';
                } else if (ordersFilterSubTab === 'completed') {
                  if (o.status !== 'Completed') return false;
                  if (!o.completedAt) return true;
                  const completedTime = new Date(o.completedAt).getTime();
                  return Date.now() - completedTime < 24 * 60 * 60 * 1000; // Less than 24 hrs
                } else {
                  return o.status === 'Cancelled';
                }
              }).length === 0 ? (
                <p className="text-xs text-slate-500 py-12 text-center italic bg-slate-950/20 rounded-xl border border-dashed border-slate-800">
                  No order records exist matching the {ordersFilterSubTab === 'completed' ? 'Completed (Last 24 Hours)' : ordersFilterSubTab === 'cancelled' ? 'Cancelled' : 'Active'} category queue limits.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Bulk delete bar for Orders */}
                  {(() => {
                    const visibleOrders = orders.filter((o) => {
                      if (currentUser.role !== 'Master Admin' && currentUser.storeId !== o.storeId) {
                        return false;
                      }
                      if (ordersFilterSubTab === 'all') {
                        return o.status !== 'Completed' && o.status !== 'Cancelled';
                      } else if (ordersFilterSubTab === 'completed') {
                        if (o.status !== 'Completed') return false;
                        if (!o.completedAt) return true;
                        const completedTime = new Date(o.completedAt).getTime();
                        return Date.now() - completedTime < 24 * 60 * 60 * 1000;
                      } else {
                        return o.status === 'Cancelled';
                      }
                    });

                    if (visibleOrders.length > 0) {
                      return (
                        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-left animate-fade-in shadow-inner">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedOrderIds.length === visibleOrders.length) {
                                  setSelectedOrderIds([]);
                                } else {
                                  setSelectedOrderIds(visibleOrders.map(o => o.id));
                                }
                              }}
                              className="bg-slate-805 hover:bg-slate-750 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer font-bold"
                            >
                              {selectedOrderIds.length === visibleOrders.length ? 'Deselect All Orders' : 'Select All Orders'}
                            </button>
                            <span className="text-slate-400 font-mono">
                              Selected Orders: <strong className="text-yellow-500">{selectedOrderIds.length}</strong> of {visibleOrders.length}
                            </span>
                          </div>
                          {selectedOrderIds.length > 0 && (
                            <button
                              type="button"
                              onClick={handleBulkDeleteOrders}
                              className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow cursor-pointer text-xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Selected ({selectedOrderIds.length})
                            </button>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {orders
                      .filter((o) => {
                        if (currentUser.role !== 'Master Admin' && currentUser.storeId !== o.storeId) {
                          return false;
                        }
                        if (ordersFilterSubTab === 'all') {
                          return o.status !== 'Completed' && o.status !== 'Cancelled';
                        } else if (ordersFilterSubTab === 'completed') {
                          if (o.status !== 'Completed') return false;
                          if (!o.completedAt) return true;
                          const completedTime = new Date(o.completedAt).getTime();
                          return Date.now() - completedTime < 24 * 60 * 60 * 1000;
                        } else {
                          return o.status === 'Cancelled';
                        }
                      })
                      .map((o) => (
                        <div key={o.id} className="bg-slate-950 border border-slate-850 p-5 rounded-xl space-y-4 shadow-sm transition-all relative">
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="space-y-2 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.includes(o.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedOrderIds(prev => [...prev, o.id]);
                                    } else {
                                      setSelectedOrderIds(prev => prev.filter(id => id !== o.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded text-yellow-500 bg-slate-900 border-slate-700 cursor-pointer accent-yellow-500 shrink-0"
                                />
                                <span className="font-mono text-yellow-500 font-bold">#{o.id.slice(-6).toUpperCase()}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                  o.status === 'Pending' ? 'bg-amber-900/35 text-amber-400 border border-amber-800/40' :
                                  o.status === 'Confirmed' ? 'bg-sky-950 text-sky-400 border border-sky-850' :
                                  o.status === 'Preparing' ? 'bg-indigo-950 text-indigo-400 border border-indigo-850' :
                                  o.status === 'Ready' ? 'bg-purple-950 text-purple-400 border border-purple-850' :
                                  o.status === 'Completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-850' :
                                  'bg-red-950 text-red-400 border border-red-850'
                                }`}>
                                  {o.status}
                                </span>
                                <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-indigo-300 font-mono">
                                  {o.type} ({o.timeSlot})
                                </span>
                                {o.completedAt && (
                                  <span className="text-[9px] text-emerald-450 font-mono">
                                    ✓ Completed At: {new Date(o.completedAt).toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                              
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-slate-250">Customer: {o.customerName} ({o.customerPhone})</p>
                                {o.type === 'Delivery' && <p className="text-[11px] text-slate-400 font-sans">Address Location: {o.deliveryAddress}</p>}
                              </div>
  
                              <div className="border-t border-slate-900 pt-2 space-y-1">
                                {o.items.map((item, idx) => (
                                  <p key={idx} className="text-[11px] text-slate-300 font-mono">
                                    {item.name} x {item.quantity} (unit price: €{item.price.toFixed(2)})
                                  </p>
                                ))}
                                <p className="text-xs font-bold text-yellow-500 font-mono mt-1">Total Paid Value: €{o.totalPrice.toFixed(2)}</p>
                              </div>
  
                              {/* delivery confirmation profile */}
                              {o.deliveryConfirmationImage && (
                                <div className="pt-2">
                                  <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Delivery Drop Photo Profile</span>
                                  <img src={o.deliveryConfirmationImage} alt="Delivery Drop Confirmation" className="w-16 h-16 object-cover bg-slate-900 rounded border border-white/5" referrerPolicy="no-referrer" />
                                </div>
                              )}
                            </div>
  
                            <div className="text-left lg:text-right shrink-0">
                              <span className="text-[10px] text-slate-500 font-mono block mb-1.5 uppercase">Update Status Workflow</span>
                              <div className="flex gap-1 flex-wrap justify-start lg:justify-end max-w-sm">
                                {(['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'] as const).map((status) => (
                                  <button
                                    key={status}
                                    onClick={() => handleOrderStatusOverride(o.id, status)}
                                    className={`px-2.5 py-1 text-[9px] font-mono font-bold border rounded transition-all cursor-pointer ${
                                      o.status === status
                                        ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold shadow-sm'
                                        : 'bg-slate-950 text-slate-400 border-slate-850 hover:border-slate-500 hover:text-white'
                                    }`}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
  
                          {/* Chat communication area */}
                          <div className="border-t border-slate-900/60 pt-3 flex flex-wrap items-center justify-between gap-3">
                            <button
                              onClick={() => setChattingOrderId(chattingOrderId === o.id ? null : o.id)}
                              className="flex items-center gap-2 text-[10px] font-bold uppercase transition-all py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 text-yellow-500 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              {chattingOrderId === o.id ? 'Close dialogue communication log' : `Send message / Communicate with customer ${o.customerName}`}
                            </button>

                            <button
                              onClick={() => handleDeleteOrder(o.id)}
                              className="bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 border border-rose-500/20 text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                              title="Delete Order entry permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Order</span>
                            </button>
                          </div>
  
                          {/* Chat input form container when opened */}
                          {chattingOrderId === o.id && (
                            <div className="mt-3 bg-slate-950/80 border border-slate-850 rounded-xl p-3.5 space-y-3">
                              <p className="text-[10px] text-slate-400 font-mono tracking-tight">
                                Communication thread mapped session customer reference: <span className="text-yellow-500 font-bold font-mono">{o.customerId}</span>
                              </p>
                              <div className="max-h-[165px] overflow-y-auto space-y-2 pr-1 text-xs">
                                {activeOrderMessages.length === 0 ? (
                                  <p className="text-slate-600 italic text-center py-4 text-xs">No prior conversation history recorded inside workspace. Try sending a message below.</p>
                                ) : (
                                  activeOrderMessages.map((msg) => {
                                    const isCustomer = msg.senderRole === 'Customer' || msg.senderRole === 'Guest';
                                    return (
                                      <div key={msg.id} className={`flex flex-col max-w-[85%] ${!isCustomer ? 'ml-auto text-right items-end' : 'mr-auto text-left items-start'}`}>
                                        <span className="text-[8px] text-slate-555 font-mono font-bold uppercase">{msg.senderName} ({msg.senderRole})</span>
                                        <div className={`p-2.5 rounded-xl mt-0.5 leading-snug ${!isCustomer ? 'bg-[#FFFF00] text-slate-950 font-semibold rounded-tr-xs shadow-xs' : 'bg-slate-900 border border-slate-850/50 text-slate-200 rounded-tl-xs'}`}>
                                          {msg.text}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
  
                              <form onSubmit={(e) => handleSendAdminChatMessage(e, o)} className="flex gap-2 pt-1 border-t border-slate-900">
                                <input
                                  type="text"
                                  required
                                  placeholder={`Type chat message logs for ${o.customerName}...`}
                                  value={adminChatText}
                                  onChange={(e) => setAdminChatText(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg h-9 px-3 text-xs text-slate-250 outline-none focus:border-yellow-500 font-sans"
                                />
                                <button type="submit" className="bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-black text-xs px-4 rounded-lg cursor-pointer transition-colors shrink-0">
                                  Transmit Message
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOCK MAP LOCATION SERVICES */}
        {activeTab === 'delivery' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-left space-y-4">
            <h4 className="font-sans font-bold text-white text-md border-b border-slate-800 pb-3 flex items-center justify-between">
              <span>📍 GPS MAP TELEMETRY DISPATCH</span>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest bg-slate-950 border border-white/5 px-2 py-0.5 rounded">Locations Hub</span>
            </h4>

            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Physical branch addresses and customer shipping drop-off coordinates are logged strictly in the map directory below:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locations.map((loc, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex items-start gap-3 shadow-md">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    loc.type === 'Store Outlet' ? 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/20' : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                  }`}>
                    <MapPin className="w-5 h-5 shrink-0" />
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-slate-200">{loc.label}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-mono mt-0.5">{loc.type}</p>
                    <p className="text-slate-400 font-mono mt-2 leading-tight">
                      Address: <a href={`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`} target="_blank" rel="noreferrer" className="text-yellow-500 underline truncate hover:text-yellow-400">
                        {loc.address}
                      </a>
                    </p>
                    {loc.phone && <p className="text-slate-500 font-mono mt-1">Tel: {loc.phone}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Universal Scanner Modals */}
      <BarcodeScannerModal
        isOpen={isCatalogScannerOpen}
        onClose={() => setIsCatalogScannerOpen(false)}
        onScanSuccess={handleCatalogBarcodeScan}
        title="Inventory Barcode Auto-Population"
      />
      <BarcodeScannerModal
        isOpen={isPosScannerOpen}
        onClose={() => setIsPosScannerOpen(false)}
        onScanSuccess={handleDirectBarcodeScan}
        title="POS Selling Barcode Reader"
      />

      {/* Editing User Override overlay modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-left">
            <h3 className="font-sans font-bold text-white text-lg border-b border-slate-800 pb-3 flex items-center justify-between">
              <span>🔧 Override Credentials</span>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </h3>

            {editUserError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 rounded-lg font-mono">
                ⚠ {editUserError}
              </div>
            )}

            {editUserSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3 rounded-lg font-mono">
                ✓ {editUserSuccess}
              </div>
            )}

            <form onSubmit={handleEditUserSubmit} className="space-y-4">
              <div className="space-y-1 block">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">FULL DISPLAY USERNAME</label>
                <input
                  type="text"
                  required
                  value={editUserUsername}
                  onChange={(e) => setEditUserUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                />
              </div>

              <div className="space-y-1 block">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">GMAIL ACCOUNT ADDRESS</label>
                <input
                  type="email"
                  required
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">PHONE NUMBER</label>
                  <input
                    type="text"
                    required
                    value={editUserPhone}
                    onChange={(e) => setEditUserPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">GENDER</label>
                  <select
                    value={editUserGender}
                    onChange={(e) => setEditUserGender(e.target.value as 'Man' | 'Woman')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-250 outline-none"
                  >
                    <option value="Man">♂ Man</option>
                    <option value="Woman">♀ Woman</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1 block">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider">SET NEW PASSWORD</label>
                <input
                  type="password"
                  placeholder="Leave empty to maintain password"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">ROLE TYPE</label>
                  <select
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none"
                  >
                    <option value="Customer">Customer</option>
                    <option value="Store Staff">Store Staff</option>
                    <option value="Admin">Local Admin</option>
                    <option value="Store Owner">Store Owner</option>
                  </select>
                </div>

                <div className="space-y-1 block">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">ASSIGNED STORE</label>
                  <select
                    value={editUserStoreId}
                    onChange={(e) => setEditUserStoreId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none"
                  >
                    <option value="">[Not Assigned]</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 font-semibold px-4 py-2 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editUserLoading}
                  className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold px-5 py-2 rounded-lg text-xs uppercase transition-all tracking-wider"
                >
                  {editUserLoading ? 'Overriding...' : 'Apply Overrides'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
