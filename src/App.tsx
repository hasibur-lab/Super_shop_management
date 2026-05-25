import React, { useState, useEffect } from 'react';
import { User, Store, Product, Order, Message, UserRole, OrderStatus } from './types.js';
import SettingsPanel from './components/SettingsPanel.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import CatalogImage from './components/CatalogImage.tsx';
import {
  Shield,
  ShoppingBag,
  Home,
  Menu,
  X,
  MessageCircle,
  Clock,
  MapPin,
  Phone,
  Settings,
  LogOut,
  ChevronRight,
  UserCheck,
  Package,
  Plus,
  Minus,
  CheckCircle,
  Truck,
  Upload,
  User as UserIcon,
  Sun,
  Moon,
  ExternalLink,
  Users,
  Barcode,
  Store as StoreIcon,
  Map,
  Share2,
  Copy,
  Volume2,
  VolumeX
} from 'lucide-react';

export default function App() {
  // Authentication & session state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authView, setAuthView] = useState<'login' | 'signup' | 'guest'>('login');

  // Input states for form authentication
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [signupRole, setSignupRole] = useState<'Customer' | 'Store Owner'>('Customer');
  const [signupGender, setSignupGender] = useState<'Man' | 'Woman'>('Man');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Core navigation state
  const [activeTab, setActiveTab] = useState<'explore' | 'settings' | 'admin' | 'stores' | 'users' | 'catalog' | 'orders' | 'delivery' | 'pos'>('explore');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pro_theme') as 'dark' | 'light') || 'dark';
  });

  // Mobile sidebar states with strict auto-hide timers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Store multi-tenancy slug routing states
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState<Store | null>(null);
  const [isStoreIsolated, setIsStoreIsolated] = useState(false);
  const [shareNotification, setShareNotification] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // Cart & Order Placement State
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  // Checkout Form Sheet Panel
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutType, setCheckoutType] = useState<'Pickup' | 'Delivery'>('Pickup');
  const [checkoutTimeSlot, setCheckoutTimeSlot] = useState('12:00 - 13:00');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutDropPhoto, setCheckoutDropPhoto] = useState('');
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Customer historical records & active order telemetry
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [orderQueryPhone, setOrderQueryPhone] = useState('');

  // Retail chat states
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [activeChatText, setActiveChatText] = useState('');

  // S3 upload validation tracking
  const [uploadingDropImage, setUploadingDropImage] = useState(false);

  // SSE toast popup trigger
  const [toastMessage, setToastMessage] = useState<{ title: string; body: string } | null>(null);

  // High volume active emergency/priority modal alert with automatic audio synthesizer loop
  const [highVolumeAlert, setHighVolumeAlert] = useState<{
    id: string;
    type: 'order' | 'message' | 'completed';
    title: string;
    body: string;
    storeName: string;
    timestamp: string;
  } | null>(null);
  
  const [isAlertMuted, setIsAlertMuted] = useState(false);

  // Sidebar mobile auto-hide 3 seconds rules
  useEffect(() => {
    if (isSidebarOpen) {
      const sidebarTimeout = setTimeout(() => {
        setIsSidebarOpen(false);
      }, 3000); // exactly 3-second visibility timeout on mobile transitions
      return () => clearTimeout(sidebarTimeout);
    }
  }, [isSidebarOpen]);

  // Sync theme to markup
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  }, [theme]);

  // Load stores list initially
  const loadStores = async () => {
    try {
      const res = await fetch('/api/stores');
      const data = await res.json();
      if (res.ok) {
        setStores(data.stores || []);
      }
    } catch (e) {
      console.error('Error fetching stores', e);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  // Restore authenticated states
  useEffect(() => {
    const cachedUser = localStorage.getItem('pro_user');
    const cachedToken = localStorage.getItem('pro_token');
    if (cachedUser && cachedToken) {
      setCurrentUser(JSON.parse(cachedUser));
      setToken(cachedToken);
    }
  }, []);

  // Enforce administrative role lock redirects
  useEffect(() => {
    if (currentUser) {
      const isStaffOrAdmin = ['Master Admin', 'Admin', 'Store Owner', 'Store Staff'].includes(currentUser.role);
      if (isStaffOrAdmin) {
        if (currentUser.role === 'Store Staff') {
          setActiveTab('pos');
        } else {
          setActiveTab('orders');
        }
      } else {
        setActiveTab('explore');
      }
    } else {
      setActiveTab('explore');
    }
  }, [currentUser]);

  // Sync products and routing parameters based on hashed slug URI `/store/:slug`
  useEffect(() => {
    const handleHashAndPrefix = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#/store/')) {
        const rawSlug = hash.replace('#/store/', '');
        let slug = rawSlug;
        let isIsolated = false;
        
        if (rawSlug.includes('?')) {
          const parts = rawSlug.split('?');
          slug = parts[0];
          const query = parts[1] || '';
          if (query.includes('isolated=true') || query.includes('view=only')) {
            isIsolated = true;
          }
        }
        
        const found = stores.find(s => s.slug === slug);
        if (found) {
          setActiveStore(found);
          setIsStoreIsolated(isIsolated);
        }
      } else if (stores.length > 0 && !activeStore) {
        // Fallback to first flagship store
        setActiveStore(stores[0]);
        setIsStoreIsolated(false);
        window.location.hash = `#/store/${stores[0].slug}`;
      }
    };

    handleHashAndPrefix();
    window.addEventListener('hashchange', handleHashAndPrefix);
    return () => window.removeEventListener('hashchange', handleHashAndPrefix);
  }, [stores]);

  // Fetch store product catalog
  useEffect(() => {
    if (!activeStore) return;
    const fetchCatalog = async () => {
      try {
        const res = await fetch(`/api/products?storeId=${activeStore.id}`);
        const data = await res.json();
        if (res.ok) {
          setProducts(data.products || []);
          setFilteredProducts(data.products || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchCatalog();
    setCart([]); // reset active store cart choices
  }, [activeStore]);

  // Fetch contextual historical orders and chat stream for customers/guests
  const refreshUserHistoricalContext = async () => {
    if (!activeStore) return;
    try {
      let url = `/api/orders?storeId=${activeStore.id}`;
      const headers: HeadersInit = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (currentUser) {
        url += `&customerId=${currentUser.id}`;
      } else if (orderQueryPhone) {
        url += `&phone=${encodeURIComponent(orderQueryPhone)}`;
      }

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (res.ok) {
        setMyOrders(data.orders || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshUserHistoricalContext();
  }, [activeStore, currentUser, token, orderQueryPhone]);

  // Sync threads inside Direct Retail Chat room
  const syncChatThread = async () => {
    if (!activeStore) return;
    try {
      let url = `/api/chat/messages/${activeStore.id}`;
      if (currentUser) {
        url += `?customerId=${currentUser.id}`;
      } else {
        url += `?customerId=guest-session`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setChatMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Chat thread failed to sync', e);
    }
  };

  useEffect(() => {
    syncChatThread();
    const intervalRef = setInterval(() => {
      syncChatThread();
    }, 4500);
    return () => clearInterval(intervalRef);
  }, [activeStore, currentUser]);

  const playHighVolumeAlarm = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playBeep = (startTime: number, frequency: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth'; // Loud wave
        osc.frequency.setValueAtTime(frequency, startTime);
        
        gain.gain.setValueAtTime(0.85, startTime); // High volume gain setting
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.02);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      // High frequency warning sound pulses
      playBeep(now, 980, 0.25);
      playBeep(now + 0.35, 980, 0.25);
      playBeep(now + 0.7, 1320, 0.45);
    } catch (e) {
      console.warn('Audio synthesis query blocked by interaction rules:', e);
    }
  };

  // Recurrent sound player loop for unacknowledged critical alerts
  useEffect(() => {
    if (!highVolumeAlert || isAlertMuted) return;
    
    playHighVolumeAlarm();
    
    const alarmInterval = setInterval(() => {
      playHighVolumeAlarm();
    }, 2500); // sound triggers every 2.5 seconds
    
    return () => clearInterval(alarmInterval);
  }, [highVolumeAlert, isAlertMuted]);

  // Real-time notification SSE listener
  useEffect(() => {
    const sse = new EventSource('/api/realtime');
    sse.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.type === 'order_status_updated' || parsed.type === 'order_placed') {
          refreshUserHistoricalContext();
          setToastMessage({
            title: 'Enterprise Dispatch Notice',
            body: `Order updates detected on store processing queues: Status changes log updated.`
          });

          // Check if order trigger complies with role rules
          if (parsed.type === 'order_placed' && parsed.data?.order) {
            const orderObj = parsed.data.order;
            const orderStoreId = orderObj.storeId;
            const belongsToStore = currentUser && currentUser.storeId === orderStoreId;
            const isMaster = currentUser && currentUser.role === 'Master Admin';

            if (currentUser && (belongsToStore || isMaster)) {
              const matchingStoreObj = stores.find(s => s.id === orderStoreId);
              const storeName = matchingStoreObj ? matchingStoreObj.name : `Store #${orderStoreId}`;

              setHighVolumeAlert({
                id: orderObj.id || 'order-' + Date.now(),
                type: 'order',
                title: '🚨 NEW INCOMING ORDER RECEIVED',
                body: `Invoice order placed by customer ${orderObj.customerName || 'AnonymousCustomer'}: status is pending dispatch.`,
                storeName: storeName,
                timestamp: new Date().toLocaleTimeString()
              });
              setIsAlertMuted(false);
            }
          } else if (parsed.type === 'order_status_updated' && parsed.data?.order) {
            const orderObj = parsed.data.order;
            if (orderObj.status === 'Completed') {
              const orderStoreId = orderObj.storeId;
              const belongsToStore = currentUser && currentUser.storeId === orderStoreId;
              const isMaster = currentUser && currentUser.role === 'Master Admin';
              const isStaff = currentUser && ['Master Admin', 'Store Owner', 'Store Staff', 'Admin'].includes(currentUser.role);

              if (currentUser && isStaff && (belongsToStore || isMaster)) {
                const matchingStoreObj = stores.find(s => s.id === orderStoreId);
                const storeName = matchingStoreObj ? matchingStoreObj.name : `Store #${orderStoreId}`;

                setHighVolumeAlert({
                  id: orderObj.id || 'order-complete-' + Date.now(),
                  type: 'completed',
                  title: '✅ ORDER COMPLETED SUCCESSFULLY',
                  body: `Order #${orderObj.id.slice(-6).toUpperCase()} for customer ${orderObj.customerName || 'Anonymous'} has been successfully checked out & completed.`,
                  storeName: storeName,
                  timestamp: new Date().toLocaleTimeString()
                });
                setIsAlertMuted(false);
              }
            }
          }
        } else if (parsed.type === 'chat_received') {
          if (parsed.data?.storeId === activeStore?.id) {
            syncChatThread();
          }

          const msgObj = parsed.data?.message;
          const msgStoreId = parsed.data?.storeId;
          const senderRole = msgObj?.senderRole;
          const isFromCustomer = senderRole === 'Customer' || senderRole === 'Guest';

          if (isFromCustomer && msgStoreId) {
            const belongsToStore = currentUser && currentUser.storeId === msgStoreId;
            const isMaster = currentUser && currentUser.role === 'Master Admin';

            if (currentUser && (belongsToStore || isMaster)) {
              const matchingStoreObj = stores.find(s => s.id === msgStoreId);
              const storeName = matchingStoreObj ? matchingStoreObj.name : `Store #${msgStoreId}`;

              setHighVolumeAlert({
                id: msgObj.id || 'msg-' + Date.now(),
                type: 'message',
                title: '💬 URGENT CUSTOMER MESSAGE',
                body: `"${msgObj.text || ''}" - sent by customer ${msgObj.senderName || 'Anonymous Guest'}`,
                storeName: storeName,
                timestamp: new Date().toLocaleTimeString()
              });
              setIsAlertMuted(false);
            }
          }
        }
      } catch (err) {
        console.error('SSE incoming packet decode error:', err);
      }
    };
    return () => sse.close();
  }, [activeStore, currentUser, stores]);

  // Auth Operations
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Identity keys decrypt failed.');
      }

      localStorage.setItem('pro_user', JSON.stringify(data.user));
      localStorage.setItem('pro_token', data.token);
      setCurrentUser(data.user);
      setToken(data.token);
      setAuthView('login');
      // Set workplace store view if user belongs to one
      if (data.user.storeId) {
        const boundStore = stores.find(s => s.id === data.user.storeId);
        if (boundStore) {
          setActiveStore(boundStore);
          window.location.hash = `#/store/${boundStore.slug}`;
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          phone,
          avatar,
          gender: signupGender,
          role: signupRole
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Corporate signup failed.');
      }
      setAuthSuccess(data.message || 'Account submission successfully logged!');
      setAuthView('login');
      setUsername('');
      setEmail('');
      setPassword('');
      setPhone('');
      setAvatar('');
    } catch (err: any) {
      setAuthError(err.message || 'Registration error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pro_user');
    localStorage.removeItem('pro_token');
    setCurrentUser(null);
    setToken(null);
    setActiveTab('explore');
  };

  const shareStoreLink = (store: Store) => {
    try {
      const origin = window.location.origin;
      const path = window.location.pathname;
      const url = `${origin}${path}#/store/${store.slug}?isolated=true`;
      
      // Use Clipboard API
      navigator.clipboard.writeText(url).then(() => {
        setShareNotification(`Unique Link Copied: ${store.name}`);
        setTimeout(() => setShareNotification(null), 3000);
      }).catch(err => {
        console.error('Clipboard copy failed. Falling back to alternative.', err);
        // Fallback option in case of some restrict/sandbox environment
        setShareNotification(`Direct copy link: ${url}`);
        setTimeout(() => setShareNotification(null), 6000);
      });
    } catch (e) {
      console.error('Failed to copy store share link', e);
    }
  };

  const handleProfileUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('pro_user', JSON.stringify(updatedUser));
  };

  // Cart operations
  const addToCart = (product: Product, qty: number = 1) => {
    setCart(prev => {
      const existing = prev.find(it => it.product.id === product.id);
      if (existing) {
        return prev.map(it => it.product.id === product.id ? { ...it, quantity: it.quantity + qty } : it);
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const updateCartQuantity = (productId: string, val: number) => {
    setCart(prev => {
      return prev.map(it => {
        if (it.product.id === productId) {
          const target = Math.max(0, it.quantity + val);
          return { ...it, quantity: target };
        }
        return it;
      }).filter(it => it.quantity > 0);
    });
  };

  // Checkout submission
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setCheckoutSuccessMessage(null);

    if (!activeStore) return;
    if (!checkoutName || !checkoutPhone) {
      setCheckoutError('Please enter full delivery options and contact name.');
      return;
    }

    const orderRows = cart.map(it => ({
      productId: it.product.id,
      name: it.product.name,
      price: it.product.price,
      quantity: it.quantity
    }));

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: activeStore.id,
          customerId: currentUser ? currentUser.id : 'guest-session',
          customerName: checkoutName,
          customerPhone: checkoutPhone,
          type: checkoutType,
          timeSlot: checkoutTimeSlot,
          deliveryAddress: checkoutAddress,
          deliveryConfirmationImage: checkoutDropPhoto,
          items: orderRows
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize checkout pass.');
      }

      setCheckoutSuccessMessage('Checkout finalized successfully! Order in queue.');
      setCart([]);
      setCheckoutAddress('');
      setCheckoutDropPhoto('');
      refreshUserHistoricalContext();
    } catch (err: any) {
      setCheckoutError(err.message || 'Checkout failed.');
    }
  };

  // Chat message send via standard retail socket pipelines
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatText.trim() || !activeStore) return;

    try {
      const senderName = currentUser ? currentUser.username : (checkoutName || 'Guest Visitor');
      const senderId = currentUser ? currentUser.id : 'guest-session';
      const senderRole = currentUser ? currentUser.role : 'Guest';

      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: activeStore.id,
          senderId,
          senderName,
          senderRole,
          text: activeChatText
        })
      });

      if (response.ok) {
        setActiveChatText('');
        syncChatThread();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // S3 upload simulation for deliveryDrop photographs files
  const handleDropPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDropImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Str = reader.result as string;
      try {
        const response = await fetch('/api/admin/stores/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : undefined
          } as any,
          body: JSON.stringify({ base64Data: base64Str, filename: file.name })
        });
        const uploadResult = await response.json();
        if (response.ok && uploadResult.success) {
          setCheckoutDropPhoto(uploadResult.url);
        }
      } catch (err) {
        console.error('Buffer upload failed', err);
      } finally {
        setUploadingDropImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStoreChoice = (store: Store) => {
    setActiveStore(store);
    window.location.hash = `#/store/${store.slug}`;
    setIsSidebarOpen(false);
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('pro_theme', nextTheme);
  };

  const totalCartCost = cart.reduce((acc, it) => acc + (it.product.price * it.quantity), 0);
  const totalCartUnits = cart.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col font-sans transition-colors duration-300">
      {/* Soft branding flare */}
      <div className="space-bg pointer-events-none" />
      <div className="nebula pointer-events-none" />

      {/* Real-time Order Toasts notifications */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-slate-900 border border-yellow-500 p-4 shadow-2xl flex items-start gap-3 animate-bounce">
          <Package className="w-5 h-5 text-yellow-500 mt-1 shrink-0" />
          <div className="text-left text-xs">
            <h5 className="font-bold text-white uppercase tracking-wider">{toastMessage.title}</h5>
            <p className="text-slate-350 mt-1">{toastMessage.body}</p>
            <button onClick={() => setToastMessage(null)} className="text-[10px] text-yellow-500 font-bold underline mt-2 block">
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* High Volume Priority Dispatch Alert Modal Overlay */}
      {highVolumeAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md" id="priority-alert-modal">
          <div className="bg-slate-900 border-2 border-red-500/80 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.45)] relative text-center space-y-4 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mx-auto animate-bounce">
              <Volume2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400 px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                {highVolumeAlert.type === 'order' && '🔔 Priority Store Dispatch Alert'}
                {highVolumeAlert.type === 'message' && '💬 Urgent Customer Message'}
                {highVolumeAlert.type === 'completed' && '✅ Confirmed Completed Order'}
              </span>
              <h2 className="text-lg font-extrabold text-white mt-1.5 leading-snug">{highVolumeAlert.title}</h2>
              <p className="text-xs text-yellow-500 font-bold uppercase tracking-wider font-mono">Store Branch: {highVolumeAlert.storeName}</p>
            </div>

            <div className="p-4 bg-slate-955 border border-slate-800 rounded-2xl text-left">
              <p className="text-xs text-slate-300 leading-relaxed font-mono">{highVolumeAlert.body}</p>
              <div className="mt-3 pt-2 border-t border-slate-805/40 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>Signal ref: {highVolumeAlert.id.slice(-6).toUpperCase()}</span>
                <span>Logged at: {highVolumeAlert.timestamp}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-center items-center pt-2">
              <button 
                onClick={() => setIsAlertMuted(!isAlertMuted)} 
                className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold shrink-0 select-none ${
                  isAlertMuted 
                    ? 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300' 
                    : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                }`}
                title={isAlertMuted ? "Unmute Alarm Sound" : "Mute Alarm Sound"}
              >
                {isAlertMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-red-500 animate-pulse" />}
                {isAlertMuted ? 'Muted' : 'Mute'}
              </button>
              
              <button 
                onClick={() => {
                  setHighVolumeAlert(null);
                  setIsAlertMuted(false);
                }} 
                className="flex-grow py-3 bg-[#FFFF00] hover:bg-yellow-450 text-slate-950 font-black uppercase tracking-wider text-xs rounded-xl shadow-md cursor-pointer hover:shadow-yellow-500/15 active:scale-95 transition-all text-center"
              >
                Acknowledge Alert & Clear Alarm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share clipboard feedback notifications */}
      {shareNotification && (
        <div className="fixed bottom-6 left-6 z-50 max-w-sm rounded-xl bg-slate-900 border border-yellow-500 p-4 shadow-2xl flex items-center gap-3 animate-pulse">
          <CheckCircle className="w-5 h-5 text-yellow-500 shrink-0" />
          <div className="text-left text-xs">
            <h5 className="font-bold text-white uppercase tracking-wider">Store Linked Copied</h5>
            <p className="text-slate-350 mt-0.5">{shareNotification}</p>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="glass p-4 mb-4 flex items-center justify-between gap-4 sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 sm:hidden rounded-lg bg-slate-950/60 border hover:border-yellow-500 text-yellow-500 cursor-pointer"
            title="Menu Drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex w-10 h-10 bg-yellow-500 text-slate-950 font-black rounded-lg items-center justify-center shadow-md">
            <ShoppingBag className="w-5 h-5" />
          </div>

          <div className="text-left">
            <h1 className="text-lg font-bold font-display tracking-tight text-white leading-none uppercase">
              Hasib's <span className="text-yellow-500">Superstore Company</span>
            </h1>
            {activeStore && (
              <span className="text-[10px] text-zinc-400 font-mono tracking-widest block mt-0.5">
                ACTIVE SHELF: {activeStore.name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme switcher */}
          <button onClick={toggleTheme} className="w-9 h-9 rounded-lg bg-slate-950 hover:bg-slate-900 border text-slate-400 hover:text-yellow-500 flex items-center justify-center transition-all cursor-pointer">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>

          {/* User Telemetry Status */}
          {currentUser ? (
            <div className="flex items-center gap-3 pr-1">
              <div className="hidden md:block text-right text-xs">
                <p className="font-bold text-white">{currentUser.username}</p>
                <p className="text-[9px] text-yellow-500 font-mono font-bold tracking-wider uppercase">{currentUser.role}</p>
              </div>
              <img src={currentUser.avatar} alt="Avatar profile" className="w-9 h-9 rounded-full border border-yellow-500 object-cover bg-slate-900 shrink-0" />
              
              <button onClick={handleLogout} className="p-2 bg-slate-900 border border-slate-800 text-red-500 hover:text-red-400 hover:bg-slate-850 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold font-mono tracking-tight" title="Exit / Sign Out">
                <LogOut className="w-3.5 h-3.5" />
                <span>EXIT</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-900 border rounded-lg p-1 text-xs">
              <button onClick={() => setAuthView('login')} className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 border rounded font-bold text-slate-300">
                Identity Verify login
              </button>
              <button onClick={() => setAuthView('signup')} className="px-3.5 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold rounded">
                Signup Free
              </button>
            </div>
          )}
        </div>
      </header>

      {/* WORKSPACE MIDDLE BODY */}
      <div className="flex-grow flex relative w-full max-w-7xl mx-auto overflow-hidden">
        
        {/* UNIFIED FACEBOOK-STYLE LEFT SIDEBAR */}
        <aside className={`fixed md:static top-16 bottom-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-900 py-5 text-left transform transition-transform duration-300 md:translate-x-0 overflow-y-auto shrink-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          {/* Identity & Profile Overview Card */}
          <div className="px-4 mb-5 pb-4 border-b border-slate-900/60">
            <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-850 flex items-center gap-3">
              <img 
                src={currentUser?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"} 
                alt="Profile Preview" 
                className="w-10 h-10 rounded-full border border-yellow-500 object-cover bg-slate-950" 
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentUser?.username || 'Guest Customer'}</p>
                <p className="text-[9px] text-yellow-500 font-mono font-bold tracking-wider uppercase mt-0.5">
                  {currentUser?.role || 'Retail Explorer'}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 mb-2">
            <span className="text-[9px] font-bold text-slate-500 font-mono tracking-widest uppercase block">
              Core Channels
            </span>
          </div>

          <nav className="space-y-1 px-2">
            {/* Customer Navigation */}
            {(!currentUser || currentUser.role === 'Customer') && (
              <>
                <button
                  onClick={() => { setActiveTab('explore'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'explore'
                      ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Explore Shelf</span>
                </button>

                <button
                  onClick={() => { setActiveTab('locations'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'locations'
                      ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <MapPin className="w-4 h-4 shrink-0 text-yellow-500" />
                  <span>Store Locations</span>
                </button>

                {currentUser && (
                  <button
                    onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                      activeTab === 'settings'
                        ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold'
                        : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                    }`}
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span>Settings & Profile</span>
                  </button>
                )}
              </>
            )}

            {/* Staff / Administrative Navigation */}
            {currentUser && ['Master Admin', 'Admin', 'Store Owner', 'Store Staff'].includes(currentUser.role) && (
              <>
                <button
                  onClick={() => { setActiveTab('orders'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'orders'
                      ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <Home className="w-4 h-4 shrink-0" />
                  <span className="flex-grow">Workspace Orders</span>
                </button>

                <button
                  onClick={() => { setActiveTab('catalog'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'catalog'
                      ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <Package className="w-4 h-4 shrink-0" />
                  <span>Store Storage</span>
                </button>

                <button
                  onClick={() => { setActiveTab('pos'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'pos'
                      ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <Barcode className="w-4 h-4 shrink-0" />
                  <span>Selling Panel (POS)</span>
                </button>

                {currentUser.role === 'Master Admin' && (
                  <>
                    <button
                      onClick={() => { setActiveTab('stores'); setIsSidebarOpen(false); }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                        activeTab === 'stores'
                          ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                          : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                      }`}
                    >
                      <StoreIcon className="w-4 h-4 shrink-0" />
                      <span>Stores Provisioning</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                        activeTab === 'users'
                          ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                          : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span>Staff Assignment</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => { setActiveTab('delivery'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'delivery'
                      ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <Map className="w-4 h-4 shrink-0" />
                  <span>Merchant Location Map</span>
                </button>

                <button
                  onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer border ${
                    activeTab === 'settings'
                      ? 'bg-[#FFFF00] text-slate-950 border-yellow-500 font-bold'
                      : 'bg-slate-900/10 text-slate-300 border-transparent hover:bg-slate-900 hover:border-slate-850'
                  }`}
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Personal Settings</span>
                </button>
              </>
            )}
          </nav>

          {/* FLAGSHIP OUTLETS - ONLY FOR CUSTOMERS & GUESTS */}
          {(!currentUser || currentUser.role === 'Customer') && (
            <div className="mt-6 pt-5 border-t border-slate-900/60 pb-3 space-y-3">
              <div className="px-4 flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-500 font-mono tracking-widest uppercase block">
                  {isStoreIsolated ? '📍 Shared Store View' : '🏬 Flagship Outlets'}
                </span>
                {isStoreIsolated && (
                  <span className="animate-pulse bg-yellow-500/25 border border-yellow-500/40 text-[#FFFF00] text-[8px] font-bold font-mono px-1.5 py-0.5 rounded">
                    ISOLATED
                  </span>
                )}
              </div>

              {isStoreIsolated && activeStore && (
                <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mx-2 text-left space-y-1">
                  <p className="text-[9px] text-slate-400">Showing only the shared store link.</p>
                  <button 
                    onClick={() => {
                      setIsStoreIsolated(false);
                      if (activeStore) {
                        window.location.hash = `#/store/${activeStore.slug}`;
                      }
                    }}
                    className="text-[10px] text-yellow-500 font-bold underline cursor-pointer hover:text-white block"
                  >
                    Reset & View All Outlets
                  </button>
                </div>
              )}

              <div className="space-y-1 px-2">
                {(isStoreIsolated && activeStore
                  ? stores.filter(s => s.id === activeStore.id)
                  : stores
                ).map((s) => {
                  const isSelected = activeStore?.id === s.id;
                  return (
                    <div key={s.id} className="space-y-1">
                      <div className="flex gap-1 items-stretch">
                        <button
                          onClick={() => {
                            handleStoreChoice(s);
                            setActiveTab('explore');
                            setIsSidebarOpen(false);
                          }}
                          className={`flex-grow text-left px-3.5 py-2 rounded-xl text-xs font-bold flex flex-col transition-all cursor-pointer gap-0.5 border ${
                            isSelected
                              ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold'
                              : 'bg-slate-900/40 text-slate-350 border-transparent hover:border-slate-850'
                          }`}
                        >
                          <p className="truncate leading-none uppercase">{s.name}</p>
                          <span className={`text-[9px] font-mono ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                            {s.slug}
                          </span>
                        </button>

                        <button
                          onClick={() => shareStoreLink(s)}
                          className="p-2.5 bg-slate-900 hover:bg-slate-850 border border-transparent hover:border-slate-850/60 rounded-xl text-slate-400 hover:text-yellow-500 flex items-center justify-center transition-all cursor-pointer"
                          title="Share store unique link"
                        >
                          <Share2 className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </div>

                      {isSelected && (
                        <div className="mx-2 p-2.5 rounded-lg bg-slate-900/50 border border-slate-850 text-[10px] text-slate-300 font-mono space-y-1 block">
                          <p className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{s.phone}</span>
                          </p>
                          <p className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                            <a 
                              href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-yellow-500 underline hover:text-yellow-400 break-words"
                            >
                              {s.address}
                            </a>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* AUTHENTICATION LIGHT OVERLAYS */}
        {(authView === 'login' || authView === 'signup') && !currentUser && (
          <div className="flex-1 flex flex-col justify-center items-center py-12 px-4 z-10 w-full">
            <div className="w-full max-w-sm">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left lightning-focus focus-within:ring-2 focus-within:ring-yellow-500">
                <h3 className="text-md font-bold font-display uppercase tracking-wide text-white mb-2">
                  {authView === 'login' ? '🔒 SECURE WORKSPACE IDENTITY' : '📋 USER RECRUIT REGISTRY'}
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-mono">
                  Enforcing strict corporate administrative control over access.
                </p>

                {authError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                    ⚠ {authError}
                  </div>
                )}
                {authSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3.5 rounded-lg mb-4 font-mono">
                    ✓ {authSuccess}
                  </div>
                )}

                {authView === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">EMAIL ACCESS PARAMETER</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. name@domain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">DECRYPTION SECRET KEY</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-350 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold h-10 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_12px_rgba(234,179,8,0.4)] cursor-pointer"
                    >
                      {authLoading ? 'Verifying access key...' : 'DECRYPT ACCESS PORTAL'}
                    </button>

                    <div className="pt-2 text-center flex items-center justify-between text-xs">
                      <button type="button" onClick={() => setAuthView('signup')} className="text-yellow-500 hover:underline">
                        Apply for account
                      </button>
                      <button type="button" onClick={() => { setCurrentUser(null); setAuthView('guest'); }} className="text-slate-400 hover:underline">
                        Browse as Guest →
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">FULL DISPLAY USERNAME</label>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">GMAIL ACCOUNT ADDRESS</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 block text-left">
                        <label className="text-[10px] font-bold text-slate-400 tracking-wider">PASSWORD *</label>
                        <input
                          type="password"
                          required
                          placeholder="Min 6 chars"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none"
                        />
                      </div>
                      <div className="space-y-1 block text-left">
                        <label className="text-[10px] font-bold text-slate-400 tracking-wider">PHONE *</label>
                        <input
                          type="text"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block">GENDER IDENTIFICATION *</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setSignupGender('Man')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border transition-all cursor-pointer ${
                            signupGender === 'Man' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          ♂ Man
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignupGender('Woman')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border transition-all cursor-pointer ${
                            signupGender === 'Woman' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          ♀ Woman
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block">CHOOSE ACCOUNT LEVEL</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setSignupRole('Customer')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border ${
                            signupRole === 'Customer' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-slate-950 border-slate-850 text-slate-400'
                          }`}
                        >
                          Customer (Auto-approved)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignupRole('Store Owner')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border ${
                            signupRole === 'Store Owner' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-slate-950 border-slate-850 text-slate-400'
                          }`}
                        >
                          Store Owner (Needs Approve)
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold h-10 rounded-lg text-xs tracking-wider uppercase transition-all shadow-md cursor-pointer"
                    >
                      {authLoading ? 'Transmitting clearance registers...' : 'TRANSMIT CLEARANCE REQUEST'}
                    </button>

                    <div className="pt-2 text-center">
                      <button type="button" onClick={() => setAuthView('login')} className="text-yellow-500 text-xs hover:underline">
                        Back to secure login
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE APP PANELS LAYOUT */}
        {((currentUser || authView === 'guest') && activeTab === 'explore') && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-y-auto">
            
            {/* PANEL 1: PRODUCT CATALOG GRID (lg:col-span-6) */}
            <section className="lg:col-span-5 h-full space-y-4 text-left">
              <div className="glass p-4">
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center gap-2">
                      <Package className="w-4 h-4 text-yellow-500" />
                      Product Catalog Grid
                    </h4>
                    {activeStore ? (
                      <div className="space-y-1 mt-1">
                        <p className="subtitle-desc text-slate-400 text-xs leading-snug">
                          {activeStore.description}
                        </p>
                        <p className="text-[11px] text-yellow-500 font-medium flex items-center gap-1.5 mt-1 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-2 py-1 w-fit">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Hours: <strong className="font-mono">{activeStore.openingTime || '09:00'} - {activeStore.closingTime || '21:00'}</strong></span>
                        </p>
                      </div>
                    ) : (
                      <p className="subtitle-desc text-slate-400 text-xs mt-1">Please selection a storefront outlet to browse items.</p>
                    )}
                  </div>
                  {activeStore && (
                    <button
                      onClick={() => shareStoreLink(activeStore)}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-yellow-500 text-[10px] font-bold text-yellow-500 hover:text-[#FFFF00] px-3 py-1.5 rounded-xl shrink-0 flex items-center gap-1.5 transition-all cursor-pointer font-mono tracking-tight"
                      title="Share this store unique link"
                    >
                      <Share2 className="w-3.5 h-3.5 shrink-0" />
                      <span>SHARE STORE</span>
                    </button>
                  )}
                </div>
                
                {activeStore && (
                  <div className="mt-3 pt-2.5 border-t border-slate-900/60 flex items-center justify-between text-[10px] font-mono text-slate-400 gap-2 flex-wrap">
                    <span className="truncate">Unique Route: <span className="text-[#FFFF00]">#/store/{activeStore.slug}</span></span>
                    {isStoreIsolated && (
                      <span className="text-[9px] bg-yellow-500/15 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/20 font-bold uppercase tracking-tight animate-pulse">Isolated Viewer Mode</span>
                    )}
                  </div>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center italic text-slate-500 text-xs">
                  This catalog outlet is currently stocking up. Check back shortly!
                </div>
              ) : (
                /* Compact product catalog grid (4 items per row on mobile, 6 items per row on desktop) */
                <div className="grid grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProductDetails(p);
                        setDetailQuantity(1);
                      }}
                      className="bg-slate-900/60 border border-slate-850 hover:border-yellow-500 rounded-xl overflow-hidden p-2 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow hover:shadow-yellow-500/10 min-h-[140px]"
                    >
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-950 relative">
                        <CatalogImage src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        {p.stock === 0 && (
                          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center text-[8px] font-bold text-red-400 uppercase">
                            Out of Stock
                          </div>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-bold text-slate-200 truncate leading-none">{p.name}</p>
                        <p className="text-[10px] text-yellow-500 font-mono font-bold">€{p.price.toFixed(2)}</p>
                      </div>

                      {/* stand-out Yellow Highlighted Buttons */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p, 1);
                        }}
                        disabled={p.stock === 0}
                        className="w-full mt-2 bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-black text-[9px] py-1 rounded transition-colors uppercase cursor-pointer block"
                      >
                        {p.stock === 0 ? 'Empty' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PANEL 2: CLEAN CHECKOUT & ORDER FLOW (lg:col-span-4) */}
            <section className="lg:col-span-4 h-full space-y-4 text-left">
              {/* CART CHANNELS LIST */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center justify-between border-b border-slate-800 pb-2">
                  <span>🛍 Active Cart Checkout</span>
                  <span className="font-mono text-xs bg-slate-950 px-2.5 py-0.5 rounded text-yellow-500 border border-white/5">
                    {totalCartUnits} Items
                  </span>
                </h4>

                {cart.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center italic">Your checkout cart options are empty. Select catalog items to continue.</p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {cart.map((row) => (
                      <div key={row.product.id} className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between gap-3">
                        <img src={row.product.imageUrl} alt={row.product.name} className="w-10 h-10 object-cover rounded-md shrink-0 bg-slate-900" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate leading-normal">{row.product.name}</p>
                          <p className="text-[10px] text-yellow-500 font-mono">€{(row.product.price * row.quantity).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => updateCartQuantity(row.product.id, -1)} className="w-5 h-5 bg-slate-900 hover:bg-slate-800 rounded flex items-center justify-center text-xs text-slate-400">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono font-bold text-white">{row.quantity}</span>
                          <button onClick={() => updateCartQuantity(row.product.id, 1)} className="w-5 h-5 bg-slate-900 hover:bg-slate-800 rounded flex items-center justify-center text-xs text-slate-400">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    <div className="border-t border-slate-800 pt-3 flex justify-between items-center text-xs">
                      <p className="font-bold text-slate-350">Subtotal Cost:</p>
                      <p className="font-mono font-bold text-yellow-500 text-sm">€{totalCartCost.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* QUANTITY PASS CHECKOUT FORM SHEET PANEL */}
              {totalCartUnits >= 1 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                  <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center gap-2 border-b border-slate-800 pb-2">
                    <CheckCircle className="w-4 h-4 text-yellow-500" />
                    Place Checkout Order
                  </h4>

                  {checkoutError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-3 rounded-md font-mono">
                      {checkoutError}
                    </div>
                  )}

                  {checkoutSuccessMessage && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs p-3 rounded-md font-mono">
                      ✓ {checkoutSuccessMessage}
                    </div>
                  )}

                  <form onSubmit={handlePlaceOrder} className="space-y-4">
                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Your Name (Signature) *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. John Doe"
                        value={checkoutName}
                        onChange={(e) => setCheckoutName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Telephone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +39 352..."
                        value={checkoutPhone}
                        onChange={(e) => setCheckoutPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-250 outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Shipping Method Options</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setCheckoutType('Pickup')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border transition-all ${
                            checkoutType === 'Pickup' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-slate-950 border-slate-850 text-slate-400'
                          }`}
                        >
                          Pickup Outlet
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckoutType('Delivery')}
                          className={`h-9 rounded-lg text-xs font-bold font-sans border transition-all ${
                            checkoutType === 'Delivery' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-slate-950 border-slate-850 text-slate-400'
                          }`}
                        >
                          Delivery Drop
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Operational Hours Time-slot</label>
                      <select
                        value={checkoutTimeSlot}
                        onChange={(e) => setCheckoutTimeSlot(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none font-mono"
                      >
                        <option value="10:00 - 11:00">10:00 - 11:00 (Breakfast Slot)</option>
                        <option value="12:00 - 13:00">12:00 - 13:00 (Lunch Slot)</option>
                        <option value="14:00 - 15:00">14:00 - 15:00 (Noon Slot)</option>
                        <option value="18:00 - 19:00">18:00 - 19:00 (Evening Slot)</option>
                      </select>
                    </div>

                    {checkoutType === 'Delivery' && (
                      <div className="space-y-1 block">
                        <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">Delivery Location Coordinates *</label>
                        <textarea
                          rows={2}
                          required
                          placeholder="e.g. Viale del Corso 44, Rome"
                          value={checkoutAddress}
                          onChange={(e) => setCheckoutAddress(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 outline-none"
                        />
                      </div>
                    )}

                    {/* S3 Image Validation field profile */}
                    <div className="space-y-1 block">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase font-mono">Drop Photograph Profile Validation</label>
                      <div className="flex gap-2 items-center mt-1">
                        <input
                          type="text"
                          placeholder="S3 verification reference"
                          value={checkoutDropPhoto}
                          onChange={(e) => setCheckoutDropPhoto(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none font-mono"
                        />
                        <label className="bg-slate-800 hover:bg-slate-705 border border-slate-700 h-10 px-3.5 flex items-center justify-center shrink-0 rounded-lg text-xs cursor-pointer text-slate-200">
                          <Upload className="w-4 h-4" />
                          <input type="file" accept="image/*" onChange={handleDropPhotoUpload} className="hidden" />
                        </label>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingDropImage}
                      className="w-full bg-[#FFFF00] hover:bg-yellow-400 text-slate-950 font-black h-11 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(234,179,8,0.4)] cursor-pointer"
                    >
                      {uploadingDropImage ? 'Transmitting image S3 fields...' : 'PROCEED TO CHECKOUT'}
                    </button>
                  </form>
                </div>
              )}

              {/* HISTORICAL TRACKERS LIST */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center justify-between border-b border-slate-800 pb-2">
                  <span>📦 Chronicles & Live Order Tracking</span>
                  <span className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded font-mono font-bold uppercase">{myOrders.length} records</span>
                </h4>

                {!currentUser && (
                  <div className="space-y-2 block">
                    <p className="text-[10px] text-slate-400 font-mono">Guest? Enter checkout telephone number to trace order queue:</p>
                    <div className="flex bg-slate-950 border border-slate-850 rounded-lg h-9 overflow-hidden px-1">
                      <input
                        type="tel"
                        placeholder="e.g. +39 352..."
                        value={orderQueryPhone}
                        onChange={(e) => setOrderQueryPhone(e.target.value)}
                        className="w-full bg-transparent border-none text-xs text-slate-100 outline-none px-2"
                      />
                    </div>
                  </div>
                )}

                {myOrders.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center italic">No historical orders mapped to details.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {myOrders.map((o) => (
                      <div key={o.id} className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-1.5 text-[11px] font-mono shadow-xs">
                        <div className="flex justify-between items-center border-b border-slate-900 pb-1">
                          <p className="font-bold text-yellow-500">#{o.id.slice(-6).toUpperCase()}</p>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            o.status === 'Pending' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                            o.status === 'Confirmed' ? 'bg-sky-950 text-sky-450 border border-sky-850' :
                            o.status === 'Preparing' ? 'bg-indigo-950 text-indigo-400 border border-indigo-850' :
                            o.status === 'Ready' ? 'bg-purple-950 text-purple-400 border border-purple-850' :
                            o.status === 'Completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-850' :
                            'bg-red-950 text-red-500'
                          }`}>
                            {o.status}
                          </span>
                        </div>
                        <div className="text-slate-350">
                          {o.items.map((rowItem, idx) => (
                            <p key={idx} className="leading-tight">
                              {rowItem.name} x {rowItem.quantity}
                            </p>
                          ))}
                        </div>
                        <div className="flex justify-between items-center text-[10px] pt-1 text-slate-400">
                          <p>Total: €{o.totalPrice.toFixed(2)}</p>
                          <p>{new Date(o.createdAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* PANEL 3: DIRECT RETAIL CHAT (lg:col-span-2) */}
            <section className="lg:col-span-3 h-full space-y-4 text-left">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-col justify-between h-[550px]">
                <div>
                  <h4 className="font-sans font-bold text-white text-sm uppercase flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-yellow-500" />
                    Direct Retail Chat
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono mb-2 leading-snug">
                    Connect contextual threading sessions immediately to active storefront.
                  </p>
                </div>

                {/* Message logs stream */}
                <div className="flex-1 overflow-y-auto mb-4 space-y-2 pr-1 font-sans text-xs">
                  {chatMessages.length === 0 ? (
                    <p className="text-slate-500 italic text-center py-10">No messages in dialogue yet.</p>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.senderId === (currentUser ? currentUser.id : 'guest-session');
                      return (
                        <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto text-right items-end' : 'mr-auto text-left items-start'}`}>
                          <span className="text-[8px] text-slate-500 font-mono font-bold uppercase">{msg.senderName} ({msg.senderRole})</span>
                          <div className={`p-2.5 rounded-xl mt-0.5 leading-snug ${isMe ? 'bg-yellow-500 text-slate-950 font-semibold rounded-tr-xs' : 'bg-slate-950 border text-slate-200 rounded-tl-xs'}`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendChatMessage} className="flex gap-1.5 pt-2 border-t border-slate-800 shrink-0">
                  <input
                    type="text"
                    required
                    placeholder="Enter chat message logs..."
                    value={activeChatText}
                    onChange={(e) => setActiveChatText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg h-10 px-3 text-xs text-slate-200 outline-none focus:border-yellow-500"
                  />
                  <button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-black text-xs px-4 rounded-lg cursor-pointer">
                    Send
                  </button>
                </form>
              </div>
            </section>
          </div>
        )}

        {/* LOCATIONS TAB VIEW FOR CUSTOMERS & GUESTS */}
        {activeTab === 'locations' && (
          <div className="flex-1 p-6 overflow-y-auto w-full text-left space-y-6">
            <header className="glass p-6 rounded-3xl border border-slate-800 space-y-2">
              <h2 className="text-xl font-bold font-display uppercase text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-yellow-500" />
                <span>Our Flagship Store Locations</span>
              </h2>
              <p className="text-xs text-slate-400">
                Browse our current active retail outlets, view their opening and closing hours, and jump directly into any store to view its local inventory.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stores.map((s) => {
                const isActive = activeStore?.id === s.id;
                return (
                  <div
                    key={s.id}
                    className={`glass rounded-3xl border overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:border-slate-700 ${
                      isActive ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-slate-800/80 bg-slate-900/40'
                    }`}
                  >
                    <div className="aspect-video w-full bg-slate-900 relative">
                      <img src={s.photoUrl || "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800"} alt={s.name} className="w-full h-full object-cover" />
                      {isActive && (
                        <div className="absolute top-3 left-3 bg-yellow-500 text-slate-950 text-[10px] font-bold font-mono px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                          Currently Active Store
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-white uppercase tracking-tight">{s.name}</h3>
                        <p className="text-xs text-slate-450 leading-relaxed">{s.description}</p>
                        
                        <div className="pt-3 border-t border-slate-900/60 space-y-2 text-xs font-mono text-slate-300">
                          <p className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            <span>{s.address}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                            <span>{s.phone}</span>
                          </p>
                          <p className="flex items-center gap-2 text-yellow-500 bg-yellow-500/5 border border-yellow-500/10 rounded-xl px-3 py-2 w-fit mt-1">
                            <Clock className="w-4 h-4 shrink-0" />
                            <span className="font-sans font-bold text-xs uppercase text-slate-200">
                              Hours: <span className="text-yellow-550 font-mono tracking-wide">{s.openingTime || '09:00'} - {s.closingTime || '21:00'}</span>
                            </span>
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          handleStoreChoice(s);
                          setActiveTab('explore');
                          setIsSidebarOpen(false);
                        }}
                        className="w-full bg-slate-950 hover:bg-yellow-500 hover:text-slate-950 text-yellow-500 font-bold font-sans text-xs uppercase h-11 rounded-xl transition-all border border-slate-800 hover:border-yellow-500 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Visit Store & Browse Items</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COMPONENT MODULES TAB SWITCH DETAILS */}
        {currentUser && activeTab === 'settings' && (
          <div className="flex-1 p-6 overflow-y-auto w-full">
            <SettingsPanel user={currentUser} token={token} onProfileUpdated={handleProfileUpdate} />
          </div>
        )}

        {currentUser && ['stores', 'users', 'catalog', 'orders', 'delivery', 'pos'].includes(activeTab) && (
          <div className="flex-1 p-6 overflow-y-auto w-full">
            <AdminPanel token={token} currentUser={currentUser} activeTab={activeTab as any} onTabChange={setActiveTab as any} />
          </div>
        )}
      </div>

      {/* DETAIL MODAL OVERLAYS */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-850 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl scale-100 transition-all text-left">
            <div className="aspect-video w-full bg-slate-900 relative">
              <CatalogImage src={selectedProductDetails.imageUrl} alt={selectedProductDetails.name} className="w-full h-full object-cover" />
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-950/80 backdrop-blur-sm border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <h3 className="font-sans font-black text-white text-lg tracking-tight leading-none">
                  {selectedProductDetails.name}
                </h3>
                <span className="text-[10px] text-slate-500 uppercase font-mono tracking-widest font-bold mt-1.5 block">
                  Product Details Specification
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed leading-normal">
                {selectedProductDetails.description || 'No detailed descriptor mapped onto product specifications.'}
              </p>

              <div className="flex justify-between items-center text-xs border-y border-slate-900 py-3 font-mono">
                <div>
                  <p className="text-slate-500 uppercase text-[9px]">Stock Availability</p>
                  <p className={`font-bold mt-0.5 ${selectedProductDetails.stock === 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {selectedProductDetails.stock === 0 ? 'SOLD OUT' : `${selectedProductDetails.stock} units left`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 uppercase text-[9px]">Base Unit Cost</p>
                  <p className="font-bold text-yellow-500 mt-0.5">€{selectedProductDetails.price.toFixed(2)}</p>
                </div>
              </div>

              {selectedProductDetails.stock > 0 && (
                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-1.5 border border-slate-850 bg-slate-900/40 p-1 rounded-xl shrink-0">
                    <button
                      onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                      className="w-8 h-8 bg-slate-950 hover:bg-slate-900 rounded-lg flex items-center justify-center text-slate-400"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center font-bold font-mono text-sm text-white">
                      {detailQuantity}
                    </span>
                    <button
                      onClick={() => setDetailQuantity(Math.min(selectedProductDetails.stock, detailQuantity + 1))}
                      className="w-8 h-8 bg-slate-950 hover:bg-slate-900 rounded-lg flex items-center justify-center text-slate-400"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      addToCart(selectedProductDetails, detailQuantity);
                      setSelectedProductDetails(null);
                    }}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-black py-3 rounded-xl text-xs uppercase transition-all shadow-md cursor-pointer text-center"
                  >
                    Add to Cart • €{(selectedProductDetails.price * detailQuantity).toFixed(2)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating WhatsApp support shortcut */}
      <a
        href="https://wa.me/393520586823"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white px-4.5 py-3 rounded-full shadow-[0_8px_30px_rgb(37,211,102,0.3)] hover:scale-105 active:scale-95 transition-all font-sans font-bold text-xs uppercase tracking-wider border border-emerald-400 cursor-pointer"
        id="whatsapp-support-float"
        title="Need assistance? Chat on WhatsApp"
      >
        <Phone className="w-3.5 h-3.5 text-white animate-bounce" />
        <span>Chat on WhatsApp</span>
      </a>

      {/* FOOTER BRANDS */}
      <footer className="mt-8 py-5 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center px-6 gap-4 text-center z-10 glass">
        <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
          Enterprise Multi-tenant Platform © Hasib's Superstore Company
        </span>
        <div className="flex gap-4 font-mono text-[10px] text-slate-450 uppercase tracking-tighter">
          <span>Active Flagships: {stores.length}</span>
          <span>Zero Promotional Alteration</span>
          <span>S3 put storage secure</span>
        </div>
      </footer>
    </div>
  );
}
