import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types.js';
import { Save, Lock, Mail, Smartphone, UserCheck, MapPin, UploadCloud, Image as ImageIcon, Check, AlertCircle, Cloud } from 'lucide-react';
import { googleSignIn, initAuth, logoutGoogle } from '../lib/driveAuth.js';

interface SettingsPanelProps {
  user: User;
  token: string | null;
  onProfileUpdated: (updatedUser: User) => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  'https://images.unsplash.com/photo-1527983359383-4758693f760c?w=150',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
];

export default function SettingsPanel({ user, token, onProfileUpdated }: SettingsPanelProps) {
  const [username, setUsername] = useState(user.username || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [gender, setGender] = useState<'Man' | 'Woman'>(user.gender || 'Man');
  const [deliveryLocation, setDeliveryLocation] = useState(user.deliveryLocation || '');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    initAuth(
      (googleUser, googleToken) => {
        // Token is automatically managed and cached in memory
      },
      () => {
        // No active Google session
      }
    );
  }, []);

  const handleConnectGoogle = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await googleSignIn();
      if (result) {
        const { user: gUser } = result;
        const gEmail = (gUser.email || '').toLowerCase();

        let currentAccounts = [...(user.googleDriveAccounts || [])];
        if (user.googleDriveConnected && user.googleDriveEmail && !currentAccounts.some(a => a.email === user.googleDriveEmail.toLowerCase())) {
          currentAccounts.push({ email: user.googleDriveEmail.toLowerCase(), isActive: true });
        }

        const exists = currentAccounts.find(a => a.email === gEmail);
        if (!exists) {
          currentAccounts.push({ email: gEmail, isActive: true });
        } else {
          exists.isActive = true;
        }

        const updatedAccounts = currentAccounts.map(acc => {
          if (acc.email === gEmail) return { ...acc, isActive: true };
          return acc;
        });

        const response = await fetch('/api/users/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            username,
            email,
            phone,
            gender,
            googleDriveConnected: true,
            googleDriveEmail: gEmail,
            googleDriveAccounts: updatedAccounts
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update Google Drive profile connection.');
        }

        onProfileUpdated(data.user);
        setSuccessMsg(`Perfect! Connected Google Drive successfully to ${gEmail}! Product photos will auto-save to Drive.`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed connecting Google Drive account.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleToggleAccountActive = async (targetEmail: string) => {
    setGoogleLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let currentAccounts = [...(user.googleDriveAccounts || [])];
      if (user.googleDriveConnected && user.googleDriveEmail && !currentAccounts.some(a => a.email === user.googleDriveEmail.toLowerCase())) {
        currentAccounts.push({ email: user.googleDriveEmail.toLowerCase(), isActive: true });
      }

      const updatedAccounts = currentAccounts.map(acc => {
        if (acc.email === targetEmail) {
          return { ...acc, isActive: !acc.isActive };
        }
        return acc;
      });

      const firstActive = updatedAccounts.find(a => a.isActive);
      const isConnected = !!firstActive;

      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          email,
          phone,
          gender,
          googleDriveConnected: isConnected,
          googleDriveEmail: firstActive ? firstActive.email : '',
          googleDriveAccounts: updatedAccounts
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to change action state.');
      }

      onProfileUpdated(data.user);
      setSuccessMsg(`Updated sync state of ${targetEmail}!`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error toggling storage sync email.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRemoveAccount = async (targetEmail: string) => {
    if (!window.confirm(`Are you sure you want to completely disconnect Google account: ${targetEmail}?`)) {
      return;
    }
    setGoogleLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let currentAccounts = [...(user.googleDriveAccounts || [])];
      if (user.googleDriveConnected && user.googleDriveEmail && !currentAccounts.some(a => a.email === user.googleDriveEmail.toLowerCase())) {
        currentAccounts.push({ email: user.googleDriveEmail.toLowerCase(), isActive: true });
      }

      const updatedAccounts = currentAccounts.filter(acc => acc.email !== targetEmail);
      const firstActive = updatedAccounts.find(a => a.isActive);
      const isConnected = updatedAccounts.length > 0;

      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          email,
          phone,
          gender,
          googleDriveConnected: isConnected,
          googleDriveEmail: firstActive ? firstActive.email : (updatedAccounts[0]?.email || ''),
          googleDriveAccounts: updatedAccounts
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove synced Google account.');
      }

      onProfileUpdated(data.user);
      setSuccessMsg(`Successfully disconnected storage sync of ${targetEmail}!`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error removing connected Google account.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm("Are you sure you want to disconnect all Google Drive accounts completely? New products will use local fallback storage.")) {
      return;
    }
    setGoogleLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await logoutGoogle();
      
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          email,
          phone,
          gender,
          googleDriveConnected: false,
          googleDriveEmail: '',
          googleDriveAccounts: []
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to disconnect cloud accounts.');
      }

      onProfileUpdated(data.user);
      setSuccessMsg(`Disconnected all Google Drive storage integrations completely.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error disconnecting cloud integration.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Invalid file format. Please select or drop a valid image file (JPG, PNG, WebP, etc.).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Image file size exceeds the 8MB storage limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      if (base64String) {
        setAvatar(base64String);
        setSuccessMsg('Successfully loaded image from your device! Click "Save Profile Changes" below to secure it.');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to decode the image file from device storage.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!username.trim()) {
      setErrorMsg('Display Username is required.');
      setLoading(false);
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Phone Number is required.');
      setLoading(false);
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid Gmail / Email address.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/users/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            username,
            phone,
            email,
            avatar,
            gender,
            newPassword: newPassword || undefined
          })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update settings profile.');
      }

      // If location is specified, save location as well
      if (deliveryLocation !== (user.deliveryLocation || '')) {
        await fetch('/api/users/location', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ deliveryLocation })
        });
        data.user.deliveryLocation = deliveryLocation;
      }

      setSuccessMsg('Retail profile settings updated permanently! Credentials survive browser refreshes.');
      onProfileUpdated(data.user);
      setNewPassword('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-left">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center text-slate-950 font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-white text-lg">
              Manage Profile Settings
            </h3>
            <p className="text-xs text-slate-400">
              Review roles, update official contact channels, coordinates, and change access passwords.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/15 border border-red-500/35 text-red-200 text-xs p-3.5 rounded-lg mb-5 font-mono">
            ⚠ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 text-xs p-3.5 rounded-lg mb-5 font-mono">
            ✓ {successMsg}
          </div>
        )}

        <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-mono">Active Assigned Workspace Duty</p>
            <p className="text-md font-bold text-yellow-500 mt-1">{user.role}</p>
          </div>
          {user.storeId && (
            <div className="bg-slate-900 px-3 py-1.5 border border-white/5 rounded-lg text-xs font-mono">
              <span className="text-slate-500 uppercase block">Assigned Store ID</span>
              <span className="text-slate-300 font-bold">{user.storeId}</span>
            </div>
          )}
        </div>

        {['Master Admin', 'Admin', 'Store Owner'].includes(user.role) && (
          <div className="bg-slate-950/70 p-5 border border-slate-800 rounded-xl mb-6 space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-yellow-500/15 border border-yellow-500/20 text-yellow-500 flex items-center justify-center">
                <Cloud className="w-5 h-5 opacity-80" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-slate-200 text-sm">Google Drive Multi-Account Backup</h4>
                <p className="text-[11px] text-slate-400">Sync multiple Google / Gmail accounts. Files will auto-upload to your Active accounts and automatically fall back to Standby accounts if one becomes full.</p>
              </div>
            </div>

            {/* List of Connected Accounts */}
            {(() => {
              // Convert existing single accounts flags to list for compatibility
              let accountsList = [...(user.googleDriveAccounts || [])];
              if (user.googleDriveConnected && user.googleDriveEmail && !accountsList.some(a => a.email.toLowerCase() === user.googleDriveEmail.toLocaleLowerCase())) {
                accountsList.push({ email: user.googleDriveEmail.toLowerCase(), isActive: true });
              }

              return (
                <div className="space-y-3">
                  {accountsList.length > 0 ? (
                    <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                      {accountsList.map((acc, index) => {
                        const isPrimary = user.googleDriveEmail?.toLowerCase() === acc.email.toLowerCase();
                        return (
                          <div key={index} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all hover:bg-slate-900/70">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-200 font-mono text-left block truncate max-w-[200px] sm:max-w-xs">{acc.email}</span>
                                {isPrimary && (
                                  <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                                    Primary Target
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                {acc.isActive 
                                  ? "🟢 Active. Products uploaded here render instantly globally." 
                                  : "⚪ Standby. Used for automated instant backup failovers."
                                }
                              </p>
                            </div>

                            <div className="flex items-center gap-3.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleAccountActive(acc.email)}
                                className={`text-[10px] px-2.5 py-1.5 border rounded-lg font-bold uppercase tracking-wider font-mono cursor-pointer transition-all ${
                                  acc.isActive 
                                    ? "bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/20" 
                                    : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700/60"
                                }`}
                              >
                                {acc.isActive ? "Active Sync Target" : "Standby Failover"}
                              </button>
                              
                              <button
                                type="button"
                                disabled={googleLoading || accountsList.length <= 1}
                                onClick={() => handleRemoveAccount(acc.email)}
                                title={accountsList.length <= 1 ? "To disable sync entirely, disconnect below." : "Disconnect account"}
                                className={`text-xs px-2.5 py-1.5 border rounded-lg font-bold uppercase tracking-wider transition-all ${
                                  accountsList.length <= 1
                                    ? "bg-slate-800/20 text-slate-600 border-slate-800/20 cursor-not-allowed"
                                    : "bg-red-500/10 hover:bg-red-500/25 text-red-400 border-red-500/25 cursor-pointer"
                                }`}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 border border-dashed border-slate-800 rounded-xl text-center bg-slate-900/10 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400 font-sans">No Backing Accounts Configured</p>
                      <p className="text-[10px] text-slate-500 max-w-sm mx-auto">Products you post will temporarily upload to local storage. Link Google account to backup globally.</p>
                    </div>
                  )}

                  {/* Operational Addition Controls */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-slate-800/60">
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={handleConnectGoogle}
                      className="w-full sm:w-auto bg-yellow-500 hover:bg-yellow-600 active:scale-95 text-slate-950 text-xs px-4 py-2.5 font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider font-mono shrink-0"
                    >
                      <Cloud className="w-4 h-4" />
                      {googleLoading ? "Syncing..." : accountsList.length > 0 ? "+ Add another Google Sync Account" : "Link Google Account"}
                    </button>

                    {accountsList.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDisconnectGoogle}
                        className="text-[10px] hover:text-red-400 text-slate-500 uppercase tracking-widest font-bold font-mono transition-colors active:scale-95 cursor-pointer p-1"
                      >
                        Disconnect All Accounts
                      </button>
                    )}
                  </div>

                  {accountsList.length > 0 && (
                    <div className="bg-slate-900/25 p-3.5 border border-yellow-500/10 rounded-lg">
                      <p className="text-[10px] text-yellow-500/80 leading-normal">
                        <strong>💡 Live Failover protection is active:</strong> If you upload product images and one linked Google Drive account has no space left or returns a storage error, our engine automatically detects it in real-time and will attempt backup copying to any other connected Standby failover account without blocking public shoppers.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Options */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300 tracking-wider font-sans block uppercase">
              Official Display Photo & Presets
            </label>
            <div className="grid grid-cols-6 gap-3 pt-1">
              {AVATAR_PRESETS.map((p, idx) => {
                const isSelected = avatar === p;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatar(p)}
                    className={`relative aspect-square rounded-xl overflow-hidden border transition-all duration-200 ${
                      isSelected
                        ? 'border-yellow-500 scale-105 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <img src={p} alt="Preset avatar option" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
            
            {/* Custom URL Option */}
            <div className="mt-2">
              <span className="text-[10px] text-slate-400 font-mono">Or supply custom photo URL link:</span>
              <input
                type="text"
                placeholder="https://images.unsplash.com/..."
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg h-10 px-3.5 text-xs text-slate-200 mt-1 outline-none focus:border-yellow-500"
              />
            </div>

            {/* Device Drag-and-Drop & Click Photo Upload Area */}
            <div className="mt-4 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Device Storage Upload (Drag & Drop or Touch Selection)
              </span>
              
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                  isDragging 
                    ? 'border-yellow-500 bg-yellow-500/10' 
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                }`}
                id="profile-picture-drag-target"
              >
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                
                {avatar && avatar.startsWith('data:image/') ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-yellow-500 shadow-md">
                      <img src={avatar} alt="Device avatar preview" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-500" />
                      Device Image Pre-loaded
                    </span>
                    <p className="text-[9px] text-slate-500">
                      Click or drop a different image to replace. Size of uploaded data is safe & valid.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 mx-auto border border-slate-800">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-355">
                        Drag & Drop profile image here, or <span className="text-yellow-500 cursor-pointer hover:underline">browse your folders</span>
                      </p>
                      <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider font-mono">
                        Supports photo, avatar snapshots, or gallery camera PNG/JPG (Max 8MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Username */}
            <div className="space-y-1 block">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Full Display Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg h-11 px-3.5 text-xs text-slate-200 outline-none focus:border-yellow-500"
              />
            </div>

            {/* Gender Selection */}
            <div className="space-y-1 block">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Gender Identification (Required)
              </label>
              <div className="grid grid-cols-2 gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setGender('Man')}
                  className={`h-full border rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                    gender === 'Man' 
                      ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold shadow-md' 
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  ♂ Man
                </button>
                <button
                  type="button"
                  onClick={() => setGender('Woman')}
                  className={`h-full border rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                    gender === 'Woman' 
                      ? 'bg-yellow-500 text-slate-950 border-yellow-500 font-bold shadow-md' 
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  ♀ Woman
                </button>
              </div>
            </div>

            {/* Official Contact Phone */}
            <div className="space-y-1 block">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Official Contact Phone Number
              </label>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg h-11 px-3 items-center">
                <Smartphone className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-transparent border-none text-xs text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Permanent Gmail Account Editor */}
            <div className="space-y-1 block">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Permanent Gmail Address
              </label>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg h-11 px-3 items-center">
                <Mail className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent border-none text-xs text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Access Password Modifier */}
            <div className="space-y-1 block">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Modify Password Decryption Key
              </label>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg h-11 px-3 items-center">
                <Lock className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
                <input
                  type="password"
                  placeholder="Leave empty to maintain existing pass"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-transparent border-none text-xs text-slate-200 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Delivery Location description sharing */}
          <div className="space-y-1 block">
            <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
              Delivery Location/Physical Address Coordinates
            </label>
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 items-start">
              <MapPin className="w-4 h-4 text-slate-500 mr-2 shrink-0 mt-1" />
              <textarea
                rows={2}
                placeholder="Viale dei Romani 45, Rome, Italy"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-slate-200 outline-none"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            {/* Yellow highlighted high-visibility action buttons strictly styled */}
            <button
              type="submit"
              disabled={loading}
              className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold px-6 py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4 shrink-0" />
              {loading ? 'Committing changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
