import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App gracefully
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Required Google Drive scopes:
// 'https://www.googleapis.com/auth/drive.file' to upload files and manage permissions for files created by this app
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedTokens: Record<string, string> = {}; // email -> access token

// Initialize auth state listener.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const gEmail = user.email || '';
      const token = cachedTokens[gEmail.toLowerCase()] || cachedAccessToken;
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start popup sign in flow with Google and acquire access token for Drive
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    // Force showing Google Account chooser so they can select or add different accounts
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not acquire of Google Drive access token from authentication credentials');
    }

    const email = (result.user.email || '').toLowerCase();
    if (email) {
      cachedTokens[email] = credential.accessToken;
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Google Sign-in/OAuth failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (email?: string): string | null => {
  if (email) {
    return cachedTokens[email.toLowerCase()] || null;
  }
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null, email?: string) => {
  if (email) {
    if (token) {
      cachedTokens[email.toLowerCase()] = token;
    } else {
      delete cachedTokens[email.toLowerCase()];
    }
  }
  cachedAccessToken = token;
};

export const getCachedTokensMap = (): Record<string, string> => {
  return { ...cachedTokens };
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  cachedTokens = {};
};

/**
 * Upload Base64 image data to Google Drive
 * Generates a public web-content URL for global viewing
 */
export async function uploadToGoogleDrive(
  accessToken: string,
  base64String: string,
  filename: string
): Promise<{ id: string; url: string }> {
  let base64Body = base64String;
  let mimeType = 'image/jpeg';

  if (base64String.startsWith('data:')) {
    const parts = base64String.split(';base64,');
    mimeType = parts[0].split(':')[1];
    base64Body = parts[1];
  }

  const boundary = 'superstore_gdrive_upload_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata = {
    name: filename,
    mimeType: mimeType,
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + mimeType + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Body +
    closeDelim;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Google Drive storage upload api error: ${errorData}`);
  }

  const fileData = await response.json();
  const fileId = fileData.id;

  // Set permissions on the uploaded file so public viewers (guests, customers) can load it
  await makeFilePublic(accessToken, fileId);

  // Combine thumbnail and key format
  // Google Drive thumbnail links are high-speed, lightweight, and support direct image rendering
  const publicUrl = `https://drive.google.com/thumbnail?sz=w1000&id=${fileId}`;

  return {
    id: fileId,
    url: publicUrl,
  };
}

/**
 * Update permission object of file to "anyone" reader for global accessibility
 */
async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Could not adjust permissions for Google Drive file ${fileId} automatically: ${errorText}`);
  }
}
